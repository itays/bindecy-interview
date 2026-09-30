import { describe, expect, it } from "vitest"

import type { FileCategory } from "~/features/file-explorer/domain/types"

import { CURATED_RECORDS, PREVIEW_URLS } from "./curated-fixture"
import { generateTree, mulberry32 } from "./generate-tree"
import type { MockRecord } from "./generate-tree"

const MB = 1_048_576

const tree10k = generateTree({ seed: 1, nodes: 10_000 })
const tree50k = generateTree({ seed: 2, nodes: 50_000 })

/** Depth per id, top-level nodes at depth 1. Relies on parent-first order. */
function depthsById(records: readonly MockRecord[]): Map<string, number> {
  const depths = new Map<string, number>()
  for (const record of records) {
    const parentDepth =
      record.parentId === null ? 0 : (depths.get(record.parentId) ?? NaN)
    depths.set(record.id, parentDepth + 1)
  }
  return depths
}

function findFolder(records: readonly MockRecord[], name: string) {
  return records.find(
    (record) => record.type === "folder" && record.name === name
  )!
}

describe("mulberry32", () => {
  it("repeats its sequence for a seed and differs across seeds", () => {
    const sequence = Array.from({ length: 5 }, mulberry32(42))
    expect(Array.from({ length: 5 }, mulberry32(42))).toEqual(sequence)
    expect(Array.from({ length: 5 }, mulberry32(43))).not.toEqual(sequence)
  })

  it("returns floats in [0, 1)", () => {
    const values = Array.from({ length: 10_000 }, mulberry32(7))
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })
})

describe("generateTree", () => {
  it("returns identical records for the same seed and node count", () => {
    expect(generateTree({ seed: 1, nodes: 10_000 })).toEqual(tree10k)
  })

  it("returns different records for a different seed", () => {
    expect(generateTree({ seed: 2, nodes: 10_000 })).not.toEqual(tree10k)
  })

  it.each([CURATED_RECORDS.length, 30, 100, 1_000, 10_000, 50_000])(
    "returns exactly %i records",
    (nodes) => {
      expect(generateTree({ seed: 3, nodes })).toHaveLength(nodes)
    }
  )

  it.each([
    { seed: 1.5, nodes: 100 },
    { seed: Number.NaN, nodes: 100 },
    { seed: 1, nodes: 100.5 },
    { seed: 1, nodes: CURATED_RECORDS.length - 1 },
  ])("rejects seed $seed with nodes $nodes", (options) => {
    expect(() => generateTree(options)).toThrow(RangeError)
  })

  it.each([
    ["tiny", generateTree({ seed: 4, nodes: 30 })],
    ["10k", tree10k],
    ["50k", tree50k],
  ])(
    "keeps ids unique and parents as earlier folders (%s)",
    (_label, records) => {
      const folderIds = new Set<string>()
      const ids = new Set<string>()
      const problems: string[] = []
      for (const record of records) {
        if (ids.has(record.id)) problems.push(`duplicate ${record.id}`)
        if (!record.id.startsWith(`${record.type}-`)) {
          problems.push(`bad id ${record.id}`)
        }
        if (record.parentId !== null && !folderIds.has(record.parentId)) {
          problems.push(`orphan ${record.id}`)
        }
        ids.add(record.id)
        if (record.type === "folder") folderIds.add(record.id)
      }
      expect(problems).toEqual([])
    }
  )

  it("keeps sibling names unique case-insensitively", () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const record of tree50k) {
      const key = `${record.parentId}/${record.name.toLowerCase()}`
      if (seen.has(key)) duplicates.push(key)
      seen.add(key)
    }
    expect(duplicates).toEqual([])
  })

  it.each([CURATED_RECORDS.length, 10_000])(
    "includes every curated record unchanged with %i nodes",
    (nodes) => {
      const byId = new Map(
        generateTree({ seed: 5, nodes }).map((record) => [record.id, record])
      )
      for (const curated of CURATED_RECORDS) {
        expect(byId.get(curated.id)).toEqual(curated)
      }
    }
  )

  it("puts at least 5,000 files in Stock footage under Asset library at 10k nodes", () => {
    const library = findFolder(tree10k, "Asset library")
    const stock = findFolder(tree10k, "Stock footage")
    const stockChildren = tree10k.filter(
      (record) => record.parentId === stock.id
    )
    expect(library.parentId).toBeNull()
    expect(stock.parentId).toBe(library.id)
    expect(stockChildren.length).toBeGreaterThanOrEqual(5_000)
  })

  it("reaches depth 20 with files under Deep archive", () => {
    const depths = depthsById(tree10k)
    const deepestFile = Math.max(
      ...tree10k
        .filter((record) => record.type === "file")
        .map((record) => depths.get(record.id)!)
    )
    expect(findFolder(tree10k, "Deep archive").parentId).toBe(
      findFolder(tree10k, "Asset library").id
    )
    expect(deepestFile).toBeGreaterThanOrEqual(20)
  })

  it("generates every category at several depths", () => {
    const depths = depthsById(tree10k)
    const stockId = findFolder(tree10k, "Stock footage").id
    const generatedFiles = tree10k
      .slice(CURATED_RECORDS.length)
      .filter((record) => record.type === "file")
    const depthsByCategory = new Map<FileCategory, Set<number>>()
    for (const file of generatedFiles) {
      if (file.parentId === stockId) continue
      const fileDepths = depthsByCategory.get(file.category) ?? new Set()
      fileDepths.add(depths.get(file.id)!)
      depthsByCategory.set(file.category, fileDepths)
    }
    expect([...depthsByCategory.keys()].sort()).toEqual([
      "audio",
      "doc",
      "image",
      "video",
    ])
    for (const fileDepths of depthsByCategory.values()) {
      expect(fileDepths.size).toBeGreaterThanOrEqual(3)
    }
  })

  it("keeps sizes within 0..500 MB and previews within the verified pool", () => {
    const invalid = tree50k.filter(
      (record) =>
        record.type === "file" &&
        (!Number.isInteger(record.sizeInBytes) ||
          record.sizeInBytes < 0 ||
          record.sizeInBytes > 500 * MB ||
          !PREVIEW_URLS[record.category].includes(record.previewUrl))
    )
    expect(invalid).toEqual([])
  })
})
