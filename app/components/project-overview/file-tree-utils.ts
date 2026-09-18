import type { FileFilters, FileNode, ProjectNode } from "~/types/project-node"

const BYTES_PER_MB = 1_048_576
const DECIMAL_NUMBER_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/

const byteFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
})

export type FileFilterValidation = {
  isValid: boolean
  minSizeInBytes: number | null
  maxSizeInBytes: number | null
  minSizeError: string | null
  maxSizeError: string | null
  hasInvalidRange: boolean
}

export type FilteredProjectTree = {
  nodes: ProjectNode[]
  fileCount: number
  visibleFileIds: ReadonlySet<string>
  ancestorFolderIds: ReadonlySet<string>
  hasActiveFilters: boolean
  validation: FileFilterValidation
}

export type FileLocation = {
  file: FileNode
  path: string[]
}

type ParsedSize = {
  sizeInBytes: number | null
  error: string | null
}

function parseSizeInMb(value: string): ParsedSize {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return { sizeInBytes: null, error: null }
  }

  const numericValue = Number(normalizedValue)

  if (!Number.isFinite(numericValue)) {
    return {
      sizeInBytes: null,
      error: "Enter a valid size in megabytes.",
    }
  }

  if (numericValue < 0) {
    return {
      sizeInBytes: null,
      error: "Size must be zero or greater.",
    }
  }

  if (!DECIMAL_NUMBER_PATTERN.test(normalizedValue)) {
    return {
      sizeInBytes: null,
      error: "Enter a valid size in megabytes.",
    }
  }

  const sizeInBytes = numericValue * BYTES_PER_MB

  if (!Number.isFinite(sizeInBytes)) {
    return {
      sizeInBytes: null,
      error: "Enter a smaller size.",
    }
  }

  return { sizeInBytes, error: null }
}

export function validateFileFilters(
  filters: FileFilters
): FileFilterValidation {
  const minimumSize = parseSizeInMb(filters.minSizeMb)
  const maximumSize = parseSizeInMb(filters.maxSizeMb)
  let maxSizeError = maximumSize.error
  const hasInvalidRange =
    !minimumSize.error &&
    !maximumSize.error &&
    minimumSize.sizeInBytes !== null &&
    maximumSize.sizeInBytes !== null &&
    minimumSize.sizeInBytes > maximumSize.sizeInBytes

  if (hasInvalidRange) {
    maxSizeError = "Maximum size must be greater than or equal to minimum size."
  }

  return {
    isValid: !minimumSize.error && !maxSizeError,
    minSizeInBytes: minimumSize.sizeInBytes,
    maxSizeInBytes: maximumSize.sizeInBytes,
    minSizeError: minimumSize.error,
    maxSizeError,
    hasInvalidRange,
  }
}

function cloneNodes(nodes: ProjectNode[]): ProjectNode[] {
  return nodes.map((node) =>
    node.type === "file"
      ? { ...node }
      : { ...node, children: cloneNodes(node.children) }
  )
}

function filePassesFilters(
  file: FileNode,
  normalizedQuery: string,
  folderNameMatched: boolean,
  categoryFilters: ReadonlySet<string>,
  validation: FileFilterValidation
) {
  const nameMatches =
    !normalizedQuery ||
    folderNameMatched ||
    file.name.toLocaleLowerCase().includes(normalizedQuery)
  const categoryMatches =
    categoryFilters.size === 0 || categoryFilters.has(file.category)
  const minimumMatches =
    validation.minSizeInBytes === null ||
    file.sizeInBytes >= validation.minSizeInBytes
  const maximumMatches =
    validation.maxSizeInBytes === null ||
    file.sizeInBytes <= validation.maxSizeInBytes

  return nameMatches && categoryMatches && minimumMatches && maximumMatches
}

function filterNodes(
  nodes: ProjectNode[],
  normalizedQuery: string,
  categoryFilters: ReadonlySet<string>,
  validation: FileFilterValidation,
  hasFileConstraints: boolean,
  ancestorFolderNameMatched = false
): ProjectNode[] {
  const filteredNodes: ProjectNode[] = []

  for (const node of nodes) {
    if (node.type === "file") {
      if (
        filePassesFilters(
          node,
          normalizedQuery,
          ancestorFolderNameMatched,
          categoryFilters,
          validation
        )
      ) {
        filteredNodes.push({ ...node })
      }

      continue
    }

    const folderNameMatches =
      !!normalizedQuery &&
      node.name.toLocaleLowerCase().includes(normalizedQuery)
    const folderContextMatches = ancestorFolderNameMatched || folderNameMatches
    const children = filterNodes(
      node.children,
      normalizedQuery,
      categoryFilters,
      validation,
      hasFileConstraints,
      folderContextMatches
    )

    const retainCompleteSubtree =
      ancestorFolderNameMatched && !hasFileConstraints

    if (folderNameMatches || retainCompleteSubtree || children.length > 0) {
      filteredNodes.push({ ...node, children })
    }
  }

  return filteredNodes
}

export function collectVisibleFileIds(
  nodes: ProjectNode[],
  fileIds = new Set<string>()
): ReadonlySet<string> {
  for (const node of nodes) {
    if (node.type === "file") {
      fileIds.add(node.id)
    } else {
      collectVisibleFileIds(node.children, fileIds)
    }
  }

  return fileIds
}

export function collectFileAncestorFolderIds(
  nodes: ProjectNode[]
): ReadonlySet<string> {
  const ancestorFolderIds = new Set<string>()

  function visit(node: ProjectNode): boolean {
    if (node.type === "file") {
      return true
    }

    let containsFile = false

    for (const child of node.children) {
      if (visit(child)) {
        containsFile = true
      }
    }

    if (containsFile) {
      ancestorFolderIds.add(node.id)
    }

    return containsFile
  }

  nodes.forEach(visit)

  return ancestorFolderIds
}

export function collectExpandableFolderIds(
  nodes: ProjectNode[],
  folderIds = new Set<string>()
): ReadonlySet<string> {
  for (const node of nodes) {
    if (node.type === "folder" && node.children.length > 0) {
      folderIds.add(node.id)
      collectExpandableFolderIds(node.children, folderIds)
    }
  }

  return folderIds
}

export function filterProjectTree(
  nodes: ProjectNode[],
  filters: FileFilters
): FilteredProjectTree {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase()
  const hasActiveFilters =
    !!normalizedQuery ||
    !!filters.minSizeMb.trim() ||
    !!filters.maxSizeMb.trim() ||
    filters.categories.length > 0
  const validation = validateFileFilters(filters)

  const filteredNodes =
    !hasActiveFilters || !validation.isValid
      ? cloneNodes(nodes)
      : filterNodes(
          nodes,
          normalizedQuery,
          new Set(filters.categories),
          validation,
          filters.categories.length > 0 ||
            validation.minSizeInBytes !== null ||
            validation.maxSizeInBytes !== null
        )
  const visibleFileIds = collectVisibleFileIds(filteredNodes)
  const ancestorFolderIds =
    hasActiveFilters && validation.isValid
      ? collectFileAncestorFolderIds(filteredNodes)
      : new Set<string>()

  return {
    nodes: filteredNodes,
    fileCount: visibleFileIds.size,
    visibleFileIds,
    ancestorFolderIds,
    hasActiveFilters,
    validation,
  }
}

export function findFileLocation(
  nodes: ProjectNode[],
  fileId: string,
  parentPath: string[] = []
): FileLocation | null {
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.id === fileId) {
        return { file: node, path: [...parentPath, node.name] }
      }

      continue
    }

    const location = findFileLocation(node.children, fileId, [
      ...parentPath,
      node.name,
    ])

    if (location) {
      return location
    }
  }

  return null
}

export function formatFileSize(sizeInBytes: number) {
  if (sizeInBytes < 1_024) {
    return `${sizeInBytes} B`
  }

  if (sizeInBytes < BYTES_PER_MB) {
    return `${byteFormatter.format(sizeInBytes / 1_024)} KB`
  }

  return `${byteFormatter.format(sizeInBytes / BYTES_PER_MB)} MB`
}

export function countFiles(nodes: ProjectNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.type === "file" ? 1 : countFiles(node.children)),
    0
  )
}
