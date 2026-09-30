import { describe, expect, it } from "vitest"

import { compareNodes, compareSortKeys, sortKey } from "./sort"
import type { SortKey } from "./sort"
import type { NodeSummary } from "./types"

type Sortable = Pick<NodeSummary, "id" | "name" | "type">

const folder = (id: string, name: string): Sortable => ({
  id,
  name,
  type: "folder",
})
const file = (id: string, name: string): Sortable => ({
  id,
  name,
  type: "file",
})

const ids = (nodes: Sortable[]) => nodes.map((node) => node.id)

// Deterministic Fisher-Yates so failures are reproducible.
function shuffle<T>(items: T[], seed: number) {
  const result = [...items]
  let state = seed
  for (let i = result.length - 1; i > 0; i--) {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31
    const j = state % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const ordered: Sortable[] = [
  folder("f-a", "alpha"),
  folder("f-b1", "Beta"),
  folder("f-b2", "beta"),
  folder("f-z", "Zulu"),
  file("a-1", "a.txt"),
  file("a-2", "A.txt"),
  file("b", "b.mp3"),
  file("c", "C.png"),
  file("z", "zz.mp4"),
]

describe("compareNodes", () => {
  it("puts folders before files regardless of name", () => {
    expect(compareNodes(folder("f", "zzz"), file("a", "aaa"))).toBeLessThan(0)
    expect(compareNodes(file("a", "aaa"), folder("f", "zzz"))).toBeGreaterThan(
      0
    )
  })

  it("orders names case-insensitively", () => {
    expect(compareNodes(file("1", "apple"), file("2", "Banana"))).toBeLessThan(
      0
    )
    expect(compareNodes(file("1", "Apple"), file("2", "banana"))).toBeLessThan(
      0
    )
    expect(compareNodes(file("1", "b"), file("2", "A"))).toBeGreaterThan(0)
  })

  it("breaks a tie on names differing only in case by id", () => {
    expect(compareNodes(file("a", "Readme"), file("b", "readme"))).toBeLessThan(
      0
    )
    expect(
      compareNodes(file("b", "readme"), file("a", "Readme"))
    ).toBeGreaterThan(0)
  })

  it("returns 0 only for the same id", () => {
    expect(compareNodes(file("x", "same"), file("x", "same"))).toBe(0)
    expect(compareNodes(file("x", "same"), file("y", "same"))).not.toBe(0)
  })

  it.each([1, 7, 42, 1_234])(
    "sorts a shuffled mixed list into listing order (seed %d)",
    (seed) => {
      expect(ids(shuffle(ordered, seed).sort(compareNodes))).toEqual(
        ids(ordered)
      )
    }
  )
})

describe("sortKey / compareSortKeys", () => {
  it("agrees in sign with compareNodes for every pair", () => {
    for (const a of ordered) {
      for (const b of ordered) {
        expect(Math.sign(compareSortKeys(sortKey(a), sortKey(b)))).toBe(
          Math.sign(compareNodes(a, b))
        )
      }
    }
  })

  it("sorts a shuffled list into the same order as compareNodes", () => {
    const byKey = shuffle(ordered, 99)
      .map((node) => ({ node, key: sortKey(node) }))
      .sort((a, b) => compareSortKeys(a.key, b.key))
      .map(({ node }) => node)

    expect(ids(byKey)).toEqual(ids([...shuffle(ordered, 5)].sort(compareNodes)))
  })

  it("keeps its comparison result through a JSON round-trip", () => {
    for (const a of ordered) {
      for (const b of ordered) {
        const revived = JSON.parse(JSON.stringify(sortKey(a))) as SortKey
        expect(Math.sign(compareSortKeys(revived, sortKey(b)))).toBe(
          Math.sign(compareSortKeys(sortKey(a), sortKey(b)))
        )
      }
    }
  })
})
