import { describe, expect, it } from "vitest"

import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type {
  ApiErrorCode,
  CreateFileInput,
} from "~/features/file-explorer/api/file-explorer-api"
import { compareNodes } from "~/features/file-explorer/domain/sort"
import type { NodeSummary } from "~/features/file-explorer/domain/types"

import { generateTree } from "./generate-tree"
import type { MockFileRecord, MockRecord } from "./generate-tree"
import { createMockDb } from "./mock-db"
import type { MockDb, MockMutationEvent } from "./mock-db"
import { createMockMutations } from "./mock-mutations"
import type { MockMutations } from "./mock-mutations"

// Records are never mutated in place, so every test can index the same tree.
const TREE_10K = generateTree({ seed: 1, nodes: 10_000 })

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

// a/{b/{b1,b2}, e/, a1}, z/, t1 — nested folders, an empty folder, mixed case.
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

// Single-letter names keep the listing order obvious.
const LETTERS: MockRecord[] = [
  folder("l", "letters"),
  ...["a", "c", "e", "g", "i"].map((name) => file(name, name, "l")),
]

const newFile = (
  parentId: string | null,
  name: string,
  sizeInBytes = 10
): CreateFileInput => ({
  parentId,
  name,
  category: "doc",
  sizeInBytes,
  previewUrl: "https://example.com/new.png",
})

function setup(records: readonly MockRecord[] = SMALL_TREE) {
  const db = createMockDb(records)
  const events: MockMutationEvent[] = []
  db.onMutate((event) => events.push(event))
  return { db, mutations: createMockMutations(db), events }
}

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id)

const listIds = (db: MockDb, folderId: string | null) =>
  ids(db.listChildren(folderId, { limit: 1_000 }).items)

const fileCountOf = (db: MockDb, id: string) => {
  const node = db.getNode(id)
  if (node.type !== "folder") throw new Error(`${id} is not a folder`)
  return node.fileCount
}

/** Every listing reachable from the top level, plus the stats. */
function dump(db: MockDb) {
  const listings: Record<string, NodeSummary[]> = {}
  const pending: (string | null)[] = [null]
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    const { items } = db.listChildren(id, { limit: 1_000 })
    listings[id ?? "(top)"] = items
    for (const item of items) if (item.type === "folder") pending.push(item.id)
  }
  return { listings, stats: db.stats() }
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

describe("createFolder / createFile", () => {
  it("inserts folders before files in case-insensitive name order", () => {
    const { db, mutations } = setup()

    const folderC = mutations.createFolder({ parentId: "a", name: "Charlie" })
    const folderAa = mutations.createFolder({ parentId: "a", name: "aardvark" })
    const fileA0 = mutations.createFile(newFile("a", "A0.PNG"))
    const fileZ = mutations.createFile(newFile("a", "zz.png"))

    expect(listIds(db, "a")).toEqual([
      folderAa.id,
      "b",
      folderC.id,
      "e",
      fileA0.id,
      "a1",
      fileZ.id,
    ])
  })

  it("puts a new item on the page its sort position belongs to", () => {
    const { db, mutations } = setup(LETTERS)

    const created = mutations.createFile(newFile("l", "D"))
    const first = db.listChildren("l", { limit: 2 })
    const second = db.listChildren("l", {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    })

    expect(ids(first.items)).toEqual(["a", "c"])
    expect(ids(second.items)).toEqual([created.id, "e"])
    expect(second.total).toBe(6)
  })

  it("keeps a large folder sorted after an insert in the middle", () => {
    const { db, mutations } = setup(TREE_10K)
    const before = db.listChildren("folder-stock-footage", { limit: 10_000 })
    const middle = before.items[2_500]

    const created = mutations.createFile(
      newFile("folder-stock-footage", `${middle.name.toUpperCase()} (2)`)
    )

    const expected = [...before.items, created].sort(compareNodes)
    const after = db.listChildren("folder-stock-footage", { limit: 10_000 })
    expect(ids(after.items)).toEqual(ids(expected))
    expect(after.total).toBe(5_001)
  })

  it.each([0, 2_500, 4_999])(
    "finds a conflict at index %i of a large folder",
    (index) => {
      const { db, mutations } = setup(TREE_10K)
      const { items } = db.listChildren("folder-stock-footage", {
        limit: 10_000,
      })

      expectApiError(
        () =>
          mutations.createFile(
            newFile("folder-stock-footage", items[index].name.toUpperCase())
          ),
        "conflict"
      )
    }
  )

  it("returns the listing summary with the trimmed name", () => {
    const { db, mutations } = setup()

    const created = mutations.createFolder({ parentId: "a", name: "  New  " })
    const createdFile = mutations.createFile(newFile(null, " n.txt ", 42))

    expect(created).toEqual({
      id: created.id,
      name: "New",
      parentId: "a",
      type: "folder",
      childCount: 0,
      fileCount: 0,
    })
    expect(createdFile).toEqual({
      id: createdFile.id,
      name: "n.txt",
      parentId: null,
      type: "file",
      category: "doc",
      sizeInBytes: 42,
    })
    expect(db.getNode(createdFile.id)).toMatchObject({
      ancestors: [],
      previewUrl: "https://example.com/new.png",
    })
    expect(db.listChildren(created.id, { limit: 1 }).total).toBe(0)
    expect(db.getNode(created.id).ancestors).toEqual([
      { id: "a", name: "alpha" },
    ])
  })

  it("adds a new file to every ancestor's fileCount and the stats", () => {
    const { db, mutations } = setup()
    const inner = mutations.createFolder({ parentId: "b", name: "inner" })

    mutations.createFile(newFile(inner.id, "deep.png"))

    expect(fileCountOf(db, inner.id)).toBe(1)
    expect(fileCountOf(db, "b")).toBe(3)
    expect(fileCountOf(db, "a")).toBe(4)
    expect(fileCountOf(db, "z")).toBe(0)
    expect(db.stats()).toEqual({ fileCount: 5 })
  })

  it("counts a top-level file only in the stats", () => {
    const { db, mutations } = setup()

    mutations.createFile(newFile(null, "readme.md"))

    expect(fileCountOf(db, "a")).toBe(3)
    expect(db.stats()).toEqual({ fileCount: 5 })
  })

  it("creates folders without changing any fileCount", () => {
    const { db, mutations } = setup()

    mutations.createFolder({ parentId: "a", name: "more" })

    expect(db.getNode("a")).toMatchObject({ childCount: 4, fileCount: 3 })
    expect(db.stats()).toEqual({ fileCount: 4 })
  })

  it("skips taken ids and never reuses a deleted one", () => {
    const { mutations } = setup([...SMALL_TREE, folder("folder-new-1", "x")])

    const first = mutations.createFolder({ parentId: null, name: "one" })
    mutations.deleteNode(first.id)
    const second = mutations.createFolder({ parentId: null, name: "two" })

    expect(first.id).toBe("folder-new-2")
    expect(second.id).toBe("folder-new-3")
  })

  it.each([
    ["a folder, differently cased", "a", "folder", "BETA"],
    ["a folder, as a file", "a", "file", "beta"],
    ["a file, as a folder", "b", "folder", "b2.PNG"],
    ["a file, padded", "b", "file", "  B2.png "],
  ] as const)(
    "rejects the name of %s sibling with conflict",
    (_, parentId, type, name) => {
      const { db, mutations, events } = setup()
      const before = dump(db)

      expectApiError(
        () =>
          type === "folder"
            ? mutations.createFolder({ parentId, name })
            : mutations.createFile(newFile(parentId, name)),
        "conflict"
      )

      expect(dump(db)).toEqual(before)
      expect(events).toEqual([])
    }
  )

  it("allows a name used outside the siblings", () => {
    const { db, mutations } = setup()

    const elsewhere = mutations.createFile(newFile("z", "B2.png"))
    const parentName = mutations.createFolder({ parentId: "b", name: "beta" })

    expect(listIds(db, "z")).toEqual([elsewhere.id])
    expect(listIds(db, "b")).toEqual([parentName.id, "b1", "b2"])
  })

  it.each<[string, ApiErrorCode, (mutations: MockMutations) => unknown]>([
    [
      "an empty folder name",
      "validation",
      (m) => m.createFolder({ parentId: "a", name: "" }),
    ],
    [
      "a blank file name",
      "validation",
      (m) => m.createFile(newFile("a", " \t ")),
    ],
    [
      "a file parent",
      "validation",
      (m) => m.createFolder({ parentId: "a1", name: "x" }),
    ],
    [
      "a file under a file",
      "validation",
      (m) => m.createFile(newFile("t1", "x")),
    ],
    [
      "a negative size",
      "validation",
      (m) => m.createFile(newFile("a", "x", -1)),
    ],
    [
      "a fractional size",
      "validation",
      (m) => m.createFile(newFile("a", "x", 1.5)),
    ],
    [
      "a NaN size",
      "validation",
      (m) => m.createFile(newFile("a", "x", Number.NaN)),
    ],
    [
      "an infinite size",
      "validation",
      (m) => m.createFile(newFile("a", "x", Number.POSITIVE_INFINITY)),
    ],
    [
      "an unknown parent",
      "not-found",
      (m) => m.createFolder({ parentId: "missing", name: "x" }),
    ],
    [
      "the root key as parent",
      "not-found",
      (m) => m.createFile(newFile("root", "x")),
    ],
  ])("rejects %s with %s and changes nothing", (_, code, run) => {
    const { db, mutations, events } = setup()
    const before = dump(db)

    expectApiError(() => run(mutations), code)

    expect(dump(db)).toEqual(before)
    expect(events).toEqual([])
  })

  it("accepts a zero-byte file", () => {
    const { mutations } = setup()

    expect(mutations.createFile(newFile("a", "empty.txt", 0))).toMatchObject({
      sizeInBytes: 0,
    })
  })
})

describe("deleteNode", () => {
  it("returns the node and its whole subtree in pre-order", () => {
    const { mutations } = setup()

    expect(mutations.deleteNode("a")).toEqual({
      deletedIds: ["a", "b", "b1", "b2", "e", "a1"],
    })
  })

  it("removes every deleted id and keeps everything else", () => {
    const { db, mutations } = setup()

    const { deletedIds } = mutations.deleteNode("a")

    for (const id of deletedIds) {
      expectApiError(() => db.getNode(id), "not-found")
    }
    expectApiError(() => db.listChildren("b", { limit: 1 }), "not-found")
    expect(listIds(db, null)).toEqual(["z", "t1"])
    expect(db.stats()).toEqual({ fileCount: 1 })
  })

  it("subtracts the subtree's files from every ancestor", () => {
    const { db, mutations } = setup()
    const inner = mutations.createFolder({ parentId: "b", name: "inner" })
    mutations.createFile(newFile(inner.id, "deep.png"))

    mutations.deleteNode("b")

    expect(db.getNode("a")).toMatchObject({ childCount: 2, fileCount: 1 })
    expect(db.stats()).toEqual({ fileCount: 2 })
  })

  it("deletes a single file", () => {
    const { db, mutations } = setup()

    expect(mutations.deleteNode("b2")).toEqual({ deletedIds: ["b2"] })

    expect(listIds(db, "b")).toEqual(["b1"])
    expect(fileCountOf(db, "a")).toBe(2)
    expect(db.stats()).toEqual({ fileCount: 3 })
  })

  it("frees the name for a new sibling", () => {
    const { db, mutations } = setup()

    mutations.deleteNode("b")
    const recreated = mutations.createFolder({ parentId: "a", name: "beta" })

    expect(listIds(db, "a")).toEqual([recreated.id, "e", "a1"])
  })

  it.each([
    ["the root key", "root", "validation"],
    ["an unknown id", "missing", "not-found"],
  ] as const)("rejects %s with %s and changes nothing", (_, id, code) => {
    const { db, mutations, events } = setup()
    const before = dump(db)

    expectApiError(() => mutations.deleteNode(id), code)

    expect(dump(db)).toEqual(before)
    expect(events).toEqual([])
  })
})

describe("mutation events", () => {
  it("emits exactly one event per successful mutation", () => {
    const { mutations, events } = setup()

    const folderNode = mutations.createFolder({ parentId: null, name: "new" })
    const fileNode = mutations.createFile(newFile(folderNode.id, "f.png"))
    const { deletedIds } = mutations.deleteNode(folderNode.id)

    expect(events).toEqual([
      { type: "create", id: folderNode.id },
      { type: "create", id: fileNode.id },
      { type: "delete", deletedIds },
    ])
  })

  it("emits after the db reflects the change", () => {
    const db = createMockDb(SMALL_TREE)
    const mutations = createMockMutations(db)
    const seen: unknown[] = []
    db.onMutate((event) => {
      seen.push(
        event.type === "create"
          ? db.getNode(event.id).parentId
          : [db.stats().fileCount, listIds(db, "a")]
      )
    })

    mutations.createFile(newFile("a", "x.png"))
    mutations.deleteNode("b")

    expect(seen).toEqual(["a", [3, ["e", "a1", "file-new-1"]]])
  })
})

describe("cursors across mutations", () => {
  it("pages over survivors without gaps or duplicates", () => {
    const { db, mutations } = setup(LETTERS)
    const first = db.listChildren("l", { limit: 2 })

    mutations.createFile(newFile("l", "B"))
    const after = mutations.createFile(newFile("l", "F"))
    mutations.deleteNode("c")
    mutations.deleteNode("g")
    const rest = db.listChildren("l", {
      limit: 10,
      cursor: first.nextCursor ?? undefined,
    })

    expect(ids(first.items)).toEqual(["a", "c"])
    expect(ids(rest.items)).toEqual(["e", after.id, "i"])
    expect(rest.total).toBe(5)
  })
})
