import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type {
  CreateFileInput,
  CreateFolderInput,
} from "~/features/file-explorer/api/file-explorer-api"
import { compareSortKeys, sortKey } from "~/features/file-explorer/domain/sort"
import type { SortKey } from "~/features/file-explorer/domain/sort"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type { NodeSummary } from "~/features/file-explorer/domain/types"

import type { MockRecord } from "./generate-tree"
import type { MockDb } from "./mock-db"

/**
 * Synchronous writes against a `MockDb`. Every operation validates before
 * its first write, so a thrown `ApiError` leaves the db untouched and emits
 * nothing; a success emits exactly one event once the index is consistent.
 */
export type MockMutations = {
  /**
   * Creates an empty folder. O(depth + s) for s siblings: a binary-searched
   * slot plus the splice. Throws `validation` for a blank name or a file
   * parent, `not-found` for an unknown parent (including the literal
   * `ROOT_ID`; the top level is `null`), and `conflict` when a sibling
   * folder or file has the same name case-insensitively.
   */
  createFolder(input: CreateFolderInput): NodeSummary
  /**
   * Creates a file and adds it to every ancestor's `fileCount`. Throws like
   * `createFolder`, plus `validation` when `sizeInBytes` isn't a
   * non-negative safe integer (byte counts are whole numbers).
   */
  createFile(input: CreateFileInput): NodeSummary
  /**
   * Deletes a node and its whole subtree. `deletedIds` lists the node first,
   * then its descendants in pre-order, each folder's children in listing
   * order. O(subtree + depth + s). Throws `validation` for `ROOT_ID` and
   * `not-found` for an unknown id.
   */
  deleteNode(id: string): { deletedIds: string[] }
}

/** Binds the mutations to `db`; new ids are `folder-new-N` / `file-new-N`. */
export function createMockMutations(db: MockDb): MockMutations {
  const { records, sortKeys, childIds, fileCounts, upperBound, toSummary } =
    db.internal
  // Counters never rewind, so a deleted id is never handed out again.
  const nextSerial: Record<MockRecord["type"], number> = { folder: 1, file: 1 }

  function newId(type: MockRecord["type"]): string {
    let id: string
    do {
      id = `${type}-new-${nextSerial[type]++}`
    } while (records.has(id))
    return id
  }

  /** The `childIds` key of a valid parent folder. */
  function parentKey(parentId: string | null): string {
    if (parentId === null) return ROOT_ID
    const parent = records.get(parentId)
    if (parent === undefined || parentId === ROOT_ID) {
      throw new ApiError("not-found", `Folder ${parentId} not found`)
    }
    if (parent.type !== "folder") {
      throw new ApiError("validation", `${parent.name} is not a folder`)
    }
    return parentId
  }

  /**
   * Whether a sibling folder or file is named `lowerName`. Names that
   * collate equal sort contiguously, so each rank costs one binary search
   * plus a scan of that run: O(log s + run).
   */
  function hasSiblingNamed(siblings: readonly string[], lowerName: string) {
    for (const rank of [0, 1] as const) {
      // Ids are non-empty, so the "" id places the probe before its run.
      const probe: SortKey = [rank, lowerName, ""]
      for (let i = upperBound(siblings, probe); i < siblings.length; i++) {
        const [keyRank, keyName] = entry(sortKeys, siblings[i])
        if (compareSortKeys([keyRank, keyName, ""], probe) !== 0) break
        if (keyName === lowerName) return true
      }
    }
    return false
  }

  /** The trimmed name, once the parent and name are known to be valid. */
  function validName(parentId: string | null, rawName: string): string {
    const name = rawName.trim()
    if (name === "") throw new ApiError("validation", "Name is required")
    const siblings = entry(childIds, parentKey(parentId))
    if (hasSiblingNamed(siblings, name.toLowerCase())) {
      throw new ApiError("conflict", `${name} already exists`)
    }
    return name
  }

  /** Adds `delta` to the file count of `folderId`, its ancestors and the root. */
  function addFiles(folderId: string | null, delta: number) {
    for (let id = folderId; id !== null; id = entry(records, id).parentId) {
      fileCounts.set(id, entry(fileCounts, id) + delta)
    }
    fileCounts.set(ROOT_ID, entry(fileCounts, ROOT_ID) + delta)
  }

  function insert(record: MockRecord): NodeSummary {
    const key = sortKey(record)
    const siblings = entry(childIds, record.parentId ?? ROOT_ID)
    records.set(record.id, record)
    sortKeys.set(record.id, key)
    siblings.splice(upperBound(siblings, key), 0, record.id)
    if (record.type === "folder") {
      childIds.set(record.id, [])
      fileCounts.set(record.id, 0)
    } else {
      addFiles(record.parentId, 1)
    }
    const summary = toSummary(record)
    db.emitMutation({ type: "create", id: record.id })
    return summary
  }

  function deleteNode(id: string): { deletedIds: string[] } {
    if (id === ROOT_ID) {
      throw new ApiError("validation", "The root can't be deleted")
    }
    const record = records.get(id)
    if (record === undefined) {
      throw new ApiError("not-found", `Node ${id} not found`)
    }

    const deletedIds: string[] = []
    let files = 0
    const stack = [id]
    for (
      let current = stack.pop();
      current !== undefined;
      current = stack.pop()
    ) {
      deletedIds.push(current)
      if (entry(records, current).type === "file") {
        files++
      } else {
        const children = entry(childIds, current)
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i])
      }
    }

    // The node is the last id whose key is <= its own key.
    const siblings = entry(childIds, record.parentId ?? ROOT_ID)
    const index = upperBound(siblings, entry(sortKeys, id)) - 1
    if (siblings[index] !== id) throw new Error(`${id} missing from parent`)
    siblings.splice(index, 1)
    addFiles(record.parentId, -files)
    for (const deletedId of deletedIds) {
      records.delete(deletedId)
      sortKeys.delete(deletedId)
      childIds.delete(deletedId)
      fileCounts.delete(deletedId)
    }

    db.emitMutation({ type: "delete", deletedIds })
    return { deletedIds }
  }

  return {
    createFolder({ parentId, name }) {
      const validated = validName(parentId, name)
      return insert({
        id: newId("folder"),
        parentId,
        name: validated,
        type: "folder",
      })
    },
    createFile({ parentId, name, category, sizeInBytes, previewUrl }) {
      if (!Number.isSafeInteger(sizeInBytes) || sizeInBytes < 0) {
        throw new ApiError(
          "validation",
          "Size must be a non-negative whole number of bytes"
        )
      }
      const validated = validName(parentId, name)
      return insert({
        id: newId("file"),
        parentId,
        name: validated,
        type: "file",
        category,
        sizeInBytes,
        previewUrl,
      })
    },
    deleteNode,
  }
}

// Index invariants guarantee these entries; a miss is a bug, not user input.
function entry<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key)
  if (value === undefined) throw new Error(`Missing index entry ${key}`)
  return value
}
