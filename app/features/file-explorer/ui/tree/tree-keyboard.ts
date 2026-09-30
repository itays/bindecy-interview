import type { NodeSummary } from "~/features/file-explorer/domain/types"
import {
  currentQueryKey,
  isFiltering,
} from "~/features/file-explorer/state/explorer-store"
import type { ExplorerState } from "~/features/file-explorer/state/explorer-store"
import type { Row } from "~/features/file-explorer/state/visible-rows"

export type TreeKeyAction =
  | { type: "move"; index: number }
  | { type: "toggle"; id: string }
  | { type: "select"; id: string }
  | { type: "load-more"; folderId: string | null }
  | { type: "retry"; folderId: string | null }
  | { type: "delete"; id: string }

function requireNode(state: ExplorerState, id: string): NodeSummary {
  const node = state.nodesById.get(id)

  if (!node) {
    throw new Error(`Row node ${id} is missing from nodesById`)
  }

  return node
}

function isExpanded(state: ExplorerState, id: string): boolean {
  const expanded = isFiltering(state)
    ? state.filterExpanded[currentQueryKey(state)]
    : state.expanded

  return expanded?.has(id) ?? false
}

function moveTo(index: number, activeIndex: number): TreeKeyAction | null {
  return index === activeIndex ? null : { type: "move", index }
}

function parentIndex(rows: readonly Row[], index: number): number {
  const row = rows[index]

  for (let i = index - 1; i >= 0; i--) {
    const candidate = rows[i]

    if (candidate.depth < row.depth) {
      return candidate.kind === "node" && candidate.id === row.folderId ? i : -1
    }
  }

  return -1
}

/**
 * Maps a `KeyboardEvent.key` on the flat tree to an action, or `null` when
 * there is nothing to do. `activeIndex` outside `rows` means no active row.
 * O(1), except ArrowLeft's backward parent search (O(distance to parent)).
 *
 * @throws Error when a node row has no `nodesById` entry (store invariant).
 */
export function resolveTreeKey(
  rows: readonly Row[],
  activeIndex: number,
  key: string,
  state: ExplorerState
): TreeKeyAction | null {
  if (rows.length === 0) return null

  const last = rows.length - 1

  if (activeIndex < 0 || activeIndex > last) {
    if (key === "ArrowDown" || key === "Home") return { type: "move", index: 0 }
    if (key === "ArrowUp" || key === "End") return { type: "move", index: last }
    return null
  }

  const row = rows[activeIndex]

  switch (key) {
    case "ArrowDown":
      return moveTo(Math.min(activeIndex + 1, last), activeIndex)
    case "ArrowUp":
      return moveTo(Math.max(activeIndex - 1, 0), activeIndex)
    case "Home":
      return moveTo(0, activeIndex)
    case "End":
      return moveTo(last, activeIndex)
    case "ArrowRight": {
      if (row.kind !== "node") return null
      const node = requireNode(state, row.id)
      if (node.type !== "folder") return null
      if (!isExpanded(state, row.id)) {
        return node.childCount > 0 ? { type: "toggle", id: row.id } : null
      }
      const next = rows[activeIndex + 1]
      return next?.folderId === row.id
        ? { type: "move", index: activeIndex + 1 }
        : null
    }
    case "ArrowLeft": {
      if (
        row.kind === "node" &&
        requireNode(state, row.id).type === "folder" &&
        isExpanded(state, row.id)
      ) {
        return { type: "toggle", id: row.id }
      }
      if (row.folderId === null) return null
      const index = parentIndex(rows, activeIndex)
      return index < 0 ? null : { type: "move", index }
    }
    case "Enter":
    case " ":
      if (row.kind === "node") {
        return requireNode(state, row.id).type === "folder"
          ? { type: "toggle", id: row.id }
          : { type: "select", id: row.id }
      }
      if (row.kind === "load-more") {
        return { type: "load-more", folderId: row.folderId }
      }
      if (row.kind === "error") return { type: "retry", folderId: row.folderId }
      return null
    case "Delete":
      return row.kind === "node" ? { type: "delete", id: row.id } : null
    default:
      return null
  }
}
