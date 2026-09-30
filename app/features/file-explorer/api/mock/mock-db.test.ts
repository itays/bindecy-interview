import { describe, expect, it, vi } from "vitest"

import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type { ApiErrorCode } from "~/features/file-explorer/api/file-explorer-api"
import { compareNodes, sortKey } from "~/features/file-explorer/domain/sort"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type { NodeSummary } from "~/features/file-explorer/domain/types"

import { generateTree } from "./generate-tree"
import type { MockFileRecord, MockRecord } from "./generate-tree"
import { createMockDb } from "./mock-db"
import type { MockDb, MockListOptions } from "./mock-db"

const tree10k = generateTree({ seed: 1, nodes: 10_000 })
const db10k = createMockDb(tree10k)

const folder = (
  id: string,
  name: string,
  parentId: string | null = null
): MockRecord => ({ id, parentId, name, type: "folder" })

const file = (
  id: string,
  name: string,
  parentId: string | null = null
): MockFileRecord => ({
  id,
  parentId,
  name,
  type: "file",
  category: "image",
  sizeInBytes: 100,
  previewUrl: `https://example.com/${id}.png`,
})

// Nested folders, an empty folder, top-level files and mixed-case names.
const SMALL_TREE: MockRecord[] = [
  folder("a", "alpha"),
  folder("b", "Beta", "a"),
  file("b1", "b1.png", "b"),
  file("b2", "B2.png", "b"),
  folder("e", "empty", "a"),
  file("a1", "a1.png", "a"),
  folder("z", "Zulu"),
  file("t1", "top.png"),
]

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id)

function listAll(
  db: MockDb,
  folderId: string | null,
  options: Omit<MockListOptions, "cursor">
) {
  const items: NodeSummary[] = []
  const totals: number[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const page = db.listChildren(folderId, { ...options, cursor })
    items.push(...page.items)
    totals.push(page.total)
    cursor = page.nextCursor ?? undefined
    pages++
  } while (cursor !== undefined)
  return { items, totals, pages }
}

function expectApiError(run: () => unknown, code: ApiErrorCode) {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
    return
  }
  expect.fail(`expected ApiError(${code})`)
}

/** Inserts a file the way the mock mutations do: sorted slot plus aggregates. */
function insertFile(db: MockDb, record: MockFileRecord) {
  const { records, sortKeys, childIds, fileCounts, upperBound } = db.internal
  const key = sortKey(record)
  const siblings = childIds.get(record.parentId ?? ROOT_ID)!
  records.set(record.id, record)
  sortKeys.set(record.id, key)
  siblings.splice(upperBound(siblings, key), 0, record.id)
  for (let id: string | null = record.parentId; id !== null;) {
    fileCounts.set(id, fileCounts.get(id)! + 1)
    id = records.get(id)!.parentId
  }
  fileCounts.set(ROOT_ID, fileCounts.get(ROOT_ID)! + 1)
}

describe("listChildren", () => {
  it("pages a 5k folder with no gaps or duplicates", () => {
    const expected = tree10k
      .filter((record) => record.parentId === "folder-stock-footage")
      .sort(compareNodes)

    const { items, totals, pages } = listAll(db10k, "folder-stock-footage", {
      limit: 100,
    })

    expect(expected).toHaveLength(5_000)
    expect(pages).toBe(50)
    expect(ids(items)).toEqual(ids(expected))
    expect(totals.every((total) => total === 5_000)).toBe(true)
  })

  it("returns nextCursor null exactly on the last page", () => {
    const db = createMockDb(SMALL_TREE)

    const first = db.listChildren("a", { limit: 2 })
    const last = db.listChildren("a", {
      limit: 2,
      cursor: first.nextCursor!,
    })

    expect(first.nextCursor).not.toBeNull()
    expect(ids(last.items)).toEqual(["a1"])
    expect(last.nextCursor).toBeNull()
    expect(db.listChildren("a", { limit: 3 }).nextCursor).toBeNull()
  })

  it("lists the top level for null, folders first, with list-only fields", () => {
    const db = createMockDb(SMALL_TREE)

    expect(db.listChildren(null, { limit: 10 })).toEqual({
      items: [
        {
          id: "a",
          name: "alpha",
          parentId: null,
          type: "folder",
          childCount: 3,
          fileCount: 3,
        },
        {
          id: "z",
          name: "Zulu",
          parentId: null,
          type: "folder",
          childCount: 0,
          fileCount: 0,
        },
        {
          id: "t1",
          name: "top.png",
          parentId: null,
          type: "file",
          category: "image",
          sizeInBytes: 100,
        },
      ],
      nextCursor: null,
      total: 3,
    })
  })

  it("aggregates direct children and descendant files per folder", () => {
    const db = createMockDb(SMALL_TREE)

    const counts = db
      .listChildren("a", { limit: 10 })
      .items.map((item) =>
        item.type === "folder"
          ? [item.id, item.childCount, item.fileCount]
          : [item.id]
      )

    expect(counts).toEqual([["b", 2, 2], ["e", 0, 0], ["a1"]])
    expect(ids(db.listChildren("b", { limit: 10 }).items)).toEqual(["b1", "b2"])
    expect(db.stats()).toEqual({ fileCount: 4 })
  })

  it("returns fresh objects that callers may mutate", () => {
    const db = createMockDb(SMALL_TREE)

    const [first] = db.listChildren(null, { limit: 1 }).items
    first.name = "changed"

    expect(db.listChildren(null, { limit: 1 }).items[0].name).toBe("alpha")
    expect(db.getNode("a").name).toBe("alpha")
  })

  it("keeps a cursor valid after an insert before it", () => {
    const db = createMockDb([...SMALL_TREE, file("b3", "b3.png", "b")])
    const first = db.listChildren("b", { limit: 2 })

    insertFile(db, file("new-before", "b0.png", "b"))
    insertFile(db, file("new-after", "b9.png", "b"))
    const next = db.listChildren("b", { limit: 10, cursor: first.nextCursor! })

    expect(ids(first.items)).toEqual(["b1", "b2"])
    expect(ids(next.items)).toEqual(["b3", "new-after"])
    expect(next.total).toBe(5)
  })

  it("keeps a cursor valid after its last item is removed", () => {
    const db = createMockDb([...SMALL_TREE, file("b3", "b3.png", "b")])
    const first = db.listChildren("b", { limit: 2 })

    const siblings = db.internal.childIds.get("b")!
    siblings.splice(siblings.indexOf("b2"), 1)
    const next = db.listChildren("b", { limit: 10, cursor: first.nextCursor! })

    expect(ids(next.items)).toEqual(["b3"])
  })

  it("restricts items and total to includeIds and pages over them", () => {
    const children = db10k.internal.childIds.get("folder-stock-footage")!
    const kept = children.filter((_, index) => index % 3 === 0)
    // Ids outside the folder must not leak in or inflate the total.
    const includeIds = new Set([...kept, "folder-deep-archive"])

    const { items, totals } = listAll(db10k, "folder-stock-footage", {
      limit: 7,
      includeIds,
    })

    expect(ids(items)).toEqual(kept)
    expect(totals.every((total) => total === kept.length)).toBe(true)
  })

  it.each([
    ["an unknown folder", "missing"],
    ["a file", "t1"],
    ["the root key", ROOT_ID],
  ])("rejects %s with not-found", (_, folderId) => {
    const db = createMockDb(SMALL_TREE)
    expectApiError(() => db.listChildren(folderId, { limit: 1 }), "not-found")
  })

  it.each([
    ["non-base64", "%%%"],
    ["non-JSON", btoa("not json")],
    ["a non-array", btoa("{}")],
    ["a wrong rank", btoa('[2,"a","b"]')],
    ["a short key", btoa('[0,"a"]')],
    ["a non-string id", btoa('[0,"a",1]')],
  ])("rejects %s cursor with validation", (_, cursor) => {
    const db = createMockDb(SMALL_TREE)
    expectApiError(
      () => db.listChildren(null, { limit: 1, cursor }),
      "validation"
    )
  })

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects limit %s with validation",
    (limit) => {
      const db = createMockDb(SMALL_TREE)
      expectApiError(() => db.listChildren(null, { limit }), "validation")
    }
  )

  it("accepts limit 1", () => {
    const db = createMockDb(SMALL_TREE)
    const page = db.listChildren(null, { limit: 1 })

    expect(ids(page.items)).toEqual(["a"])
    expect(page.nextCursor).not.toBeNull()
  })

  it("round-trips cursors for non-Latin-1 names", () => {
    const db = createMockDb([file("f1", "日本.png"), file("f2", "😀.png")])
    const first = db.listChildren(null, { limit: 1 })
    const next = db.listChildren(null, { limit: 1, cursor: first.nextCursor! })

    expect(new Set(ids([...first.items, ...next.items]))).toEqual(
      new Set(["f1", "f2"])
    )
  })
})

describe("getNode", () => {
  it("returns the full ancestor chain for the deepest file", () => {
    const deepest = tree10k.find((record) => record.name === "Level 22")!
    const deepFile = tree10k.find((record) => record.parentId === deepest.id)!

    const detail = db10k.getNode(deepFile.id)

    const levels = Array.from(
      { length: 20 },
      (_, index) => `Level ${String(index + 3).padStart(2, "0")}`
    )
    expect(detail.ancestors.map((ancestor) => ancestor.name)).toEqual([
      "Asset library",
      "Deep archive",
      ...levels,
    ])
    expect(detail.ancestors.slice(0, 2).map((ancestor) => ancestor.id)).toEqual(
      ["folder-asset-library", "folder-deep-archive"]
    )
    expect(detail.ancestors.at(-1)!.id).toBe(deepest.id)
  })

  it("returns a file with its preview URL", () => {
    const db = createMockDb(SMALL_TREE)

    expect(db.getNode("b1")).toEqual({
      id: "b1",
      name: "b1.png",
      parentId: "b",
      type: "file",
      category: "image",
      sizeInBytes: 100,
      previewUrl: "https://example.com/b1.png",
      ancestors: [
        { id: "a", name: "alpha" },
        { id: "b", name: "Beta" },
      ],
    })
  })

  it("returns a top-level folder with empty ancestors and its aggregates", () => {
    const db = createMockDb(SMALL_TREE)

    expect(db.getNode("a")).toEqual({
      id: "a",
      name: "alpha",
      parentId: null,
      type: "folder",
      childCount: 3,
      fileCount: 3,
      ancestors: [],
    })
  })

  it("rejects an unknown id with not-found", () => {
    expectApiError(() => db10k.getNode("missing"), "not-found")
  })
})

describe("stats", () => {
  it("counts every file in the tree", () => {
    const files = tree10k.filter((record) => record.type === "file").length
    expect(db10k.stats()).toEqual({ fileCount: files })
  })
})

describe("mutation listeners", () => {
  it("deliver emitted events until unsubscribed", () => {
    const db = createMockDb(SMALL_TREE)
    const kept = vi.fn()
    const removed = vi.fn()
    db.onMutate(kept)
    const unsubscribe = db.onMutate(removed)

    db.emitMutation({ type: "create", id: "x" })
    unsubscribe()
    db.emitMutation({ type: "delete", deletedIds: ["x"] })

    expect(removed.mock.calls).toEqual([[{ type: "create", id: "x" }]])
    expect(kept.mock.calls).toEqual([
      [{ type: "create", id: "x" }],
      [{ type: "delete", deletedIds: ["x"] }],
    ])
  })
})
