import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import { compareSortKeys, sortKey } from "~/features/file-explorer/domain/sort"
import type { SortKey } from "~/features/file-explorer/domain/sort"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type {
  FileSummary,
  FolderSummary,
  NodeDetail,
  NodeRef,
  NodeSummary,
  Page,
} from "~/features/file-explorer/domain/types"

import type {
  MockFileRecord,
  MockFolderRecord,
  MockRecord,
} from "./generate-tree"

export type MockMutationEvent =
  { type: "create"; id: string } | { type: "delete"; deletedIds: string[] }

export type MockListOptions = {
  cursor?: string
  limit: number
  /** Lists only children whose id is in the set; `total` counts them only. */
  includeIds?: ReadonlySet<string>
}

/**
 * Raw index structures for the mock mutations and tests. Writers must keep
 * every invariant below; readers must not mutate.
 */
export type MockDbInternal = {
  records: Map<string, MockRecord>
  /** One precomputed listing key per node id. */
  sortKeys: Map<string, SortKey>
  /**
   * Direct child ids per folder id, plus `ROOT_ID` for the top level, in
   * listing order. Every folder has an entry; `childCount` is its length.
   */
  childIds: Map<string, string[]>
  /** Descendant files per folder id; the `ROOT_ID` entry counts every file. */
  fileCounts: Map<string, number>
  /**
   * Index of the first id in `ids` whose key sorts after `key`: the insertion
   * point for a new node, and the start of the page after a cursor. O(log n).
   */
  upperBound(ids: readonly string[], key: SortKey): number
  /** A fresh listing summary for `record`, without `previewUrl`. */
  toSummary(record: MockRecord): NodeSummary
}

export type MockDb = {
  /** Throws `ApiError("not-found")` for an unknown id. */
  getNode(id: string): NodeDetail
  /**
   * One keyset page of a folder's children (`null` = top level).
   * O(log n + limit) without `includeIds`, O(children) with it.
   * Throws `not-found` for an unknown or non-folder id, `validation` for a
   * malformed cursor or a limit that isn't a positive integer.
   */
  listChildren(
    folderId: string | null,
    options: MockListOptions
  ): Page<NodeSummary>
  stats(): { fileCount: number }
  /** Returns an unsubscribe function. */
  onMutate(listener: (event: MockMutationEvent) => void): () => void
  emitMutation(event: MockMutationEvent): void
  internal: MockDbInternal
}

/**
 * Builds the in-memory index in O(n) plus sorting each folder's children.
 * Records may come in any order; a missing or non-folder parent throws.
 */
export function createMockDb(records: readonly MockRecord[]): MockDb {
  const recordsById = new Map<string, MockRecord>()
  const sortKeys = new Map<string, SortKey>()
  const childKeys = new Map<string, SortKey[]>([[ROOT_ID, []]])
  const fileCounts = new Map<string, number>()

  for (const record of records) {
    if (recordsById.has(record.id)) {
      throw new Error(`Duplicate record id ${record.id}`)
    }
    recordsById.set(record.id, record)
    sortKeys.set(record.id, sortKey(record))
    if (record.type === "folder") childKeys.set(record.id, [])
  }

  for (const record of records) {
    const siblings = childKeys.get(record.parentId ?? ROOT_ID)
    if (siblings === undefined) {
      throw new Error(`Record ${record.id} has no folder ${record.parentId}`)
    }
    siblings.push(sortKeys.get(record.id)!)
  }

  const childIds = new Map<string, string[]>()
  for (const [folderId, keys] of childKeys) {
    keys.sort(compareSortKeys)
    childIds.set(
      folderId,
      keys.map((key) => key[2])
    )
  }

  // Index invariants guarantee these entries; a miss is a bug, not user input.
  function recordOf(id: string): MockRecord {
    const record = recordsById.get(id)
    if (record === undefined) throw new Error(`Missing record ${id}`)
    return record
  }

  function childrenOf(folderId: string): string[] {
    const ids = childIds.get(folderId)
    if (ids === undefined) throw new Error(`Missing children of ${folderId}`)
    return ids
  }

  // Pre-order from the root puts every folder before its descendants, so the
  // reverse walk finishes a folder's count before adding it to its parent.
  const preOrder: string[] = []
  const stack = [ROOT_ID]
  while (stack.length > 0) {
    const folderId = stack.pop()!
    preOrder.push(folderId)
    let files = 0
    for (const id of childrenOf(folderId)) {
      if (recordOf(id).type === "folder") stack.push(id)
      else files++
    }
    fileCounts.set(folderId, files)
  }
  for (let i = preOrder.length - 1; i > 0; i--) {
    const folderId = preOrder[i]
    const parentKey = recordOf(folderId).parentId ?? ROOT_ID
    fileCounts.set(
      parentKey,
      fileCounts.get(parentKey)! + fileCounts.get(folderId)!
    )
  }

  function upperBound(ids: readonly string[], key: SortKey) {
    let low = 0
    let high = ids.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (compareSortKeys(sortKeys.get(ids[mid])!, key) <= 0) low = mid + 1
      else high = mid
    }
    return low
  }

  function folderSummary({
    id,
    name,
    parentId,
  }: MockFolderRecord): FolderSummary {
    return {
      id,
      name,
      parentId,
      type: "folder",
      childCount: childrenOf(id).length,
      fileCount: fileCounts.get(id)!,
    }
  }

  function toSummary(record: MockRecord): NodeSummary {
    return record.type === "folder"
      ? folderSummary(record)
      : fileSummary(record)
  }

  function getNode(id: string): NodeDetail {
    const record = recordsById.get(id)
    if (record === undefined) {
      throw new ApiError("not-found", `Node ${id} not found`)
    }

    const ancestors: NodeRef[] = []
    for (
      let parentId = record.parentId;
      parentId !== null;
      parentId = recordOf(parentId).parentId
    ) {
      ancestors.push({ id: parentId, name: recordOf(parentId).name })
    }
    ancestors.reverse()

    return record.type === "folder"
      ? { ...folderSummary(record), ancestors }
      : { ...fileSummary(record), ancestors, previewUrl: record.previewUrl }
  }

  function listChildren(
    folderId: string | null,
    { cursor, limit, includeIds }: MockListOptions
  ): Page<NodeSummary> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new ApiError("validation", `limit must be a positive integer`)
    }
    if (folderId !== null && recordsById.get(folderId)?.type !== "folder") {
      throw new ApiError("not-found", `Folder ${folderId} not found`)
    }

    const children = childrenOf(folderId ?? ROOT_ID)
    const ids = includeIds
      ? children.filter((id) => includeIds.has(id))
      : children
    const start =
      cursor === undefined ? 0 : upperBound(ids, decodeCursor(cursor))
    const end = Math.min(start + limit, ids.length)

    const items: NodeSummary[] = []
    for (let i = start; i < end; i++) {
      items.push(toSummary(recordsById.get(ids[i])!))
    }
    return {
      items,
      nextCursor:
        end < ids.length ? encodeCursor(sortKeys.get(ids[end - 1])!) : null,
      total: ids.length,
    }
  }

  const listeners = new Set<(event: MockMutationEvent) => void>()

  return {
    getNode,
    listChildren,
    stats: () => ({ fileCount: fileCounts.get(ROOT_ID)! }),
    onMutate(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emitMutation(event) {
      for (const listener of listeners) listener(event)
    },
    internal: {
      records: recordsById,
      sortKeys,
      childIds,
      fileCounts,
      upperBound,
      toSummary,
    },
  }
}

// Base64 over UTF-8 bytes: `btoa` alone rejects characters above U+00FF.
function encodeCursor(key: SortKey): string {
  const bytes = new TextEncoder().encode(JSON.stringify(key))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeCursor(cursor: string): SortKey {
  let key: unknown
  try {
    const bytes = Uint8Array.from(atob(cursor), (char) => char.charCodeAt(0))
    key = JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    throw new ApiError("validation", "Malformed cursor", { cause: error })
  }
  if (
    !Array.isArray(key) ||
    key.length !== 3 ||
    (key[0] !== 0 && key[0] !== 1) ||
    typeof key[1] !== "string" ||
    typeof key[2] !== "string"
  ) {
    throw new ApiError("validation", "Malformed cursor")
  }
  return [key[0], key[1], key[2]]
}

function fileSummary({
  id,
  name,
  parentId,
  category,
  sizeInBytes,
}: MockFileRecord): FileSummary {
  return { id, name, parentId, type: "file", category, sizeInBytes }
}
