export type FileCategory = "audio" | "video" | "image" | "doc"

/** Categories the filter toolbar can toggle. Documents have no toggle. */
export type FilterCategory = Exclude<FileCategory, "doc">

/**
 * Key for the root folder in id-keyed maps (listings, caches).
 * The API itself uses `null` for the root; no real node has this id.
 */
export const ROOT_ID = "root"

type NodeBase = {
  id: string
  name: string
  /** `null` for top-level nodes. */
  parentId: string | null
}

export type FolderSummary = NodeBase & {
  type: "folder"
  /** Direct children, ignoring any query. */
  childCount: number
  /** Descendant files at any depth, ignoring any query. */
  fileCount: number
  /** Descendant files matching the request's query. Present only when a query is active. */
  matchCount?: number
}

export type FileSummary = NodeBase & {
  type: "file"
  category: FileCategory
  sizeInBytes: number
}

/** A node as it appears in listings. Lists never carry `previewUrl`. */
export type NodeSummary = FolderSummary | FileSummary

export type NodeRef = { id: string; name: string }

type DetailBase = {
  /** Path from the top-level folder down to the parent. Empty for top-level nodes. */
  ancestors: NodeRef[]
}

export type FolderDetail = FolderSummary & DetailBase

export type FileDetail = FileSummary &
  DetailBase & {
    previewUrl: string
  }

export type NodeDetail = FolderDetail | FileDetail

/**
 * An applied, valid filter. Dimensions combine with AND; categories with OR.
 * Built from the toolbar's string filters by `domain/filters.ts`.
 */
export type FileQuery = {
  /** Trimmed; matched as a case-insensitive substring. Empty = no name filter. */
  name: string
  /** Inclusive byte bounds; `null` = open-ended. */
  minBytes: number | null
  maxBytes: number | null
  /** Empty = every category, documents included. */
  categories: FilterCategory[]
}

export type Page<T> = {
  items: T[]
  /** Opaque cursor for the next page; `null` on the last page. */
  nextCursor: string | null
  /** Items in the whole listing (all pages), not in this page. */
  total: number
}

/** A matching file with its ancestor folder ids, top-level folder first. */
export type SearchHit = FileSummary & {
  ancestorIds: string[]
}
