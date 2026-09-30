import type { FileCategory } from "~/features/file-explorer/domain/types"

import { CURATED_RECORDS, PREVIEW_URLS } from "./curated-fixture"

export type MockFolderRecord = {
  id: string
  parentId: string | null
  name: string
  type: "folder"
}

export type MockFileRecord = {
  id: string
  parentId: string | null
  name: string
  type: "file"
  category: FileCategory
  sizeInBytes: number
  previewUrl: string
}

export type MockRecord = MockFolderRecord | MockFileRecord

export type GenerateTreeOptions = { seed: number; nodes: number }

/** Deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const MB = 1_048_576

const WIDE_FOLDER_SIZE = 5_000
/** Cap on the wide folder's share of the free budget, so small trees keep a remainder. */
const WIDE_FOLDER_SHARE = 0.6
/** Chain folders below "Deep archive" (depth 2), so the deepest folder sits at depth 22. */
const DEEP_CHAIN_LEVELS = 20
const DEEP_FILE_EVERY = 5
const DEEP_CHAIN_CATEGORIES: readonly FileCategory[] = [
  "doc",
  "image",
  "audio",
  "video",
]
const REMAINDER_FOLDER_ODDS = 0.12
const REMAINDER_MAX_DEPTH = 8
const REMAINDER_FOLDER_WORDS = ["Collection", "Project", "Batch", "Set"]
const EMPTY_FILE_ODDS = 0.01

type CategorySpec = {
  prefixes: readonly string[]
  extensions: readonly string[]
  maxBytes: number
}

const CATEGORY_SPECS: Record<FileCategory, CategorySpec> = {
  video: {
    prefixes: ["clip", "shot", "reel"],
    extensions: ["mp4"],
    maxBytes: 500 * MB,
  },
  audio: {
    prefixes: ["take", "stem", "voiceover"],
    extensions: ["mp3"],
    maxBytes: 80 * MB,
  },
  image: {
    prefixes: ["scan", "still", "photo"],
    extensions: ["png", "jpg"],
    maxBytes: 40 * MB,
  },
  doc: {
    prefixes: ["memo", "brief", "notes"],
    extensions: ["pdf"],
    maxBytes: 20 * MB,
  },
}

/** Category weights; each table sums to 1. */
type CategoryMix = readonly (readonly [FileCategory, number])[]

const STOCK_FOOTAGE_MIX: CategoryMix = [
  ["video", 0.8],
  ["image", 0.12],
  ["audio", 0.08],
]
const REMAINDER_MIX: CategoryMix = [
  ["image", 0.35],
  ["audio", 0.25],
  ["video", 0.2],
  ["doc", 0.2],
]

type OpenFolder = { id: string; depth: number; childCount: number }

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0")
}

/**
 * Curated records plus a generated "Asset library" ("Deep archive" chain,
 * ~5k-child "Stock footage", mixed remainder), exactly `nodes` records in
 * parent-first order. Small `nodes` truncate the fixed shapes and shrink the
 * wide folder and remainder; curated records are always included.
 */
export function generateTree({
  seed,
  nodes,
}: GenerateTreeOptions): MockRecord[] {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`seed must be an integer, got ${seed}`)
  }
  if (!Number.isInteger(nodes) || nodes < CURATED_RECORDS.length) {
    throw new RangeError(
      `nodes must be an integer >= ${CURATED_RECORDS.length}, got ${nodes}`
    )
  }

  const rng = mulberry32(seed)
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(rng() * items.length)]
  const pickCategory = (mix: CategoryMix): FileCategory => {
    let roll = rng()
    for (const [category, weight] of mix) {
      if (roll < weight) return category
      roll -= weight
    }
    return mix[mix.length - 1][0]
  }

  // Copies, so callers may mutate records without touching the fixture.
  const records: MockRecord[] = CURATED_RECORDS.map((record) => ({
    ...record,
  }))
  let sequence = 0

  const addFolder = (
    parentId: string | null,
    name: string,
    id = `folder-g${++sequence}`
  ): string => {
    records.push({ id, parentId, name, type: "folder" })
    return id
  }

  /** `counter` must be unique within the parent; it makes the name unique. */
  const addFile = (
    parentId: string,
    category: FileCategory,
    counter: number,
    width: number
  ) => {
    const spec = CATEGORY_SPECS[category]
    records.push({
      id: `file-g${++sequence}`,
      parentId,
      name: `${pick(spec.prefixes)}-${pad(counter, width)}.${pick(spec.extensions)}`,
      type: "file",
      category,
      sizeInBytes:
        rng() < EMPTY_FILE_ODDS ? 0 : Math.floor(rng() * (spec.maxBytes + 1)),
      previewUrl: pick(PREVIEW_URLS[category]),
    })
  }

  const library = addFolder(null, "Asset library", "folder-asset-library")

  let level = addFolder(library, "Deep archive", "folder-deep-archive")
  const lastDepth = 2 + DEEP_CHAIN_LEVELS
  let chainFiles = 0
  for (let depth = 3; depth <= lastDepth; depth++) {
    level = addFolder(level, `Level ${pad(depth, 2)}`)
    if (depth % DEEP_FILE_EVERY === 0 || depth === lastDepth) {
      const category =
        DEEP_CHAIN_CATEGORIES[chainFiles++ % DEEP_CHAIN_CATEGORIES.length]
      addFile(level, category, depth, 2)
    }
  }

  const stockFootage = addFolder(
    library,
    "Stock footage",
    "folder-stock-footage"
  )

  if (records.length >= nodes) {
    records.length = nodes
    return records
  }

  const wideCount = Math.min(
    WIDE_FOLDER_SIZE,
    Math.floor((nodes - records.length) * WIDE_FOLDER_SHARE)
  )
  for (let index = 1; index <= wideCount; index++) {
    addFile(stockFootage, pickCategory(STOCK_FOOTAGE_MIX), index, 5)
  }

  // Random recursive tree: each record joins a uniformly chosen open folder.
  // Asset library itself only receives folders ("Collection NNN").
  const open: OpenFolder[] = [{ id: library, depth: 1, childCount: 0 }]
  while (records.length < nodes) {
    const parent = open[Math.floor(rng() * open.length)]
    const counter = ++parent.childCount
    const makesFolder =
      parent.depth === 1 ||
      (parent.depth < REMAINDER_MAX_DEPTH && rng() < REMAINDER_FOLDER_ODDS)
    if (makesFolder) {
      const depth = parent.depth + 1
      const word =
        REMAINDER_FOLDER_WORDS[
          Math.min(depth - 2, REMAINDER_FOLDER_WORDS.length - 1)
        ]
      const id = addFolder(parent.id, `${word} ${pad(counter, 3)}`)
      open.push({ id, depth, childCount: 0 })
    } else {
      addFile(parent.id, pickCategory(REMAINDER_MIX), counter, 4)
    }
  }

  return records
}
