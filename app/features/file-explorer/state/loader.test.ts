import { describe, expect, it } from "vitest"

import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type {
  FileExplorerApi,
  ListChildrenRequest,
  SearchRequest,
  StatsRequest,
} from "~/features/file-explorer/api/file-explorer-api"
import { EMPTY_QUERY, queryKey } from "~/features/file-explorer/domain/filters"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type {
  FileQuery,
  FileSummary,
  NodeSummary,
  Page,
  SearchHit,
} from "~/features/file-explorer/domain/types"
import { BROWSE_QUERY_KEY, createExplorerStore } from "./explorer-store"
import type { ExplorerStoreApi } from "./explorer-store"
import { GENERIC_LOAD_ERROR, createLoader } from "./loader"

type Call<Request, Response> = {
  request: Request
  signal: AbortSignal | undefined
  resolve: (response: Response) => void
  reject: (error: unknown) => void
}

/** A `FileExplorerApi` whose reads stay pending until the test settles them. */
function createFakeApi() {
  const calls = {
    listChildren: [] as Call<ListChildrenRequest, Page<NodeSummary>>[],
    search: [] as Call<SearchRequest, Page<SearchHit>>[],
    getStats: [] as Call<StatsRequest, { fileCount: number }>[],
  }

  function record<Request, Response>(
    log: Call<Request, Response>[],
    request: Request,
    signal: AbortSignal | undefined
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      log.push({ request, signal, resolve, reject })
    })
  }

  const unused = () => Promise.reject(new Error("Not used by the loader."))

  const api: FileExplorerApi = {
    listChildren: (request, signal) =>
      record(calls.listChildren, request, signal),
    search: (request, signal) => record(calls.search, request, signal),
    getStats: (request, signal) => record(calls.getStats, request, signal),
    getNode: unused,
    createFolder: unused,
    createFile: unused,
    deleteNode: unused,
  }

  return { api, calls }
}

/** The loader loads only folders the store knows, so tests seed folder `f`. */
function setup() {
  const { api, calls } = createFakeApi()
  const store = createExplorerStore()
  const loader = createLoader(api, store)
  const folder: NodeSummary = {
    id: "f",
    name: "f",
    parentId: null,
    type: "folder",
    childCount: 1,
    fileCount: 1,
  }

  store.setState({ nodesById: new Map([["f", folder]]) })

  return { calls, loader, store }
}

function nthCall<T>(log: readonly T[], index: number): T {
  const call = log[index]

  if (call === undefined) {
    throw new Error(`Expected call #${index}, got ${log.length} calls.`)
  }

  return call
}

function file(id: string, parentId: string | null = null): FileSummary {
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
  ids: string[],
  nextCursor: string | null = null,
  total = ids.length
): Page<NodeSummary> {
  return { items: ids.map((id) => file(id)), nextCursor, total }
}

function hits(ancestorIdsPerHit: string[][]): Page<SearchHit> {
  const items = ancestorIdsPerHit.map((ancestorIds, index) => ({
    ...file(`hit-${index}`, ancestorIds.at(-1) ?? null),
    ancestorIds,
  }))

  return { items, nextCursor: null, total: items.length }
}

function listing(
  store: ExplorerStoreApi,
  key: string,
  folderId: string = ROOT_ID
) {
  return store.getState().listings[key]?.[folderId]
}

const photosQuery: FileQuery = { ...EMPTY_QUERY, name: "photo" }
const videoQuery: FileQuery = { ...EMPTY_QUERY, categories: ["video"] }
const photosKey = queryKey(photosQuery)

describe("ensureChildren", () => {
  it("sends one request for concurrent calls and stores the page", async () => {
    const { calls, loader, store } = setup()

    const first = loader.ensureChildren(null)
    const second = loader.ensureChildren(null)

    expect(calls.listChildren).toHaveLength(1)
    expect(nthCall(calls.listChildren, 0).request).toEqual({
      folderId: null,
      limit: 100,
    })
    expect(listing(store, BROWSE_QUERY_KEY)?.status).toBe("loading")

    nthCall(calls.listChildren, 0).resolve(page(["a", "b"], "c1", 5))
    await Promise.all([first, second])

    expect(listing(store, BROWSE_QUERY_KEY)).toMatchObject({
      ids: ["a", "b"],
      nextCursor: "c1",
      total: 5,
      status: "idle",
    })
  })

  it.each<
    [string, (call: Call<ListChildrenRequest, Page<NodeSummary>>) => void]
  >([
    ["loaded", (call) => call.resolve(page(["a"]))],
    ["failed", (call) => call.reject(new ApiError("network", "Offline."))],
  ])("does nothing for a %s listing", async (_, settle) => {
    const { calls, loader } = setup()
    const load = loader.ensureChildren("f")
    settle(nthCall(calls.listChildren, 0))
    await load

    await loader.ensureChildren("f")

    expect(calls.listChildren).toHaveLength(1)
  })

  it("loads under the applied query's key", async () => {
    const { calls, loader, store } = setup()
    void loader.applyFilters(photosQuery)

    const load = loader.ensureChildren("f")
    nthCall(calls.listChildren, 0).resolve(page(["a"]))
    await load

    expect(nthCall(calls.listChildren, 0).request.query).toEqual(photosQuery)
    expect(listing(store, photosKey, "f")?.ids).toEqual(["a"])
    expect(listing(store, BROWSE_QUERY_KEY, "f")).toBeUndefined()
  })

  it("drops the first page of a folder deleted while it loads", async () => {
    const { calls, loader, store } = setup()
    const load = loader.ensureChildren("f")

    store.setState({ nodesById: new Map() })
    nthCall(calls.listChildren, 0).resolve(page(["a"]))
    await load

    expect(store.getState().nodesById.has("a")).toBe(false)
    expect(listing(store, BROWSE_QUERY_KEY, "f")?.ids).toEqual([])
  })
})

describe("loadMore", () => {
  it("follows the cursor chain, appending pages until the last one", async () => {
    const { calls, loader, store } = setup()
    const load = loader.ensureChildren(null)
    nthCall(calls.listChildren, 0).resolve(page(["a"], "c1", 3))
    await load

    const second = loader.loadMore(null)
    void loader.loadMore(null)

    expect(calls.listChildren).toHaveLength(2)
    expect(nthCall(calls.listChildren, 1).request.cursor).toBe("c1")
    expect(listing(store, BROWSE_QUERY_KEY)).toMatchObject({
      ids: ["a"],
      status: "loading",
    })

    nthCall(calls.listChildren, 1).resolve(page(["b"], "c2", 3))
    await second
    const third = loader.loadMore(null)
    expect(nthCall(calls.listChildren, 2).request.cursor).toBe("c2")
    nthCall(calls.listChildren, 2).resolve(page(["c"], null, 3))
    await third
    await loader.loadMore(null)

    expect(calls.listChildren).toHaveLength(3)
    expect(listing(store, BROWSE_QUERY_KEY)).toMatchObject({
      ids: ["a", "b", "c"],
      nextCursor: null,
      status: "idle",
    })
  })
})

describe("failures", () => {
  it.each<[string, unknown, string]>([
    [
      "an ApiError",
      new ApiError("network", "The server is unreachable."),
      "The server is unreachable.",
    ],
    ["any other failure", new TypeError("boom"), GENERIC_LOAD_ERROR],
  ])("reports %s as a listing error", async (_, error, message) => {
    const { calls, loader, store } = setup()

    const load = loader.ensureChildren(null)
    nthCall(calls.listChildren, 0).reject(error)
    await load

    expect(listing(store, BROWSE_QUERY_KEY)).toMatchObject({
      status: "error",
      error: message,
    })
  })

  it("never reports an AbortError and reissues the orphaned request", async () => {
    const { calls, loader, store } = setup()

    const load = loader.ensureChildren(null)
    nthCall(calls.listChildren, 0).reject(
      new DOMException("Aborted.", "AbortError")
    )
    await load

    expect(listing(store, BROWSE_QUERY_KEY)).toMatchObject({
      status: "loading",
      error: null,
    })

    void loader.ensureChildren(null)

    expect(calls.listChildren).toHaveLength(2)
  })
})

describe("retry", () => {
  it("reloads the first page of a listing that failed to load", async () => {
    const { calls, loader, store } = setup()
    const load = loader.ensureChildren("f")
    nthCall(calls.listChildren, 0).reject(new ApiError("network", "Offline."))
    await load

    const retry = loader.retry("f")
    nthCall(calls.listChildren, 1).resolve(page(["a"]))
    await retry

    expect(nthCall(calls.listChildren, 1).request.cursor).toBeUndefined()
    expect(listing(store, BROWSE_QUERY_KEY, "f")).toMatchObject({
      ids: ["a"],
      status: "idle",
      error: null,
    })
  })

  it("reloads a failed next page and appends it", async () => {
    const { calls, loader, store } = setup()
    const load = loader.ensureChildren(null)
    nthCall(calls.listChildren, 0).resolve(page(["a"], "c1", 2))
    await load
    const more = loader.loadMore(null)
    nthCall(calls.listChildren, 1).reject(new ApiError("network", "Offline."))
    await more

    await loader.loadMore(null)
    expect(calls.listChildren).toHaveLength(2)

    const retry = loader.retry(null)
    nthCall(calls.listChildren, 2).resolve(page(["b"], null, 2))
    await retry

    expect(nthCall(calls.listChildren, 2).request.cursor).toBe("c1")
    expect(listing(store, BROWSE_QUERY_KEY)).toMatchObject({
      ids: ["a", "b"],
      status: "idle",
    })
  })

  it("does nothing for a listing that hasn't failed", async () => {
    const { calls, loader } = setup()
    const load = loader.ensureChildren(null)
    nthCall(calls.listChildren, 0).resolve(page(["a"], "c1", 2))
    await load

    await loader.retry(null)

    expect(calls.listChildren).toHaveLength(1)
  })
})

describe("applyFilters", () => {
  it.each<[string, FileQuery | null]>([
    ["a newer query", videoQuery],
    ["cleared filters", null],
  ])(
    "aborts the previous query's requests and ignores their late results after %s",
    async (_, next) => {
      const { calls, loader, store } = setup()
      const applied = loader.applyFilters(photosQuery)
      const loads = [loader.ensureChildren(null), loader.ensureChildren("f")]

      void loader.applyFilters(next)

      const previous = [
        ...calls.listChildren,
        nthCall(calls.search, 0),
        nthCall(calls.getStats, 0),
      ]
      expect(previous.every((call) => call.signal?.aborted)).toBe(true)

      nthCall(calls.listChildren, 0).resolve(page(["a"]))
      nthCall(calls.listChildren, 1).reject(new ApiError("network", "Late."))
      nthCall(calls.search, 0).resolve(hits([["a", "b"]]))
      nthCall(calls.getStats, 0).resolve({ fileCount: 4 })
      await Promise.all([applied, ...loads])

      const state = store.getState()
      expect(Object.keys(state.listings)).toEqual([])
      expect(state.filterExpanded).toEqual({})
      expect(state.stats.filtered).toBeNull()
    }
  )

  it("drops a late page from an earlier application of the same query", async () => {
    const { calls, loader, store } = setup()
    void loader.applyFilters(photosQuery)
    const stale = loader.ensureChildren(null)
    void loader.applyFilters(videoQuery)
    void loader.applyFilters(photosQuery)

    const fresh = loader.ensureChildren(null)
    nthCall(calls.listChildren, 0).resolve(page(["stale"]))
    await stale

    expect(calls.listChildren).toHaveLength(2)
    expect(listing(store, photosKey)?.status).toBe("loading")

    nthCall(calls.listChildren, 1).resolve(page(["fresh"]))
    await fresh

    expect(listing(store, photosKey)?.ids).toEqual(["fresh"])
  })

  it("lets a browse request started before a filter change land", async () => {
    const { calls, loader, store } = setup()
    const load = loader.ensureChildren(null)

    void loader.applyFilters(photosQuery)
    const browseCall = nthCall(calls.listChildren, 0)
    browseCall.resolve(page(["a"]))
    await load

    expect(browseCall.signal?.aborted).toBe(false)
    expect(listing(store, BROWSE_QUERY_KEY)?.ids).toEqual(["a"])
  })

  it("sends nothing when the key doesn't change", async () => {
    const { calls, loader } = setup()

    await loader.applyFilters({ ...EMPTY_QUERY, name: "  " })
    void loader.applyFilters(photosQuery)
    await loader.applyFilters({ ...photosQuery, name: "PHOTO " })

    expect(calls.search).toHaveLength(1)
    expect(calls.getStats).toHaveLength(1)
    expect(nthCall(calls.search, 0).signal?.aborted).toBe(false)
  })

  it("expands exactly the ancestors of the first 50 hits under the new key", async () => {
    const { calls, loader, store } = setup()
    store.getState().toggleExpanded("browse-open")

    const applied = loader.applyFilters(photosQuery)
    nthCall(calls.search, 0).resolve(hits([["a", "b"], ["a", "c"], []]))
    nthCall(calls.getStats, 0).resolve({ fileCount: 3 })
    await applied

    expect(nthCall(calls.search, 0).request).toEqual({
      query: photosQuery,
      limit: 50,
    })
    const state = store.getState()
    expect(state.filterExpanded).toEqual({
      [photosKey]: new Set(["a", "b", "c"]),
    })
    expect(state.expanded).toEqual(new Set(["browse-open"]))
  })

  it("reveals nothing when the search fails", async () => {
    const { calls, loader, store } = setup()

    const applied = loader.applyFilters(photosQuery)
    nthCall(calls.search, 0).reject(new ApiError("network", "Offline."))
    nthCall(calls.getStats, 0).resolve({ fileCount: 3 })
    await applied

    expect(store.getState().filterExpanded).toEqual({})
    expect(store.getState().stats.filtered).toBe(3)
  })
})

describe("loadStats", () => {
  it("loads only the total while browsing", async () => {
    const { calls, loader, store } = setup()

    const stats = loader.loadStats()
    nthCall(calls.getStats, 0).resolve({ fileCount: 10 })
    await stats

    expect(calls.getStats.map((call) => call.request)).toEqual([{}])
    expect(store.getState().stats).toEqual({ total: 10, filtered: null })
  })

  it("stores the total and the filtered count while filtering", async () => {
    const { calls, loader, store } = setup()
    void loader.applyFilters(photosQuery)

    const stats = loader.loadStats()
    const [total, filtered] = [
      nthCall(calls.getStats, 1),
      nthCall(calls.getStats, 2),
    ]
    total.resolve({ fileCount: 10 })
    filtered.resolve({ fileCount: 4 })
    await stats

    expect(total.request).toEqual({})
    expect(filtered.request).toEqual({ query: photosQuery })
    expect(store.getState().stats).toEqual({ total: 10, filtered: 4 })
  })

  it("ignores a filtered count that arrives after the query changed", async () => {
    const { calls, loader, store } = setup()
    void loader.applyFilters(photosQuery)
    const stats = loader.loadStats()

    void loader.applyFilters(videoQuery)
    nthCall(calls.getStats, 1).resolve({ fileCount: 10 })
    nthCall(calls.getStats, 2).resolve({ fileCount: 4 })
    await stats

    expect(store.getState().stats).toEqual({ total: 10, filtered: null })
  })

  it("keeps the last counts when a request fails", async () => {
    const { calls, loader, store } = setup()
    const first = loader.loadStats()
    nthCall(calls.getStats, 0).resolve({ fileCount: 10 })
    await first

    const second = loader.loadStats()
    nthCall(calls.getStats, 1).reject(new ApiError("network", "Offline."))
    await second

    expect(store.getState().stats.total).toBe(10)
  })
})

describe("dispose", () => {
  it("aborts every request, drops late results and sends no new ones", async () => {
    const { calls, loader, store } = setup()
    const load = loader.ensureChildren(null)
    void loader.applyFilters(photosQuery)

    loader.dispose()
    nthCall(calls.listChildren, 0).resolve(page(["a"]))
    await load
    await loader.ensureChildren("f")

    expect(
      [...calls.listChildren, ...calls.search, ...calls.getStats].every(
        (call) => call.signal?.aborted
      )
    ).toBe(true)
    expect(calls.listChildren).toHaveLength(1)
    expect(listing(store, BROWSE_QUERY_KEY)?.ids).toEqual([])
  })
})
