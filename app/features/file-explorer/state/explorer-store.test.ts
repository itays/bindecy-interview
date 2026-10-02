import { describe, expect, it } from "vitest"

import { EMPTY_QUERY, queryKey } from "~/features/file-explorer/domain/filters"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type {
  FileQuery,
  FileSummary,
  FolderSummary,
  NodeSummary,
  Page,
} from "~/features/file-explorer/domain/types"
import {
  BROWSE_QUERY_KEY,
  createExplorerStore,
  currentQueryKey,
} from "./explorer-store"

function folder(id: string, parentId: string | null, name = id): FolderSummary {
  return { id, name, parentId, type: "folder", childCount: 0, fileCount: 0 }
}

function file(
  id: string,
  parentId: string | null,
  overrides: Partial<FileSummary> = {}
): FileSummary {
  return {
    id,
    name: id,
    parentId,
    type: "file",
    category: "image",
    sizeInBytes: 1_000,
    ...overrides,
  }
}

function page(
  items: NodeSummary[],
  nextCursor: string | null = null,
  total = items.length
): Page<NodeSummary> {
  return { items, nextCursor, total }
}

function query(overrides: Partial<FileQuery>): FileQuery {
  return { ...EMPTY_QUERY, ...overrides }
}

const photosQuery = query({ name: "photo" })
const videoQuery = query({ categories: ["video"] })

describe("receivePage", () => {
  it("replaces the listing's ids, cursor and total", () => {
    const store = createExplorerStore()
    const { receivePage } = store.getState()

    receivePage(BROWSE_QUERY_KEY, null, page([folder("a", null)], "c1", 5), {
      append: false,
    })
    receivePage(BROWSE_QUERY_KEY, null, page([folder("b", null)], null, 1), {
      append: false,
    })

    expect(store.getState().listings[BROWSE_QUERY_KEY][ROOT_ID]).toEqual({
      ids: ["b"],
      nextCursor: null,
      total: 1,
      status: "idle",
      error: null,
    })
  })

  it("appends ids and takes the new page's cursor and total", () => {
    const store = createExplorerStore()
    const { receivePage } = store.getState()

    receivePage(BROWSE_QUERY_KEY, "f", page([file("1", "f")], "c1", 3), {
      append: false,
    })
    receivePage(BROWSE_QUERY_KEY, "f", page([file("2", "f")], "c2", 4), {
      append: true,
    })

    expect(store.getState().listings[BROWSE_QUERY_KEY].f).toMatchObject({
      ids: ["1", "2"],
      nextCursor: "c2",
      total: 4,
    })
  })

  it("clears a previous error once a page arrives", () => {
    const store = createExplorerStore()
    const { receivePage, setListingError } = store.getState()

    setListingError(BROWSE_QUERY_KEY, "f", "Network down")
    receivePage(BROWSE_QUERY_KEY, "f", page([file("1", "f")]), {
      append: true,
    })

    expect(store.getState().listings[BROWSE_QUERY_KEY].f).toMatchObject({
      ids: ["1"],
      status: "idle",
      error: null,
    })
  })

  it("merges nodes into nodesById, updating known ids and keeping others", () => {
    const store = createExplorerStore()
    const { receivePage } = store.getState()
    const renamed = file("1", "f", { name: "renamed.png" })

    receivePage(BROWSE_QUERY_KEY, "f", page([file("1", "f"), file("2", "f")]), {
      append: false,
    })
    receivePage(queryKey(photosQuery), "f", page([renamed]), {
      append: false,
    })

    const { nodesById } = store.getState()
    expect(nodesById.get("1")).toEqual(renamed)
    expect(nodesById.get("2")).toEqual(file("2", "f"))
  })

  it("keeps the listings of other folders and queries by reference", () => {
    const store = createExplorerStore()
    const { receivePage } = store.getState()

    receivePage(BROWSE_QUERY_KEY, null, page([folder("f", null)]), {
      append: false,
    })
    const rootListing = store.getState().listings[BROWSE_QUERY_KEY][ROOT_ID]
    receivePage(BROWSE_QUERY_KEY, "f", page([file("1", "f")]), {
      append: false,
    })

    expect(store.getState().listings[BROWSE_QUERY_KEY][ROOT_ID]).toBe(
      rootListing
    )
  })
})

describe("receivePage with an active status row", () => {
  it("activates the first item of a first page that completes the listing", () => {
    const store = createExplorerStore()
    const { receivePage, setActive } = store.getState()
    setActive("status:f")

    receivePage(BROWSE_QUERY_KEY, "f", page([file("1", "f"), file("2", "f")]), {
      append: false,
    })

    expect(store.getState().activeId).toBe("1")
  })

  it("activates the first appended item when the load-more row is active", () => {
    const store = createExplorerStore()
    const { receivePage, setActive } = store.getState()
    receivePage(BROWSE_QUERY_KEY, "f", page([file("1", "f")], "c1", 3), {
      append: false,
    })
    setActive("status:f")

    receivePage(BROWSE_QUERY_KEY, "f", page([file("2", "f")], "c2", 3), {
      append: true,
    })

    expect(store.getState().activeId).toBe("2")
  })

  it("activates the first top-level item when the root status row is active", () => {
    const store = createExplorerStore()
    const { receivePage, setActive } = store.getState()
    setActive(`status:${ROOT_ID}`)

    receivePage(BROWSE_QUERY_KEY, null, page([folder("a", null)]), {
      append: false,
    })

    expect(store.getState().activeId).toBe("a")
  })

  it("keeps the active row when another listing's page arrives", () => {
    const store = createExplorerStore()
    const { receivePage, setActive } = store.getState()
    setActive("status:f")

    receivePage(BROWSE_QUERY_KEY, "g", page([file("1", "g")]), {
      append: false,
    })

    expect(store.getState().activeId).toBe("status:f")
  })

  it("keeps the active row when the page belongs to a query that isn't applied", () => {
    const store = createExplorerStore()
    const { receivePage, setActive } = store.getState()
    setActive("status:f")

    receivePage(queryKey(photosQuery), "f", page([file("1", "f")]), {
      append: false,
    })

    expect(store.getState().activeId).toBe("status:f")
  })
})

describe("listing status", () => {
  it("keeps loaded ids and cursor when a later page fails", () => {
    const store = createExplorerStore()
    const { receivePage, setListingError } = store.getState()

    receivePage(BROWSE_QUERY_KEY, "f", page([file("1", "f")], "c1", 9), {
      append: false,
    })
    setListingError(BROWSE_QUERY_KEY, "f", "Network down")

    expect(store.getState().listings[BROWSE_QUERY_KEY].f).toEqual({
      ids: ["1"],
      nextCursor: "c1",
      total: 9,
      status: "error",
      error: "Network down",
    })
  })

  it("creates an empty listing for a folder that has none yet", () => {
    const store = createExplorerStore()

    store.getState().setListingStatus(BROWSE_QUERY_KEY, null, "loading")

    expect(store.getState().listings[BROWSE_QUERY_KEY][ROOT_ID]).toEqual({
      ids: [],
      nextCursor: null,
      total: 0,
      status: "loading",
      error: null,
    })
  })

  it("clears the error when retrying", () => {
    const store = createExplorerStore()
    const { setListingError, setListingStatus } = store.getState()

    setListingError(BROWSE_QUERY_KEY, "f", "Network down")
    setListingStatus(BROWSE_QUERY_KEY, "f", "loading")

    expect(store.getState().listings[BROWSE_QUERY_KEY].f).toMatchObject({
      status: "loading",
      error: null,
    })
  })
})

describe("toggleExpanded", () => {
  it("expands and collapses a folder", () => {
    const store = createExplorerStore()
    const { toggleExpanded } = store.getState()

    toggleExpanded("f")
    expect(store.getState().expanded).toEqual(new Set(["f"]))

    toggleExpanded("f")
    expect(store.getState().expanded).toEqual(new Set())
  })

  it("replaces the set instead of mutating it", () => {
    const store = createExplorerStore()
    const before = store.getState().expanded

    store.getState().toggleExpanded("f")

    expect(store.getState().expanded).not.toBe(before)
    expect(before.size).toBe(0)
  })
})

describe("applyFilters", () => {
  it("leaves the expanded set alone, and keeps toggles made while filtering", () => {
    const store = createExplorerStore()
    const { applyFilters, toggleExpanded } = store.getState()

    toggleExpanded("browse-open")
    const browseExpanded = store.getState().expanded
    applyFilters(photosQuery)
    expect(store.getState().expanded).toBe(browseExpanded)

    toggleExpanded("filter-open")
    applyFilters(videoQuery)
    applyFilters(null)

    const state = store.getState()
    expect(state.expanded).toEqual(new Set(["browse-open", "filter-open"]))
    expect(currentQueryKey(state)).toBe(BROWSE_QUERY_KEY)
  })

  it("drops the previous query's listings when switching queries", () => {
    const store = createExplorerStore()
    const { applyFilters, receivePage } = store.getState()
    const photosKey = queryKey(photosQuery)

    receivePage(BROWSE_QUERY_KEY, null, page([folder("f", null)]), {
      append: false,
    })
    const browseListings = store.getState().listings[BROWSE_QUERY_KEY]
    applyFilters(photosQuery)
    receivePage(photosKey, null, page([folder("f", null)]), { append: false })
    applyFilters(videoQuery)

    const state = store.getState()
    expect(currentQueryKey(state)).toBe(queryKey(videoQuery))
    expect(state.listings[photosKey]).toBeUndefined()
    expect(state.listings[BROWSE_QUERY_KEY]).toBe(browseListings)
  })

  it("treats an inactive query as clearing the filters", () => {
    const store = createExplorerStore()
    const { applyFilters } = store.getState()

    applyFilters(photosQuery)
    applyFilters(query({ name: "   " }))

    expect(store.getState().appliedQuery).toBeNull()
  })

  it("keeps the state untouched when the same query is re-applied", () => {
    const store = createExplorerStore()
    const { applyFilters, toggleExpanded } = store.getState()

    applyFilters(photosQuery)
    toggleExpanded("f")
    const before = store.getState()
    applyFilters(query({ name: "PHOTO " }))

    expect(store.getState()).toBe(before)
  })
})

describe("applyFilters selection (D3)", () => {
  function storeWithSelectedFile(selected: FileSummary) {
    const store = createExplorerStore()
    const { receivePage, select } = store.getState()

    receivePage(
      BROWSE_QUERY_KEY,
      null,
      page([folder("trips", null, "Trips")]),
      {
        append: false,
      }
    )
    receivePage(
      BROWSE_QUERY_KEY,
      "trips",
      page([folder("beach", "trips", "Beach photos")]),
      { append: false }
    )
    receivePage(BROWSE_QUERY_KEY, selected.parentId, page([selected]), {
      append: false,
    })
    select(selected.id)

    return store
  }

  it("clears a selected file that fails the query and announces it", () => {
    const store = storeWithSelectedFile(
      file("clip", "trips", { name: "clip.mp4", category: "video" })
    )

    store.getState().applyFilters(query({ categories: ["image"] }))

    const state = store.getState()
    expect(state.selectedId).toBeNull()
    expect(state.announcement).toContain("clip.mp4")
  })

  it("keeps a selected file that matches the query", () => {
    const store = storeWithSelectedFile(
      file("clip", "trips", { name: "clip.mp4", category: "video" })
    )

    store.getState().applyFilters(videoQuery)

    expect(store.getState().selectedId).toBe("clip")
    expect(store.getState().announcement).toBe("")
  })

  it("keeps a file whose name matches only through a grandparent folder", () => {
    const store = storeWithSelectedFile(
      file("sand", "beach", { name: "sand.png" })
    )

    store.getState().applyFilters(query({ name: "trips" }))

    expect(store.getState().selectedId).toBe("sand")
  })

  it("clears a file whose ancestors match the name but not the size", () => {
    const store = storeWithSelectedFile(
      file("sand", "beach", { name: "sand.png", sizeInBytes: 10 })
    )

    store.getState().applyFilters(query({ name: "beach", minBytes: 11 }))

    expect(store.getState().selectedId).toBeNull()
  })

  it("keeps the selection when filters are cleared", () => {
    const store = storeWithSelectedFile(
      file("clip", "trips", { name: "clip.mp4", category: "video" })
    )
    const { applyFilters } = store.getState()

    applyFilters(videoQuery)
    applyFilters(null)

    expect(store.getState().selectedId).toBe("clip")
    expect(store.getState().announcement).toBe("")
  })
})

describe("stats", () => {
  it("merges a partial update and skips notifying when nothing changed", () => {
    const store = createExplorerStore()
    const { setStats } = store.getState()
    setStats({ total: 10 })
    setStats({ filtered: 4 })
    let notifications = 0
    store.subscribe(() => notifications++)

    setStats({ total: 10 })

    expect(store.getState().stats).toEqual({ total: 10, filtered: 4 })
    expect(notifications).toBe(0)
  })

  it.each<[string, FileQuery | null]>([
    ["a newer query", videoQuery],
    ["cleared filters", null],
  ])("drops the filtered count and keeps the total after %s", (_, next) => {
    const store = createExplorerStore()
    const { applyFilters, setStats } = store.getState()
    applyFilters(photosQuery)
    setStats({ total: 10, filtered: 4 })

    applyFilters(next)

    expect(store.getState().stats).toEqual({ total: 10, filtered: null })
  })
})

describe("select and setActive", () => {
  it("does not notify subscribers when the id is unchanged", () => {
    const store = createExplorerStore()
    const { select, setActive } = store.getState()
    select("a")
    setActive("a")
    let notifications = 0
    store.subscribe(() => notifications++)

    select("a")
    setActive("a")

    expect(notifications).toBe(0)
  })
})
