import type { NodeSummary } from "./types"

type Sortable = Pick<NodeSummary, "id" | "name" | "type">

/**
 * Position of a node in listing order: `[type rank, lowercased name, id]`.
 * Plain JSON-serializable data, so it can be encoded into a keyset cursor.
 */
export type SortKey = readonly [rank: 0 | 1, name: string, id: string]

// Fixed locale keeps the order deterministic across machines; one shared
// collator is much faster than `localeCompare` per call.
const collator = new Intl.Collator("en")

export function sortKey(node: Sortable): SortKey {
  return [node.type === "folder" ? 0 : 1, node.name.toLowerCase(), node.id]
}

/**
 * Listing order: folders first, then case-insensitive name, then id.
 * Total: returns 0 only for equal ids.
 */
export function compareSortKeys(a: SortKey, b: SortKey) {
  if (a[0] !== b[0]) {
    return a[0] - b[0]
  }

  const byName = collator.compare(a[1], b[1])
  if (byName !== 0) {
    return byName
  }

  if (a[2] === b[2]) {
    return 0
  }

  return a[2] < b[2] ? -1 : 1
}

/** Same order as `compareSortKeys` over `sortKey`. */
export function compareNodes(a: Sortable, b: Sortable) {
  return compareSortKeys(sortKey(a), sortKey(b))
}
