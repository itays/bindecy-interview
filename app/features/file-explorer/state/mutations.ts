import type {
  CreateFileInput,
  CreateFolderInput,
  FileExplorerApi,
} from "~/features/file-explorer/api/file-explorer-api"
import { compareSortKeys, sortKey } from "~/features/file-explorer/domain/sort"
import type { SortKey } from "~/features/file-explorer/domain/sort"
import type { NodeSummary } from "~/features/file-explorer/domain/types"
import { BROWSE_QUERY_KEY, folderKey } from "./explorer-store"
import type { ExplorerState, ExplorerStoreApi, Listing } from "./explorer-store"

/** CRUD commands; each resolves with the API's result once the store reflects it. */
export type ExplorerMutations = {
  createFolder: (input: CreateFolderInput) => Promise<NodeSummary>
  createFile: (input: CreateFileInput) => Promise<NodeSummary>
  deleteNode: (id: string) => Promise<{ deletedIds: string[] }>
}

type Listings = ExplorerState["listings"]
type FolderListings = Listings[string]

/** Lower bound of `key` among the listed `ids`; O(log n) comparisons. */
function sortedIndex(
  ids: readonly string[],
  key: SortKey,
  nodesById: ReadonlyMap<string, NodeSummary>
): number {
  let low = 0
  let high = ids.length

  while (low < high) {
    const middle = (low + high) >>> 1
    const listed = nodesById.get(ids[middle])

    if (!listed) {
      throw new Error(`Listed node "${ids[middle]}" is missing from nodesById`)
    }

    if (compareSortKeys(sortKey(listed), key) < 0) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  return low
}

/**
 * `listing` counting `node`, which is listed when its sorted position lies
 * inside the loaded prefix or the listing is complete. Beyond the prefix
 * the keyset cursor's next page returns it instead. O(log n) comparisons,
 * plus an ids copy when it's listed.
 */
function withCreated(
  listing: Listing,
  node: NodeSummary,
  nodesById: ReadonlyMap<string, NodeSummary>
): Listing {
  // A first page still in flight replaces the listing wholesale (ids and
  // total), and the server answers it after this create, so it includes the
  // node.
  if (listing.ids.length === 0 && listing.status === "loading") {
    return listing
  }

  const index = sortedIndex(listing.ids, sortKey(node), nodesById)

  // A page that arrived after the create already listed and counted it.
  if (listing.ids[index] === node.id) {
    return listing
  }

  if (index === listing.ids.length && listing.nextCursor !== null) {
    return { ...listing, total: listing.total + 1 }
  }

  const ids = listing.ids.slice()
  ids.splice(index, 0, node.id)

  return { ...listing, ids, total: listing.total + 1 }
}

/**
 * `listing` without `id`. An unlisted node is still counted by `total` while
 * pages are pending (it sorts beyond the prefix); a complete listing, or a
 * placeholder whose first page is in flight, never counted it. O(n).
 */
function withDeleted(listing: Listing, id: string): Listing {
  const index = listing.ids.indexOf(id)

  if (index === -1) {
    return listing.nextCursor === null
      ? listing
      : { ...listing, total: listing.total - 1 }
  }

  return {
    ...listing,
    ids: [...listing.ids.slice(0, index), ...listing.ids.slice(index + 1)],
    total: listing.total - 1,
  }
}

/**
 * Adds `childDelta` to the parent's `childCount` and `fileDelta` to the
 * `fileCount` of the parent and every loaded ancestor, replacing each touched
 * summary in `nodesById` (a fresh copy). The walk stops at the first unloaded
 * ancestor, since folders load top-down. O(depth). `matchCount` belongs to the
 * filtered listings, which every mutation drops.
 */
function adjustCounts(
  nodesById: Map<string, NodeSummary>,
  parentId: string | null,
  childDelta: number,
  fileDelta: number
) {
  let id = parentId
  let childStep = childDelta

  while (id !== null && (childStep !== 0 || fileDelta !== 0)) {
    const folder = nodesById.get(id)

    if (folder?.type !== "folder") {
      return
    }

    nodesById.set(id, {
      ...folder,
      childCount: folder.childCount + childStep,
      fileCount: folder.fileCount + fileDelta,
    })
    childStep = 0
    id = folder.parentId
  }
}

/**
 * Only the browse listings, since matches may have changed; `listings`
 * itself when that's already all it holds.
 */
function browseOnly(
  listings: Listings,
  browse: FolderListings | undefined
): Listings {
  if (
    listings[BROWSE_QUERY_KEY] === browse &&
    Object.keys(listings).length === (browse ? 1 : 0)
  ) {
    return listings
  }

  return browse ? { [BROWSE_QUERY_KEY]: browse } : {}
}

/** `set` without `ids`; the same set when none of them is in it. O(ids). */
function without(set: Set<string>, ids: ReadonlySet<string>): Set<string> {
  let next: Set<string> | undefined

  for (const id of ids) {
    if (set.has(id)) {
      next ??= new Set(set)
      next.delete(id)
    }
  }

  return next ?? set
}

function withParentExpanded(
  state: ExplorerState,
  parentId: string | null
): Partial<ExplorerState> {
  return parentId === null || state.expanded.has(parentId)
    ? {}
    : { expanded: new Set(state.expanded).add(parentId) }
}

/**
 * O(log loaded siblings + depth), plus the shallow copies of `nodesById` and
 * the browse listings that every store update of them makes.
 */
function applyCreate(
  state: ExplorerState,
  node: NodeSummary
): Partial<ExplorerState> {
  const nodesById = new Map(state.nodesById).set(node.id, node)
  adjustCounts(nodesById, node.parentId, 1, node.type === "file" ? 1 : 0)

  const browse = state.listings[BROWSE_QUERY_KEY]
  const parentKey = folderKey(node.parentId)
  const parentListing = browse?.[parentKey]
  let nextBrowse = browse

  // Without a parent listing, its first load returns the node.
  if (browse && parentListing) {
    const listing = withCreated(parentListing, node, nodesById)

    if (listing !== parentListing) {
      nextBrowse = { ...browse, [parentKey]: listing }
    }
  }

  return {
    nodesById,
    listings: browseOnly(state.listings, nextBrowse),
    ...withParentExpanded(state, node.parentId),
    activeId: node.id,
    selectedId: node.type === "file" ? node.id : state.selectedId,
  }
}

/**
 * O(deleted + loaded siblings + depth), plus the shallow copies of
 * `nodesById` and the browse listings that every store update of them makes.
 * An unloaded `id` has no known parent, so its parent's listing and counts
 * are left to the next load; everything keyed by `deletedIds` is still
 * cleaned.
 */
function applyDelete(
  state: ExplorerState,
  id: string,
  deletedIds: readonly string[]
): Partial<ExplorerState> {
  const deleted = new Set(deletedIds)
  const node = state.nodesById.get(id)
  const nodesById = new Map(state.nodesById)
  const browse = state.listings[BROWSE_QUERY_KEY]
  const nextBrowse = browse && { ...browse }

  for (const deletedId of deleted) {
    nodesById.delete(deletedId)

    if (nextBrowse) {
      delete nextBrowse[deletedId]
    }
  }

  if (node) {
    const parentKey = folderKey(node.parentId)
    const parentListing = nextBrowse?.[parentKey]

    if (nextBrowse && parentListing) {
      nextBrowse[parentKey] = withDeleted(parentListing, id)
    }

    adjustCounts(
      nodesById,
      node.parentId,
      -1,
      node.type === "file" ? -1 : -node.fileCount
    )
  }

  return {
    nodesById,
    listings: browseOnly(state.listings, nextBrowse),
    expanded: without(state.expanded, deleted),
    selectedId:
      state.selectedId !== null && deleted.has(state.selectedId)
        ? null
        : state.selectedId,
    activeId:
      state.activeId !== null && deleted.has(state.activeId)
        ? null
        : state.activeId,
  }
}

/**
 * CRUD over `api` that patches `store` instead of refetching. Each command
 * awaits the API first: a rejection reaches the caller unchanged and leaves
 * the store untouched; a success is applied in one `setState`, so
 * subscribers never see half of it.
 *
 * Create lists the node in its parent's loaded browse listing (or only bumps
 * `total` when it sorts beyond the loaded prefix), bumps the loaded
 * ancestors' counts, expands the parent in the current mode and makes the
 * node active (and selected for a file). Delete removes the subtree's nodes,
 * its listings and its selection, active and expanded entries, and fixes the
 * counts. Both drop every filtered listing, since matches may have changed.
 *
 * A browse page in flight for a touched listing stays consistent because
 * cursors are keysets: a node inserted before the cursor isn't repeated by
 * the next page, and one beyond the loaded prefix comes with it.
 */
export function createMutations(
  api: FileExplorerApi,
  store: ExplorerStoreApi
): ExplorerMutations {
  function created(node: NodeSummary, action: "createFolder" | "createFile") {
    store.setState((state) => applyCreate(state, node), undefined, action)
    return node
  }

  return {
    createFolder: async (input) =>
      created(await api.createFolder(input), "createFolder"),
    createFile: async (input) =>
      created(await api.createFile(input), "createFile"),
    deleteNode: async (id) => {
      const result = await api.deleteNode(id)
      store.setState(
        (state) => applyDelete(state, id, result.deletedIds),
        undefined,
        "deleteNode"
      )
      return result
    },
  }
}
