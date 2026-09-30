import type { FileQuery, FileSummary, FilterCategory } from "./types"

const BYTES_PER_MB = 1_048_576
const DECIMAL_NUMBER_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/

/** The toolbar's raw, possibly invalid filter input. Sizes are MB strings. */
export type FileFilters = {
  query: string
  minSizeMb: string
  maxSizeMb: string
  categories: FilterCategory[]
}

export type FileFilterValidation = {
  isValid: boolean
  minSizeInBytes: number | null
  maxSizeInBytes: number | null
  minSizeError: string | null
  maxSizeError: string | null
  hasInvalidRange: boolean
}

export type ParsedSize = {
  sizeInBytes: number | null
  error: string | null
}

export const EMPTY_QUERY: FileQuery = {
  name: "",
  minBytes: null,
  maxBytes: null,
  categories: [],
}

/** Parses a megabyte string into bytes. Blank input is an open bound (`null`), not an error. */
export function parseSizeInMb(value: string): ParsedSize {
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

/** Builds the query to apply, or `null` when the filters are invalid and must not be applied. */
export function toFileQuery(filters: FileFilters): FileQuery | null {
  const validation = validateFileFilters(filters)

  if (!validation.isValid) {
    return null
  }

  return {
    name: filters.query.trim(),
    minBytes: validation.minSizeInBytes,
    maxBytes: validation.maxSizeInBytes,
    categories: [...new Set(filters.categories)],
  }
}

/** True when any dimension is set; a set size bound counts even if it excludes nothing. */
export function isQueryActive(query: FileQuery): boolean {
  return (
    query.name.trim() !== "" ||
    query.minBytes !== null ||
    query.maxBytes !== null ||
    query.categories.length > 0
  )
}

/** Cache key; equal for queries that differ only in name case/whitespace or category order/duplicates. */
export function queryKey(query: FileQuery): string {
  return JSON.stringify([
    query.name.trim().toLowerCase(),
    query.minBytes,
    query.maxBytes,
    [...new Set(query.categories)].sort(),
  ])
}

/**
 * Whether a file passes the query. The name dimension also passes when any
 * ancestor folder name matches, so a matching folder keeps its descendants;
 * size and category constraints always apply.
 */
export function matchesFile(
  file: Pick<FileSummary, "name" | "category" | "sizeInBytes">,
  ancestorNames: readonly string[],
  query: FileQuery
): boolean {
  if (query.minBytes !== null && file.sizeInBytes < query.minBytes) {
    return false
  }

  if (query.maxBytes !== null && file.sizeInBytes > query.maxBytes) {
    return false
  }

  if (
    query.categories.length > 0 &&
    (file.category === "doc" || !query.categories.includes(file.category))
  ) {
    return false
  }

  const name = query.name.trim().toLowerCase()

  if (!name || file.name.toLowerCase().includes(name)) {
    return true
  }

  for (const ancestorName of ancestorNames) {
    if (ancestorName.toLowerCase().includes(name)) {
      return true
    }
  }

  return false
}
