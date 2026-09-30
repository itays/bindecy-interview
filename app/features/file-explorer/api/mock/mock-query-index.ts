import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import { matchesFile, queryKey } from "~/features/file-explorer/domain/filters"
import { compareSortKeys } from "~/features/file-explorer/domain/sort"
import type { SortKey } from "~/features/file-explorer/domain/sort"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type {
  FileQuery,
  NodeSummary,
  Page,
  SearchHit,
} from "~/features/file-explorer/domain/types"

import type { MockRecord } from "./generate-tree"
import type { MockDb } from "./mock-db"

const CACHE_SIZE = 5

/**
 * One query evaluated over the whole tree.
 *
 * Keep rule, identical to the old `filterProjectTree`:
 * - A file is kept when it matches (`matchesFile`, with the nearest
 *   name-matched ancestor folder satisfying the name dimension).
 * - A folder is kept when its own name matches, when it keeps any child
 *   (so every ancestor of a kept node is kept), or when it sits below a
 *   name-matched folder and the query has no size or category constraint.
 *   So a name-matched folder is kept even with zero matching files, while
 *   its descendant folders survive size/category constraints only if they
 *   contain a match or match by name themselves.
 * - A blank name counts as matching at the root, so an inactive query keeps
 *   every node and matches every file.
 */
export type QueryEvaluation = {
  /** Matched file ids in tree order (depth-first, listing order). */
  matchedFileIds: readonly string[]
  /** Matched descendant files per folder; folders without a match are absent. */
  matchCountByFolder: ReadonlyMap<string, number>
  /** Folders whose own name contains the query name. */
  folderNameMatches: ReadonlySet<string>
  /** Every node a filtered listing shows: matched files and kept folders. */
  keptIds: ReadonlySet<string>
}

export type QueryPageOptions = { cursor?: string; limit: number }

export type QueryIndex = {
  /** Cached per `queryKey`; a miss costs one O(n) scan. Do not mutate. */
  evaluate(query: FileQuery): QueryEvaluation
  /**
   * One keyset page of a folder's kept children (`null` = top level); folders
   * carry `matchCount`. O(children) after evaluation. Errors as
   * `db.listChildren`. Callers should route an inactive query to
   * `db.listChildren`, which pages in O(log n + limit).
   */
  listChildren(
    folderId: string | null,
    query: FileQuery,
    options: QueryPageOptions
  ): Page<NodeSummary>
  /**
   * One page of matched files in tree order; `total` counts every hit.
   * The cursor is a keyset over the last hit's tree path, so a page stays
   * gap- and duplicate-free across creates and deletes. O(depth · log hits
   * + limit · depth) after evaluation. A bad cursor or limit throws
   * `ApiError("validation")`.
   */
  search(query: FileQuery, options: QueryPageOptions): Page<SearchHit>
  stats(query: FileQuery): { fileCount: number }
  /** Stops clearing the cache on DB mutations. */
  dispose(): void
}

type Frame = {
  id: string
  children: readonly string[]
  next: number
  nameMatch: boolean
  /** `[name]` of the nearest name-matched folder on the path, else `[]`. */
  matchedAncestorNames: readonly string[]
  /** Everything below this folder is kept (name matched, no file constraints). */
  keepsSubtree: boolean
  matchCount: number
  keepsChild: boolean
}

/**
 * Evaluates `FileQuery`s against `db` with an LRU cache of `CACHE_SIZE`
 * evaluations keyed by `queryKey`, cleared on every DB mutation event.
 */
export function createQueryIndex(db: MockDb): QueryIndex {
  const { records, sortKeys, childIds } = db.internal
  const cache = new Map<string, QueryEvaluation>()
  const unsubscribe = db.onMutate(() => cache.clear())

  function recordOf(id: string): MockRecord {
    return entryOf(records, id)
  }

  function evaluate(query: FileQuery): QueryEvaluation {
    const key = queryKey(query)
    const cached = cache.get(key)
    if (cached !== undefined) {
      cache.delete(key)
      cache.set(key, cached)
      return cached
    }
    const evaluation = scan(query)
    cache.set(key, evaluation)
    if (cache.size > CACHE_SIZE) {
      for (const oldest of cache.keys()) {
        cache.delete(oldest)
        break
      }
    }
    return evaluation
  }

  /** One iterative depth-first pass: O(n), no per-node ancestor walks. */
  function scan(query: FileQuery): QueryEvaluation {
    const name = query.name.trim().toLowerCase()
    const hasFileConstraints =
      query.minBytes !== null ||
      query.maxBytes !== null ||
      query.categories.length > 0
    const matchedFileIds: string[] = []
    const matchCountByFolder = new Map<string, number>()
    const folderNameMatches = new Set<string>()
    const keptIds = new Set<string>()

    const stack: Frame[] = [
      {
        id: ROOT_ID,
        children: entryOf(childIds, ROOT_ID),
        next: 0,
        nameMatch: false,
        matchedAncestorNames: [],
        keepsSubtree: name === "" && !hasFileConstraints,
        matchCount: 0,
        keepsChild: false,
      },
    ]

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      if (frame.next === frame.children.length) {
        stack.pop()
        const parent = stack.at(-1)
        if (parent === undefined) break
        if (frame.matchCount > 0) {
          matchCountByFolder.set(frame.id, frame.matchCount)
          parent.matchCount += frame.matchCount
        }
        if (frame.nameMatch || frame.keepsChild || parent.keepsSubtree) {
          keptIds.add(frame.id)
          parent.keepsChild = true
        }
        continue
      }

      const record = recordOf(frame.children[frame.next++])
      if (record.type === "file") {
        if (matchesFile(record, frame.matchedAncestorNames, query)) {
          matchedFileIds.push(record.id)
          keptIds.add(record.id)
          frame.matchCount++
          frame.keepsChild = true
        }
        continue
      }

      const nameMatch = name !== "" && record.name.toLowerCase().includes(name)
      if (nameMatch) folderNameMatches.add(record.id)
      stack.push({
        id: record.id,
        children: entryOf(childIds, record.id),
        next: 0,
        nameMatch,
        matchedAncestorNames: nameMatch
          ? [record.name]
          : frame.matchedAncestorNames,
        keepsSubtree: frame.keepsSubtree || (nameMatch && !hasFileConstraints),
        matchCount: 0,
        keepsChild: false,
      })
    }

    return { matchedFileIds, matchCountByFolder, folderNameMatches, keptIds }
  }

  function listChildren(
    folderId: string | null,
    query: FileQuery,
    options: QueryPageOptions
  ): Page<NodeSummary> {
    const { keptIds, matchCountByFolder } = evaluate(query)
    const page = db.listChildren(folderId, { ...options, includeIds: keptIds })
    for (const item of page.items) {
      if (item.type === "folder") {
        item.matchCount = matchCountByFolder.get(item.id) ?? 0
      }
    }
    return page
  }

  /** Folder ids from the top level down to `id`'s parent. O(depth). */
  function ancestorIdsOf(id: string): string[] {
    const ancestorIds: string[] = []
    for (
      let parentId = recordOf(id).parentId;
      parentId !== null;
      parentId = recordOf(parentId).parentId
    ) {
      ancestorIds.push(parentId)
    }
    return ancestorIds.reverse()
  }

  function pathOf(id: string): SortKey[] {
    return [...ancestorIdsOf(id), id].map((pathId) => entryOf(sortKeys, pathId))
  }

  /** Index of the first hit after `path` in tree order. O(depth · log hits). */
  function hitsAfter(hits: readonly string[], path: readonly SortKey[]) {
    let low = 0
    let high = hits.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (comparePaths(pathOf(hits[mid]), path) <= 0) low = mid + 1
      else high = mid
    }
    return low
  }

  function search(
    query: FileQuery,
    { cursor, limit }: QueryPageOptions
  ): Page<SearchHit> {
    assertLimit(limit)
    const hits = evaluate(query).matchedFileIds
    const start = cursor === undefined ? 0 : hitsAfter(hits, decodePath(cursor))
    const end = Math.min(start + limit, hits.length)

    const items: SearchHit[] = []
    for (let i = start; i < end; i++) {
      const record = recordOf(hits[i])
      if (record.type !== "file")
        throw new Error(`Hit ${record.id} is a folder`)
      const { id, name, parentId, category, sizeInBytes } = record
      items.push({
        id,
        name,
        parentId,
        type: "file",
        category,
        sizeInBytes,
        ancestorIds: ancestorIdsOf(id),
      })
    }
    return {
      items,
      nextCursor: end < hits.length ? encodePath(pathOf(hits[end - 1])) : null,
      total: hits.length,
    }
  }

  return {
    evaluate,
    listChildren,
    search,
    stats: (query) => ({ fileCount: evaluate(query).matchedFileIds.length }),
    dispose: unsubscribe,
  }
}

// Index invariants guarantee these entries; a miss is a bug, not user input.
function entryOf<T>(map: ReadonlyMap<string, T>, id: string): T {
  const value = map.get(id)
  if (value === undefined) throw new Error(`Missing index entry ${id}`)
  return value
}

/** Same rule as `db.listChildren`. */
function assertLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ApiError("validation", `limit must be a positive integer`)
  }
}

/** Pre-order tree position: an ancestor sorts before its descendants. */
function comparePaths(a: readonly SortKey[], b: readonly SortKey[]): number {
  const shared = Math.min(a.length, b.length)
  for (let i = 0; i < shared; i++) {
    const order = compareSortKeys(a[i], b[i])
    if (order !== 0) return order
  }
  return a.length - b.length
}

// Base64 over UTF-8 bytes: `btoa` alone rejects characters above U+00FF.
function encodePath(path: readonly SortKey[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(path))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodePath(cursor: string): SortKey[] {
  let path: unknown
  try {
    const bytes = Uint8Array.from(atob(cursor), (char) => char.charCodeAt(0))
    path = JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    throw new ApiError("validation", "Malformed cursor", { cause: error })
  }
  if (!Array.isArray(path) || path.length === 0 || !path.every(isSortKey)) {
    throw new ApiError("validation", "Malformed cursor")
  }
  return path
}

function isSortKey(value: unknown): value is SortKey {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    (value[0] === 0 || value[0] === 1) &&
    typeof value[1] === "string" &&
    typeof value[2] === "string"
  )
}
