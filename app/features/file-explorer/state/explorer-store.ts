import { createStore } from "zustand/vanilla"
import type { StoreApi } from "zustand/vanilla"

import {
  isQueryActive,
  matchesFile,
  queryKey,
} from "~/features/file-explorer/domain/filters"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type {
  FileQuery,
  FileSummary,
  NodeSummary,
  Page,
} from "~/features/file-explorer/domain/types"

/**
 * Query key of the unfiltered listings. `queryKey()` always yields a JSON
 * array (`[...]`), so this can never collide with a filtered key.
 */
export const BROWSE_QUERY_KEY = "browse"

export type ListingStatus = "idle" | "loading" | "error"

/** The loaded prefix of one folder's children under one query. */
export type Listing = {
  /** Loaded child ids in listing order; `total` may be larger. */
  ids: string[]
  /** Cursor of the next page; `null` once every page is loaded. */
  nextCursor: string | null
  total: number
  status: ListingStatus
  /** User-facing message, set only when `status` is `"error"`. */
  error: string | null
}

/** File counts for the header badge; `null` until loaded. */
export type ExplorerStats = {
  /** Files in the whole tree. */
  total: number | null
  /** Files matching the applied query; `null` when unfiltered or not loaded yet. */
  filtered: number | null
}

export type ExplorerState = {
  nodesById: Map<string, NodeSummary>
  /** `listings[queryKey][folderKey(folderId)]`. */
  listings: Record<string, Record<string, Listing>>
  /** Expanded folders in browse mode. */
  expanded: Set<string>
  /** Expanded folders per filtered query key; only the applied key is kept. */
  filterExpanded: Record<string, Set<string>>
  /** `null` = unfiltered. Never an inactive query. */
  appliedQuery: FileQuery | null
  selectedId: string | null
  activeId: string | null
  /** Latest message for a polite live region. */
  announcement: string
  stats: ExplorerStats
}

export type ExplorerActions = {
  receivePage: (
    queryKey: string,
    folderId: string | null,
    page: Page<NodeSummary>,
    options: { append: boolean }
  ) => void
  /** Clears any error; use `setListingError` for failures. */
  setListingStatus: (
    queryKey: string,
    folderId: string | null,
    status: Exclude<ListingStatus, "error">
  ) => void
  /** Marks the listing failed and keeps its loaded ids. */
  setListingError: (
    queryKey: string,
    folderId: string | null,
    error: string
  ) => void
  /** Toggles in the browse set, or in the applied query's set while filtering. */
  toggleExpanded: (id: string) => void
  /** Expands `ids` under `queryKey`; ignored unless `queryKey` is the applied filtered key. */
  revealFolders: (queryKey: string, ids: readonly string[]) => void
  select: (id: string | null) => void
  setActive: (id: string | null) => void
  /**
   * Applies a query (an inactive one counts as `null`), drops the state of
   * other filtered keys and clears a selected file that no longer matches (D3).
   */
  applyFilters: (query: FileQuery | null) => void
  /** Merges loaded counts into `stats`. */
  setStats: (stats: Partial<ExplorerStats>) => void
}

export type ExplorerStore = ExplorerState & ExplorerActions

export type ExplorerStoreApi = StoreApi<ExplorerStore>

/** Listing key of a folder; the API's `null` (top level) maps to `ROOT_ID`. */
export function folderKey(folderId: string | null): string {
  return folderId ?? ROOT_ID
}

/** Key of a listing's status row (loading, load-more or error), `status:<folderKey>`. */
export function statusRowKey(folderId: string | null): string {
  return `status:${folderKey(folderId)}`
}

export function isFiltering(state: ExplorerState): boolean {
  return state.appliedQuery !== null
}

export function currentQueryKey(state: ExplorerState): string {
  return state.appliedQuery === null
    ? BROWSE_QUERY_KEY
    : queryKey(state.appliedQuery)
}

const EMPTY_LISTING: Listing = {
  ids: [],
  nextCursor: null,
  total: 0,
  status: "idle",
  error: null,
}

function withListing(
  state: ExplorerState,
  key: string,
  folderId: string | null,
  update: (listing: Listing | undefined) => Listing
): Pick<ExplorerState, "listings"> {
  const byFolder = state.listings[key]
  const folder = folderKey(folderId)

  return {
    listings: {
      ...state.listings,
      [key]: { ...byFolder, [folder]: update(byFolder?.[folder]) },
    },
  }
}

function toggled(set: ReadonlySet<string> | undefined, id: string) {
  const next = new Set(set)

  if (!next.delete(id)) {
    next.add(id)
  }

  return next
}

function ancestorNames(
  nodesById: ReadonlyMap<string, NodeSummary>,
  node: NodeSummary
): string[] {
  const names: string[] = []
  let parent = node.parentId === null ? undefined : nodesById.get(node.parentId)

  while (parent) {
    names.push(parent.name)
    parent =
      parent.parentId === null ? undefined : nodesById.get(parent.parentId)
  }

  return names
}

/** The selected file when it fails `query` (D3), else `null`. */
function staleSelection(
  state: ExplorerState,
  query: FileQuery
): FileSummary | null {
  const selected =
    state.selectedId === null
      ? undefined
      : state.nodesById.get(state.selectedId)

  if (selected?.type !== "file") {
    return null
  }

  return matchesFile(selected, ancestorNames(state.nodesById, selected), query)
    ? null
    : selected
}

export function createExplorerStore(): ExplorerStoreApi {
  return createStore<ExplorerStore>()((set) => ({
    nodesById: new Map(),
    listings: {},
    expanded: new Set(),
    filterExpanded: {},
    appliedQuery: null,
    selectedId: null,
    activeId: null,
    announcement: "",
    stats: { total: null, filtered: null },

    receivePage: (key, folderId, page, { append }) =>
      set((state) => {
        const nodesById = new Map(state.nodesById)

        for (const node of page.items) {
          nodesById.set(node.id, node)
        }

        const pageIds = page.items.map((node) => node.id)
        // An active status row of this listing (loading, load-more or error)
        // hands the active row to the first item it was waiting for, which
        // takes its place in the tree. Otherwise a complete listing leaves
        // nothing active, and a pinned load-more row keeps loading pages.
        const takesActive =
          pageIds.length > 0 &&
          key === currentQueryKey(state) &&
          state.activeId === statusRowKey(folderId)

        return {
          nodesById,
          ...withListing(state, key, folderId, (listing) => ({
            ids: append && listing ? [...listing.ids, ...pageIds] : pageIds,
            nextCursor: page.nextCursor,
            total: page.total,
            status: "idle",
            error: null,
          })),
          ...(takesActive ? { activeId: pageIds[0] } : null),
        }
      }),

    setListingStatus: (key, folderId, status) =>
      set((state) => {
        const listing = state.listings[key]?.[folderKey(folderId)]

        if (listing?.status === status) {
          return state
        }

        return withListing(state, key, folderId, (current) => ({
          ...(current ?? EMPTY_LISTING),
          status,
          error: null,
        }))
      }),

    setListingError: (key, folderId, error) =>
      set((state) =>
        withListing(state, key, folderId, (current) => ({
          ...(current ?? EMPTY_LISTING),
          status: "error",
          error,
        }))
      ),

    toggleExpanded: (id) =>
      set((state) => {
        if (state.appliedQuery === null) {
          return { expanded: toggled(state.expanded, id) }
        }

        const key = queryKey(state.appliedQuery)

        return {
          filterExpanded: {
            ...state.filterExpanded,
            [key]: toggled(state.filterExpanded[key], id),
          },
        }
      }),

    revealFolders: (key, ids) =>
      set((state) => {
        const current = state.filterExpanded[key]

        if (
          state.appliedQuery === null ||
          queryKey(state.appliedQuery) !== key ||
          ids.every((id) => current?.has(id))
        ) {
          return state
        }

        return {
          filterExpanded: {
            ...state.filterExpanded,
            [key]: new Set([...(current ?? []), ...ids]),
          },
        }
      }),

    select: (id) =>
      set((state) => (state.selectedId === id ? state : { selectedId: id })),

    setActive: (id) =>
      set((state) => (state.activeId === id ? state : { activeId: id })),

    setStats: (stats) =>
      set((state) => {
        const next = { ...state.stats, ...stats }

        return next.total === state.stats.total &&
          next.filtered === state.stats.filtered
          ? state
          : { stats: next }
      }),

    applyFilters: (query) =>
      set((state) => {
        const appliedQuery = query && isQueryActive(query) ? query : null
        const key =
          appliedQuery === null ? BROWSE_QUERY_KEY : queryKey(appliedQuery)

        if (key === currentQueryKey(state)) {
          return state
        }

        const stale = appliedQuery && staleSelection(state, appliedQuery)
        const browseListings = state.listings[BROWSE_QUERY_KEY]
        // Filtered listings carry their query's `matchCount`s; refetch them on return.
        const listings: ExplorerState["listings"] = browseListings
          ? { [BROWSE_QUERY_KEY]: browseListings }
          : {}

        return {
          appliedQuery,
          listings,
          filterExpanded: {},
          // The previous query's count must never show under the new one.
          stats: { ...state.stats, filtered: null },
          ...(stale && {
            selectedId: null,
            announcement: `${stale.name} doesn't match the filters and was deselected.`,
          }),
        }
      }),
  }))
}
