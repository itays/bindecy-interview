import { describe, expect, it } from "vitest"

import { EMPTY_QUERY, queryKey } from "~/features/file-explorer/domain/filters"
import type {
  FileSummary,
  FolderSummary,
  NodeSummary,
  Page,
} from "~/features/file-explorer/domain/types"
import {
  BROWSE_QUERY_KEY,
  createExplorerStore,
} from "~/features/file-explorer/state/explorer-store"
import type { ExplorerStoreApi } from "~/features/file-explorer/state/explorer-store"
import { flattenVisibleRows } from "~/features/file-explorer/state/visible-rows"
import type { Row } from "~/features/file-explorer/state/visible-rows"
import { resolveTreeKey } from "./tree-keyboard"

function folder(
  id: string,
  parentId: string | null,
  childCount: number
): FolderSummary {
  return { id, name: id, parentId, type: "folder", childCount, fileCount: 0 }
}

function file(id: string, parentId: string | null): FileSummary {
  return {
    id,
    name: id,
    parentId,
    type: "file",
    category: "image",
    sizeInBytes: 1_000,
  }
}

function page(
  items: NodeSummary[],
  nextCursor: string | null = null,
  total = items.length
): Page<NodeSummary> {
  return { items, nextCursor, total }
}

/**
 * Browse fixture, all collapsed:
 * - docs/ (drafts/ (plan), readme)
 * - empty/ (no children)
 * - logo
 */
function browseStore() {
  const store = createExplorerStore()
  const { receivePage } = store.getState()

  receivePage(
    BROWSE_QUERY_KEY,
    null,
    page([
      folder("docs", null, 2),
      folder("empty", null, 0),
      file("logo", null),
    ]),
    { append: false }
  )
  receivePage(
    BROWSE_QUERY_KEY,
    "docs",
    page([folder("drafts", "docs", 1), file("readme", "docs")]),
    { append: false }
  )
  receivePage(BROWSE_QUERY_KEY, "drafts", page([file("plan", "drafts")]), {
    append: false,
  })

  return store
}

function expand(store: ExplorerStoreApi, ...ids: string[]) {
  for (const id of ids) store.getState().toggleExpanded(id)
  return store
}

function rowsOf(store: ExplorerStoreApi) {
  return flattenVisibleRows(store.getState())
}

function indexOf(rows: Row[], label: string) {
  const index = rows.findIndex((row) =>
    row.kind === "node"
      ? row.id === label
      : `${row.folderId ?? "top"}:${row.kind}` === label
  )
  if (index < 0) throw new Error(`No row ${label}`)
  return index
}

function press(store: ExplorerStoreApi, label: string, key: string) {
  const rows = rowsOf(store)
  return resolveTreeKey(rows, indexOf(rows, label), key, store.getState())
}

describe("resolveTreeKey without an active row", () => {
  it("returns null for every key when there are no rows", () => {
    const store = createExplorerStore()

    for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter"]) {
      expect(resolveTreeKey([], -1, key, store.getState())).toBeNull()
      expect(resolveTreeKey([], 0, key, store.getState())).toBeNull()
    }
  })

  it.each([
    [-1, "ArrowDown", { type: "move", index: 0 }],
    [-1, "Home", { type: "move", index: 0 }],
    [-1, "ArrowUp", { type: "move", index: 2 }],
    [3, "End", { type: "move", index: 2 }],
    [3, "ArrowRight", null],
    [-1, "Enter", null],
    [-1, "Delete", null],
  ])("at index %i maps %s to %o", (activeIndex, key, expected) => {
    const store = browseStore()

    expect(
      resolveTreeKey(rowsOf(store), activeIndex, key, store.getState())
    ).toEqual(expected)
  })
})

describe("resolveTreeKey vertical movement", () => {
  // Rows: docs, empty, logo
  it.each([
    ["docs", "ArrowDown", { type: "move", index: 1 }],
    ["docs", "ArrowUp", null],
    ["docs", "Home", null],
    ["docs", "End", { type: "move", index: 2 }],
    ["logo", "ArrowDown", null],
    ["logo", "ArrowUp", { type: "move", index: 1 }],
    ["logo", "Home", { type: "move", index: 0 }],
    ["logo", "End", null],
  ])("on %s maps %s to %o", (label, key, expected) => {
    expect(press(browseStore(), label, key)).toEqual(expected)
  })
})

describe("resolveTreeKey ArrowRight", () => {
  it("expands a collapsed folder with children", () => {
    expect(press(browseStore(), "docs", "ArrowRight")).toEqual({
      type: "toggle",
      id: "docs",
    })
  })

  it("ignores a collapsed folder without children", () => {
    expect(press(browseStore(), "empty", "ArrowRight")).toBeNull()
  })

  it("moves from an expanded folder to its first child", () => {
    const store = expand(browseStore(), "docs")

    expect(press(store, "docs", "ArrowRight")).toEqual({
      type: "move",
      index: indexOf(rowsOf(store), "drafts"),
    })
  })

  it("moves to the loading row of an expanded folder whose first page is pending", () => {
    const store = browseStore()
    store
      .getState()
      .receivePage(
        BROWSE_QUERY_KEY,
        null,
        page([folder("docs", null, 2), folder("fresh", null, 3)]),
        { append: false }
      )
    expand(store, "fresh")

    expect(press(store, "fresh", "ArrowRight")).toEqual({
      type: "move",
      index: indexOf(rowsOf(store), "fresh:loading"),
    })
  })

  it("stays on an expanded folder whose loaded listing is empty", () => {
    const store = expand(browseStore(), "empty")
    store
      .getState()
      .receivePage(BROWSE_QUERY_KEY, "empty", page([]), { append: false })

    expect(press(store, "empty", "ArrowRight")).toBeNull()
  })

  it("ignores files and status rows", () => {
    const store = browseStore()
    store
      .getState()
      .receivePage(BROWSE_QUERY_KEY, null, page([file("logo", null)], "c", 5), {
        append: false,
      })

    expect(press(store, "logo", "ArrowRight")).toBeNull()
    expect(press(store, "top:load-more", "ArrowRight")).toBeNull()
  })
})

describe("resolveTreeKey ArrowLeft", () => {
  it("collapses an expanded folder", () => {
    const store = expand(browseStore(), "docs")

    expect(press(store, "docs", "ArrowLeft")).toEqual({
      type: "toggle",
      id: "docs",
    })
  })

  it("moves from a nested file to its parent folder past deeper rows", () => {
    const store = expand(browseStore(), "docs", "drafts")
    const rows = rowsOf(store)

    expect(press(store, "readme", "ArrowLeft")).toEqual({
      type: "move",
      index: indexOf(rows, "docs"),
    })
    expect(press(store, "plan", "ArrowLeft")).toEqual({
      type: "move",
      index: indexOf(rows, "drafts"),
    })
  })

  it("moves from a status row to its folder", () => {
    const store = expand(browseStore(), "docs")
    store.getState().setListingError(BROWSE_QUERY_KEY, "docs", "boom")

    expect(press(store, "docs:error", "ArrowLeft")).toEqual({
      type: "move",
      index: indexOf(rowsOf(store), "docs"),
    })
  })

  it.each(["empty", "logo"])("ignores the top-level row %s", (label) => {
    expect(press(browseStore(), label, "ArrowLeft")).toBeNull()
  })
})

describe("resolveTreeKey activation", () => {
  it.each(["Enter", " "])("%j toggles a folder and selects a file", (key) => {
    const store = browseStore()

    expect(press(store, "docs", key)).toEqual({ type: "toggle", id: "docs" })
    expect(press(store, "logo", key)).toEqual({ type: "select", id: "logo" })
  })

  it.each(["Enter", " "])("%j loads more on a load-more row", (key) => {
    const store = expand(browseStore(), "docs")
    store
      .getState()
      .receivePage(
        BROWSE_QUERY_KEY,
        "docs",
        page([file("readme", "docs")], "c", 9),
        { append: false }
      )

    expect(press(store, "docs:load-more", key)).toEqual({
      type: "load-more",
      folderId: "docs",
    })
  })

  it.each(["Enter", " "])("%j retries on a top-level error row", (key) => {
    const store = browseStore()
    store.getState().setListingError(BROWSE_QUERY_KEY, null, "boom")

    expect(press(store, "top:error", key)).toEqual({
      type: "retry",
      folderId: null,
    })
  })

  it.each(["Enter", " "])("%j does nothing on a loading row", (key) => {
    const store = createExplorerStore()

    expect(press(store, "top:loading", key)).toBeNull()
  })
})

describe("resolveTreeKey other keys", () => {
  it("deletes a node row but not a status row", () => {
    const store = browseStore()
    store.getState().setListingError(BROWSE_QUERY_KEY, null, "boom")

    expect(press(store, "logo", "Delete")).toEqual({
      type: "delete",
      id: "logo",
    })
    expect(press(store, "top:error", "Delete")).toBeNull()
  })

  it("ignores unknown keys", () => {
    expect(press(browseStore(), "docs", "a")).toBeNull()
  })

  it("throws when a node row has no nodesById entry", () => {
    const store = browseStore()
    const rows = rowsOf(store)
    store.setState({ nodesById: new Map() })

    expect(() =>
      resolveTreeKey(rows, 0, "Enter", store.getState())
    ).toThrowError("docs")
  })
})

describe("resolveTreeKey while filtering", () => {
  it("keeps a folder expanded before filtering expanded", () => {
    const store = expand(browseStore(), "docs")
    const query = { ...EMPTY_QUERY, name: "read" }
    store.getState().applyFilters(query)
    store
      .getState()
      .receivePage(queryKey(query), null, page([folder("docs", null, 2)]), {
        append: false,
      })

    expect(press(store, "docs", "ArrowLeft")).toEqual({
      type: "toggle",
      id: "docs",
    })
  })
})
