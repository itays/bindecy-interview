import type {
  FileCategory,
  FileQuery,
  NodeDetail,
  NodeSummary,
  Page,
  SearchHit,
} from "~/features/file-explorer/domain/types"

export type ListChildrenRequest = {
  /** `null` lists the top level. */
  folderId: string | null
  /** Omitted or inactive = unfiltered listing. */
  query?: FileQuery
  cursor?: string
  limit: number
}

export type SearchRequest = {
  query: FileQuery
  cursor?: string
  limit: number
}

export type StatsRequest = {
  query?: FileQuery
}

export type CreateFolderInput = {
  /** `null` creates a top-level folder. */
  parentId: string | null
  name: string
}

export type CreateFileInput = {
  /** `null` creates a top-level file. */
  parentId: string | null
  name: string
  category: FileCategory
  sizeInBytes: number
  previewUrl: string
}

/**
 * Backend-like access to the file tree. Every read loads only what one view
 * needs: one page of one folder, one node, or one page of search hits.
 *
 * Shared semantics:
 * - Order: folders first, then case-insensitive name, then id.
 * - Paging: pass the previous page's `nextCursor` to get the next page.
 *   Cursors are opaque keysets over that order, so creating or deleting
 *   nodes between pages never skips or repeats a surviving node.
 * - Aborting `signal` rejects with a `DOMException` named `"AbortError"`.
 * - Other failures reject with `ApiError`.
 */
export interface FileExplorerApi {
  /**
   * One page of a folder's direct children.
   *
   * With an active `query`, lists only matching files and folders that
   * contain a match or whose own name matches the query name; such folders
   * carry `matchCount`, and `total` counts the filtered listing.
   *
   * Rejects with `not-found` for an unknown or non-folder `folderId`, and
   * with `validation` for a malformed cursor.
   */
  listChildren(
    request: ListChildrenRequest,
    signal?: AbortSignal
  ): Promise<Page<NodeSummary>>

  /**
   * One node with its ancestor path; files also carry `previewUrl`.
   * Rejects with `not-found` for an unknown id.
   */
  getNode(id: string, signal?: AbortSignal): Promise<NodeDetail>

  /**
   * One page of matching files across the whole tree, in tree order
   * (depth-first, each folder's children in listing order). `total` counts
   * all hits. Rejects with `validation` for a malformed cursor.
   */
  search(request: SearchRequest, signal?: AbortSignal): Promise<Page<SearchHit>>

  /** Number of files matching `query`, or all files when it's omitted. */
  getStats(
    request: StatsRequest,
    signal?: AbortSignal
  ): Promise<{ fileCount: number }>

  /**
   * Creates a folder and returns it as it would appear in an unfiltered
   * listing. Rejects with `validation` for a blank name or a file parent,
   * `not-found` for an unknown parent, and `conflict` when a sibling has the
   * same name (case-insensitive).
   */
  createFolder(input: CreateFolderInput): Promise<NodeSummary>

  /** Creates a file. Rejects like `createFolder`, plus `validation` for a negative size. */
  createFile(input: CreateFileInput): Promise<NodeSummary>

  /**
   * Deletes a node and, for a folder, all its descendants.
   * Resolves with every deleted id. Rejects with `not-found` for an unknown id.
   */
  deleteNode(id: string): Promise<{ deletedIds: string[] }>
}

export type ApiErrorCode = "network" | "not-found" | "conflict" | "validation"

export class ApiError extends Error {
  readonly code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "ApiError"
    this.code = code
  }
}
