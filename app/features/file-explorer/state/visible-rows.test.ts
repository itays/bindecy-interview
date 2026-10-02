import { describe, expect, it } from "vitest"

import { EMPTY_QUERY, queryKey } from "~/features/file-explorer/domain/filters"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type {
  FileSummary,
  FolderSummary,
  NodeSummary,
  Page,
} from "~/features/file-explorer/domain/types"
import { BROWSE_QUERY_KEY, createExplorerStore } from "./explorer-store"
import type { ExplorerStoreApi } from "./explorer-store"
import { ROW_HEIGHT, flattenVisibleRows, rowHeight } from "./visible-rows"
import type { Row } from "./visible-rows"

function folder(id: string, parentId: string | null): FolderSummary {
  return { id, name: id, parentId, type: "folder", childCount: 0, fileCount: 0 }
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

const photoQuery = { ...EMPTY_QUERY, name: "photo" }
const PHOTO_KEY = queryKey(photoQuery)

/**
 * Browse fixture:
 * - docs/ (childCount 2: drafts/, readme)
 *   - drafts/ (plan)
 * - logo
 */
function browseStore() {
  const store = createExplorerStore()
  const { receivePage } = store.getState()

  receivePage(
    BROWSE_QUERY_KEY,
    null,
    page([folder("docs", null), file("logo", null)]),
    { append: false }
  )
  receivePage(
    BROWSE_QUERY_KEY,
    "docs",
    page([folder("drafts", "docs"), file("readme", "docs")]),
    { append: false }
  )
  receivePage(BROWSE_QUERY_KEY, "drafts", page([file("plan", "drafts")]), {
    append: false,
  })

  return store
}

function summary(rows: Row[]) {
  return rows.map((row) =>
    row.kind === "node"
      ? `${"  ".repeat(row.depth)}${row.id}`
      : `${"  ".repeat(row.depth)}[${row.kind}]`
  )
}

describe("flattenVisibleRows nesting", () => {
  it("lists only the top level while every folder is collapsed", () => {
    const rows = flattenVisibleRows(browseStore().getState())

    expect(summary(rows)).toEqual(["docs", "logo"])
  })

  it("nests expanded folders' children at the next depth in listing order", () => {
    const store = browseStore()
    store.getState().toggleExpanded("docs")
    store.getState().toggleExpanded("drafts")

    const rows = flattenVisibleRows(store.getState())

    expect(summary(rows)).toEqual([
      "docs",
      "  drafts",
      "    plan",
      "  readme",
      "logo",
    ])
    expect(
      rows.map((row) => row.kind === "node" && [row.id, row.folderId])
    ).toEqual([
      ["docs", null],
      ["drafts", "docs"],
      ["plan", "drafts"],
      ["readme", "docs"],
      ["logo", null],
    ])
  })

  it("hides the subtree of a collapsed folder even when a descendant is expanded", () => {
    const store = browseStore()
    store.getState().toggleExpanded("drafts")

    expect(summary(flattenVisibleRows(store.getState()))).toEqual([
      "docs",
      "logo",
    ])
  })
})

describe("flattenVisibleRows status rows", () => {
  it("shows a top-level loading row before the root listing exists", () => {
    const rows = flattenVisibleRows(createExplorerStore().getState())

    expect(rows).toEqual([
      { kind: "loading", key: `status:${ROOT_ID}`, folderId: null, depth: 0 },
    ])
  })

  it("shows a loading row at child depth for an expanded folder without a listing", () => {
    const store = createExplorerStore()
    store
      .getState()
      .receivePage(BROWSE_QUERY_KEY, null, page([folder("docs", null)]), {
        append: false,
      })
    store.getState().toggleExpanded("docs")

    expect(flattenVisibleRows(store.getState())[1]).toEqual({
      kind: "loading",
      key: "status:docs",
      folderId: "docs",
      depth: 1,
    })
  })

  it("shows a loading row while the first page is in flight", () => {
    const store = createExplorerStore()
    store.getState().setListingStatus(BROWSE_QUERY_KEY, null, "loading")

    expect(summary(flattenVisibleRows(store.getState()))).toEqual(["[loading]"])
  })

  it("shows only an error row with the message when the first page failed", () => {
    const store = createExplorerStore()
    store.getState().setListingError(BROWSE_QUERY_KEY, null, "Network down")

    expect(flattenVisibleRows(store.getState())).toEqual([
      {
        kind: "error",
        key: `status:${ROOT_ID}`,
        folderId: null,
        depth: 0,
        message: "Network down",
      },
    ])
  })

  it("puts the error row after the loaded ids instead of a load-more row", () => {
    const store = createExplorerStore()
    const { receivePage, setListingError } = store.getState()
    receivePage(BROWSE_QUERY_KEY, null, page([file("a", null)], "c1", 5), {
      append: false,
    })
    setListingError(BROWSE_QUERY_KEY, null, "Network down")

    expect(summary(flattenVisibleRows(store.getState()))).toEqual([
      "a",
      "[error]",
    ])
  })

  it.each(["idle", "loading"] as const)(
    "adds a trailing load-more row with loaded/total while %s with a cursor",
    (status) => {
      const store = createExplorerStore()
      const { receivePage, setListingStatus } = store.getState()
      receivePage(
        BROWSE_QUERY_KEY,
        null,
        page([file("a", null), file("b", null)], "c1", 7),
        { append: false }
      )
      setListingStatus(BROWSE_QUERY_KEY, null, status)

      const rows = flattenVisibleRows(store.getState())

      expect(summary(rows)).toEqual(["a", "b", "[load-more]"])
      expect(rows[2]).toMatchObject({ loaded: 2, total: 7, depth: 0 })
    }
  )

  it("shows no row for an empty, fully loaded folder", () => {
    const store = createExplorerStore()
    const { receivePage, toggleExpanded } = store.getState()
    receivePage(BROWSE_QUERY_KEY, null, page([folder("empty", null)]), {
      append: false,
    })
    receivePage(BROWSE_QUERY_KEY, "empty", page([]), { append: false })
    toggleExpanded("empty")

    expect(summary(flattenVisibleRows(store.getState()))).toEqual(["empty"])
  })
})

describe("flattenVisibleRows positions", () => {
  it("numbers node rows from 1 and uses the listing's total as setsize", () => {
    const store = createExplorerStore()
    store
      .getState()
      .receivePage(
        BROWSE_QUERY_KEY,
        null,
        page([file("a", null), file("b", null)], "c1", 250),
        { append: false }
      )

    const nodes = flattenVisibleRows(store.getState()).filter(
      (row) => row.kind === "node"
    )

    expect(nodes.map((row) => [row.posinset, row.setsize])).toEqual([
      [1, 250],
      [2, 250],
    ])
  })
})

describe("flattenVisibleRows query keys", () => {
  it("keeps folders expanded across a filter and reads the filtered listings", () => {
    const store = browseStore()
    const { applyFilters, receivePage, toggleExpanded } = store.getState()
    toggleExpanded("docs")
    applyFilters(photoQuery)

    expect(summary(flattenVisibleRows(store.getState()))).toEqual(["[loading]"])

    receivePage(PHOTO_KEY, null, page([folder("docs", null)]), {
      append: false,
    })

    expect(summary(flattenVisibleRows(store.getState()))).toEqual([
      "docs",
      "  [loading]",
    ])

    receivePage(PHOTO_KEY, "docs", page([file("photo", "docs")]), {
      append: false,
    })

    expect(summary(flattenVisibleRows(store.getState()))).toEqual([
      "docs",
      "  photo",
    ])
  })

  it("ignores filtered listings while browsing", () => {
    const store = browseStore()
    const before = flattenVisibleRows(store.getState())
    store.getState().receivePage(PHOTO_KEY, null, page([file("photo", null)]), {
      append: false,
    })

    expect(flattenVisibleRows(store.getState())).toEqual(before)
  })

  it("restores the browse rows when filters are cleared", () => {
    const store = browseStore()
    store.getState().toggleExpanded("docs")
    const before = flattenVisibleRows(store.getState())
    const { applyFilters, receivePage } = store.getState()
    applyFilters(photoQuery)
    receivePage(PHOTO_KEY, null, page([folder("docs", null)]), {
      append: false,
    })
    applyFilters(null)

    expect(flattenVisibleRows(store.getState())).toEqual(before)
  })
})

describe("flattenVisibleRows keys", () => {
  it("keeps each row's key across calls and after appending a page", () => {
    const store = createExplorerStore()
    const { receivePage } = store.getState()
    receivePage(BROWSE_QUERY_KEY, null, page([file("a", null)], "c1", 3), {
      append: false,
    })
    const keys = () =>
      flattenVisibleRows(store.getState()).map((row) => row.key)
    const first = keys()

    expect(first).toEqual(["a", `status:${ROOT_ID}`])
    expect(keys()).toEqual(first)

    receivePage(BROWSE_QUERY_KEY, null, page([file("b", null)], "c2", 3), {
      append: true,
    })

    expect(keys()).toEqual(["a", "b", `status:${ROOT_ID}`])
  })

  it("keeps a folder's status key from loading through error", () => {
    const store = createExplorerStore()
    store.getState().setListingStatus(BROWSE_QUERY_KEY, null, "loading")
    const [loading] = flattenVisibleRows(store.getState())
    store.getState().setListingError(BROWSE_QUERY_KEY, null, "Network down")
    const [error] = flattenVisibleRows(store.getState())

    expect([loading.kind, error.kind]).toEqual(["loading", "error"])
    expect(error.key).toBe(loading.key)
  })

  it("gives every row in one result a distinct key", () => {
    const store = browseStore()
    const { receivePage, toggleExpanded } = store.getState()
    receivePage(
      BROWSE_QUERY_KEY,
      "drafts",
      page([file("plan", "drafts")], "c1", 2),
      {
        append: false,
      }
    )
    toggleExpanded("docs")
    toggleExpanded("drafts")
    receivePage(
      BROWSE_QUERY_KEY,
      null,
      page([folder("docs", null), folder("new", null)], "c1", 9),
      {
        append: false,
      }
    )
    toggleExpanded("new")

    const keys = flattenVisibleRows(store.getState()).map((row) => row.key)

    expect(keys).toEqual([
      "docs",
      "drafts",
      "plan",
      "status:drafts",
      "readme",
      "new",
      "status:new",
      `status:${ROOT_ID}`,
    ])
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe("rowHeight", () => {
  it.each([
    ["folder node", 0, ROW_HEIGHT.folder],
    ["file node", 1, ROW_HEIGHT.file],
    ["load-more", 2, ROW_HEIGHT.status],
  ])("sizes a %s row", (_, index, height) => {
    const store = createExplorerStore()
    store
      .getState()
      .receivePage(
        BROWSE_QUERY_KEY,
        null,
        page([folder("docs", null), file("logo", null)], "c1", 4),
        { append: false }
      )
    const state = store.getState()

    expect(rowHeight(flattenVisibleRows(state)[index], state)).toBe(height)
  })

  it.each([
    ["loading", () => {}],
    [
      "error",
      (store: ExplorerStoreApi) =>
        store.getState().setListingError(BROWSE_QUERY_KEY, null, "Failed"),
    ],
  ])("sizes a %s row as a status row", (kind, arrange) => {
    const store = createExplorerStore()
    arrange(store)
    const state = store.getState()
    const [row] = flattenVisibleRows(state)

    expect(row.kind).toBe(kind)
    expect(rowHeight(row, state)).toBe(ROW_HEIGHT.status)
  })
})

/** Counts `get` calls, to prove which nodes the walk touched. */
class CountingMap<K, V> extends Map<K, V> {
  gets = 0

  override get(key: K): V | undefined {
    this.gets++
    return super.get(key)
  }
}

describe("flattenVisibleRows cost", () => {
  it("touches only visible rows when a huge folder is collapsed", () => {
    const BIG = 5_000
    const store = createExplorerStore()
    const { receivePage, toggleExpanded } = store.getState()
    const children = Array.from({ length: BIG }, (_, index) =>
      folder(`big-${index}`, "big")
    )
    receivePage(
      BROWSE_QUERY_KEY,
      null,
      page([folder("big", null), file("logo", null)]),
      { append: false }
    )
    receivePage(BROWSE_QUERY_KEY, "big", page(children), { append: false })
    for (const child of children.slice(0, 500)) {
      receivePage(
        BROWSE_QUERY_KEY,
        child.id,
        page([file(`${child.id}-f`, child.id)]),
        {
          append: false,
        }
      )
      toggleExpanded(child.id)
    }

    const state = store.getState()
    const nodesById = new CountingMap(state.nodesById)
    const listingReads: PropertyKey[] = []
    const browseListings = new Proxy(state.listings[BROWSE_QUERY_KEY], {
      get(target, property, receiver) {
        listingReads.push(property)
        return Reflect.get(target, property, receiver)
      },
    })

    const rows = flattenVisibleRows({
      ...state,
      nodesById,
      listings: { [BROWSE_QUERY_KEY]: browseListings },
    })

    expect(summary(rows)).toEqual(["big", "logo"])
    expect(nodesById.gets).toBe(rows.length)
    expect(listingReads).toEqual([ROOT_ID])
  })
})
