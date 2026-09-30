import type { NodeSummary } from "~/features/file-explorer/domain/types"

import { currentQueryKey, folderKey, isFiltering } from "./explorer-store"
import type { ExplorerState, Listing } from "./explorer-store"

type RowBase = {
  /**
   * Stable React/virtualizer key. Node rows use the node id; status rows use
   * `status:<folderKey>`, one slot per listing, since a listing shows at most
   * one status row. The slot key survives loading → error → retry, so an
   * active status row and its measured size persist across the transition.
   */
  key: string
  /** Folder whose listing holds the row; `null` = top level (API convention). */
  folderId: string | null
  /** 0 = top level; `aria-level = depth + 1`. */
  depth: number
}

/** A loaded child of `folderId`. */
export type NodeRow = RowBase & {
  kind: "node"
  id: string
  /** 1-based position in the listing. */
  posinset: number
  /** The listing's real `total`, not the loaded count. */
  setsize: number
}

/** The folder's first page is pending (or not requested yet). */
export type LoadingRow = RowBase & { kind: "loading" }

/** More pages exist; the UI shows "Loading more… `loaded` of `total`". */
export type LoadMoreRow = RowBase & {
  kind: "load-more"
  loaded: number
  total: number
}

/**
 * The folder's last request failed; retrying resumes from the listing's
 * cursor. The folder name is `nodesById.get(folderId)` (none for the top level).
 */
export type ErrorRow = RowBase & { kind: "error"; message: string }

export type StatusRow = LoadingRow | LoadMoreRow | ErrorRow

export type Row = NodeRow | StatusRow

/** Exact row heights in px, as measured in the UI. */
export const ROW_HEIGHT = { folder: 34, file: 50, status: 34 } as const

function requireNode(
  nodesById: ReadonlyMap<string, NodeSummary>,
  id: string
): NodeSummary {
  const node = nodesById.get(id)

  if (!node) {
    throw new Error(`Listed node ${id} is missing from nodesById`)
  }

  return node
}

/**
 * The status row trailing a listing's loaded ids, if any. An error wins over
 * a cursor (retry resumes from it); an idle, complete listing has none.
 */
function statusRow(
  listing: Listing | undefined,
  folderId: string | null,
  depth: number
): StatusRow | null {
  const base = { key: `status:${folderKey(folderId)}`, folderId, depth }

  if (!listing || (listing.status === "loading" && listing.ids.length === 0)) {
    return { ...base, kind: "loading" }
  }

  if (listing.status === "error") {
    return { ...base, kind: "error", message: listing.error ?? "" }
  }

  if (listing.nextCursor !== null) {
    return {
      ...base,
      kind: "load-more",
      loaded: listing.ids.length,
      total: listing.total,
    }
  }

  return null
}

/**
 * The tree's rows in display order for the applied query: each loaded child,
 * the subtree of every expanded folder, and one status row per listing that
 * is loading, failed or partially loaded.
 *
 * O(visible rows): only listings of expanded, visible folders are read, with
 * one `nodesById` lookup and at most one expanded-set lookup per node row.
 * Never reads `matchCount`, which may be stale in browse mode.
 *
 * @throws Error when a listed id has no `nodesById` entry (store invariant).
 */
export function flattenVisibleRows(state: ExplorerState): Row[] {
  const key = currentQueryKey(state)
  const listings = state.listings[key]
  const expanded = isFiltering(state)
    ? state.filterExpanded[key]
    : state.expanded
  const rows: Row[] = []

  // Recursion depth is bounded by the folder depth (~25).
  const visit = (folderId: string | null, depth: number) => {
    const listing = listings?.[folderKey(folderId)]

    if (listing) {
      let posinset = 0

      for (const id of listing.ids) {
        rows.push({
          kind: "node",
          key: id,
          id,
          folderId,
          depth,
          posinset: ++posinset,
          setsize: listing.total,
        })

        if (
          requireNode(state.nodesById, id).type === "folder" &&
          expanded?.has(id)
        ) {
          visit(id, depth + 1)
        }
      }
    }

    const status = statusRow(listing, folderId, depth)

    if (status) {
      rows.push(status)
    }
  }

  visit(null, 0)

  return rows
}

/** Height of `row` in px; node rows look up their type in `nodesById`. */
export function rowHeight(row: Row, state: ExplorerState): number {
  return row.kind === "node"
    ? ROW_HEIGHT[requireNode(state.nodesById, row.id).type]
    : ROW_HEIGHT.status
}
