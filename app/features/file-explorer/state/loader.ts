import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import {
  isQueryActive,
  queryKey,
} from "~/features/file-explorer/domain/filters"
import type { FileQuery } from "~/features/file-explorer/domain/types"
import { BROWSE_QUERY_KEY, currentQueryKey, folderKey } from "./explorer-store"
import type { ExplorerStoreApi } from "./explorer-store"

/** Children per listing page (D8). */
const DEFAULT_PAGE_SIZE = 100

/** Shown for failures that aren't an `ApiError` (which carries its own message). */
export const GENERIC_LOAD_ERROR = "Couldn't load this folder."

export type LoaderOptions = {
  pageSize?: number
}

/**
 * Fetches listings and stats into the store. Every method
 * resolves once its store update is done and never rejects for API failures.
 */
export type Loader = {
  /** Loads the first page of a folder under the current query unless it's already loaded, loading or failed. */
  ensureChildren: (folderId: string | null) => Promise<void>
  /** Loads the next page of a loaded, non-failed listing that has one. */
  loadMore: (folderId: string | null) => Promise<void>
  /** Re-issues the failed request of an errored listing (first or next page). */
  retry: (folderId: string | null) => Promise<void>
  /**
   * Applies a query (inactive = `null`); a no-op for the current key.
   * Aborts the previous filtered query's requests, then, for an active
   * query, loads its count. Never expands or collapses folders.
   */
  applyFilters: (query: FileQuery | null) => Promise<void>
  /** Loads the total file count and, while filtering, the filtered count. */
  loadStats: () => Promise<void>
  /** Aborts every request; later responses are dropped. */
  dispose: () => void
}

/** Requests of one filtered query key share a controller, aborted when the key stops being applied. */
type FilterScope = { key: string; controller: AbortController }

/**
 * Creates the loader. Browse requests run until `dispose`; they aren't
 * aborted by filter changes, since browse listings survive them and would
 * otherwise stay `loading`. Filtered requests are aborted when their key
 * stops being the applied one, and any response under a key that's no
 * longer applied is dropped.
 */
export function createLoader(
  api: FileExplorerApi,
  store: ExplorerStoreApi,
  { pageSize = DEFAULT_PAGE_SIZE }: LoaderOptions = {}
): Loader {
  const lifetime = new AbortController()
  let filterScope: FilterScope | null = null
  /** In-flight page requests: `queryKey → [folderKey, cursor] → promise`. */
  const inFlight = new Map<string, Map<string, Promise<void>>>()

  function endFilterScope() {
    if (filterScope) {
      filterScope.controller.abort()
      inFlight.delete(filterScope.key)
      filterScope = null
    }
  }

  function signalFor(key: string): AbortSignal {
    if (key === BROWSE_QUERY_KEY || lifetime.signal.aborted) {
      return lifetime.signal
    }

    if (filterScope?.key !== key) {
      endFilterScope()
      filterScope = { key, controller: new AbortController() }
    }

    return filterScope.controller.signal
  }

  /** Browse results always land; filtered ones only while their key is applied. */
  function isLive(key: string): boolean {
    return (
      !lifetime.signal.aborted &&
      (key === BROWSE_QUERY_KEY || key === currentQueryKey(store.getState()))
    )
  }

  /**
   * Fetches one page under the current query; `cursor === null` = first
   * page. Deduped while in flight; O(1) bookkeeping per call.
   */
  function fetchPage(
    folderId: string | null,
    cursor: string | null
  ): Promise<void> {
    if (lifetime.signal.aborted) {
      return Promise.resolve()
    }

    const state = store.getState()
    const key = currentQueryKey(state)
    const query = state.appliedQuery
    const requestKey = JSON.stringify([folderKey(folderId), cursor ?? ""])
    let requests = inFlight.get(key)

    if (!requests) {
      requests = new Map()
      inFlight.set(key, requests)
    }

    const pending = requests.get(requestKey)

    if (pending) {
      return pending
    }

    /**
     * Unregisters the request and tells whether its outcome still applies:
     * a scope reset or `dispose` hasn't dropped it, its key is live, its
     * folder wasn't deleted meanwhile and, for a next page, the listing still
     * ends at `cursor`. A first page lands even if a mutation dropped its
     * listing meanwhile, so the folder's loading row can't hang.
     */
    const settle = (): boolean => {
      const slot = inFlight.get(key)

      if (slot?.get(requestKey) !== request) {
        return false
      }

      slot.delete(requestKey)
      const { listings, nodesById } = store.getState()
      const listing = listings[key]?.[folderKey(folderId)]

      return (
        isLive(key) &&
        (folderId === null || nodesById.has(folderId)) &&
        (cursor === null || listing?.nextCursor === cursor)
      )
    }
    const signal = signalFor(key)

    state.setListingStatus(key, folderId, "loading")

    const request = api
      .listChildren(
        {
          folderId,
          limit: pageSize,
          ...(query && { query }),
          ...(cursor !== null && { cursor }),
        },
        signal
      )
      .then(
        (page) => {
          if (settle()) {
            store
              .getState()
              .receivePage(key, folderId, page, { append: cursor !== null })
          }
        },
        (error: unknown) => {
          const aborted =
            error instanceof DOMException && error.name === "AbortError"

          if (settle() && !aborted) {
            const message =
              error instanceof ApiError ? error.message : GENERIC_LOAD_ERROR

            store.getState().setListingError(key, folderId, message)
          }
        }
      )

    requests.set(requestKey, request)

    return request
  }

  /** A failed stats request leaves the previous count in place. */
  async function loadTotal(): Promise<void> {
    try {
      const { fileCount } = await api.getStats({}, lifetime.signal)

      if (isLive(BROWSE_QUERY_KEY)) {
        store.getState().setStats({ total: fileCount })
      }
    } catch {
      // The badge keeps its last known count.
    }
  }

  async function loadFilteredCount(
    query: FileQuery,
    key: string
  ): Promise<void> {
    try {
      const { fileCount } = await api.getStats({ query }, signalFor(key))

      if (isLive(key)) {
        store.getState().setStats({ filtered: fileCount })
      }
    } catch {
      // The badge keeps its last known count for this query.
    }
  }

  function listingOf(folderId: string | null) {
    const state = store.getState()

    return state.listings[currentQueryKey(state)]?.[folderKey(folderId)]
  }

  return {
    ensureChildren: (folderId) => {
      const listing = listingOf(folderId)
      // A first-page `loading` listing with nothing in flight is orphaned
      // (its request was dropped); `fetchPage` reissues it, or returns the
      // pending request.
      const isFirstLoad =
        listing === undefined ||
        (listing.status === "loading" && listing.ids.length === 0)

      return isFirstLoad ? fetchPage(folderId, null) : Promise.resolve()
    },

    loadMore: (folderId) => {
      const listing = listingOf(folderId)

      return listing &&
        listing.nextCursor !== null &&
        listing.status !== "error"
        ? fetchPage(folderId, listing.nextCursor)
        : Promise.resolve()
    },

    retry: (folderId) => {
      const listing = listingOf(folderId)

      if (listing?.status !== "error") {
        return Promise.resolve()
      }

      return fetchPage(
        folderId,
        listing.ids.length > 0 ? listing.nextCursor : null
      )
    },

    applyFilters: async (query) => {
      const applied = query && isQueryActive(query) ? query : null
      const key = applied === null ? BROWSE_QUERY_KEY : queryKey(applied)

      if (key === currentQueryKey(store.getState())) {
        return
      }

      endFilterScope()
      store.getState().applyFilters(applied)

      if (applied !== null) {
        await loadFilteredCount(applied, key)
      }
    },

    loadStats: async () => {
      const { appliedQuery } = store.getState()

      await Promise.all([
        loadTotal(),
        appliedQuery && loadFilteredCount(appliedQuery, queryKey(appliedQuery)),
      ])
    },

    dispose: () => {
      lifetime.abort()
      endFilterScope()
      inFlight.clear()
    },
  }
}
