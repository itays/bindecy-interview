import { describe, expect, it } from "vitest"

import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type { ApiErrorCode } from "~/features/file-explorer/api/file-explorer-api"
import { EMPTY_QUERY } from "~/features/file-explorer/domain/filters"
import { sortKey } from "~/features/file-explorer/domain/sort"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type {
  FileCategory,
  FileQuery,
  NodeSummary,
  SearchHit,
} from "~/features/file-explorer/domain/types"

import { generateTree } from "./generate-tree"
import type { MockFileRecord, MockRecord } from "./generate-tree"
import { createMockDb } from "./mock-db"
import type { MockDb } from "./mock-db"
import { createQueryIndex } from "./mock-query-index"
import type { QueryIndex, QueryPageOptions } from "./mock-query-index"

const MB = 1_048_576

const folder = (
  id: string,
  name: string,
  parentId: string | null = null
): MockRecord => ({ id, parentId, name, type: "folder" })

const file = (
  id: string,
  name: string,
  parentId: string | null,
  category: FileCategory,
  sizeInBytes: number
): MockFileRecord => ({
  id,
  parentId,
  name,
  type: "file",
  category,
  sizeInBytes,
  previewUrl: `https://example.com/${id}`,
})

// The old `file-tree-utils.test.ts` fixture plus an empty folder below
// "Images" and a top-level video. Tree order of the files:
// thumbnail, hero, audio, video, notes.
const RECORDS: MockRecord[] = [
  folder("campaign", "Campaign"),
  file("audio", "theme.mp3", "campaign", "audio", 2 * MB),
  folder("images", "Images", "campaign"),
  file("hero", "Hero.JPG", "images", "image", 5 * MB),
  folder("deep", "Deep", "images"),
  file("thumbnail", "thumbnail.png", "deep", "image", MB),
  folder("drafts", "Drafts", "images"),
  file("notes", "notes.pdf", null, "doc", 0),
  folder("empty", "Empty folder"),
  file("video", "launch.mp4", null, "video", 10 * MB),
]

const ALL_FILES = ["thumbnail", "hero", "audio", "video", "notes"]

const tree10k = generateTree({ seed: 1, nodes: 10_000 })
const db10k = createMockDb(tree10k)
const index10k = createQueryIndex(db10k)

const query = (overrides: Partial<FileQuery>): FileQuery => ({
  ...EMPTY_QUERY,
  ...overrides,
})

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id)

function setup(records: readonly MockRecord[] = RECORDS) {
  const db = createMockDb(records.map((record) => ({ ...record })))
  return { db, index: createQueryIndex(db) }
}

function evaluate(fileQuery: FileQuery) {
  const { matchedFileIds, keptIds } = setup().index.evaluate(fileQuery)
  return { matched: [...matchedFileIds], kept: new Set(keptIds) }
}

function searchAll(index: QueryIndex, fileQuery: FileQuery, limit: number) {
  const hits: SearchHit[] = []
  const totals = new Set<number>()
  let cursor: string | undefined
  do {
    const page = index.search(fileQuery, { cursor, limit })
    hits.push(...page.items)
    totals.add(page.total)
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined)
  return { hits, totals }
}

function listAll(
  index: QueryIndex,
  folderId: string | null,
  fileQuery: FileQuery,
  limit: number
) {
  const items: NodeSummary[] = []
  const totals = new Set<number>()
  let cursor: string | undefined
  do {
    const page = index.listChildren(folderId, fileQuery, { cursor, limit })
    items.push(...page.items)
    totals.add(page.total)
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined)
  return { items, totals }
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

/** Inserts a file the way the mock mutations do, then emits the event. */
function insertFile(db: MockDb, record: MockFileRecord) {
  const { records, sortKeys, childIds, upperBound } = db.internal
  const key = sortKey(record)
  const siblings = childIds.get(record.parentId ?? ROOT_ID) ?? []
  records.set(record.id, record)
  sortKeys.set(record.id, key)
  siblings.splice(upperBound(siblings, key), 0, record.id)
  db.emitMutation({ type: "create", id: record.id })
}

/** Removes a file the way the mock mutations do, then emits the event. */
function deleteFile(db: MockDb, id: string) {
  const { records, sortKeys, childIds } = db.internal
  const siblings = childIds.get(records.get(id)?.parentId ?? ROOT_ID) ?? []
  siblings.splice(siblings.indexOf(id), 1)
  records.delete(id)
  sortKeys.delete(id)
  db.emitMutation({ type: "delete", deletedIds: [id] })
}

describe("evaluate: filter semantics", () => {
  it("matches nothing in an empty project", () => {
    const { index } = setup([])

    const evaluation = index.evaluate(query({ name: "a" }))

    expect(evaluation.matchedFileIds).toEqual([])
    expect(evaluation.keptIds.size).toBe(0)
  })

  it("treats an inactive query as matching every file and keeping every node", () => {
    const { matched, kept } = evaluate(EMPTY_QUERY)

    expect(matched).toEqual(ALL_FILES)
    expect(kept).toEqual(new Set(RECORDS.map((record) => record.id)))
  })

  it("combines a case-insensitive name, inclusive sizes and categories", () => {
    const { matched, kept } = evaluate(
      query({
        name: "  HERO  ",
        minBytes: 5 * MB,
        maxBytes: 5 * MB,
        categories: ["image"],
      })
    )

    expect(matched).toEqual(["hero"])
    expect(kept).toEqual(new Set(["campaign", "images", "hero"]))
  })

  it.each([
    ["a closed range", MB, 2 * MB, ["thumbnail", "audio"]],
    ["an open maximum", 2 * MB, null, ["hero", "audio", "video"]],
    ["a zero maximum", null, 0, ["notes"]],
    ["an equal minimum and maximum", 5 * MB, 5 * MB, ["hero"]],
    ["a zero minimum (documents and video included)", 0, null, ALL_FILES],
  ] as const)(
    "applies inclusive size bounds for %s",
    (_label, minBytes, maxBytes, expected) => {
      expect(evaluate(query({ minBytes, maxBytes })).matched).toEqual(expected)
    }
  )

  it.each([
    [["audio"], ["audio"]],
    [["image"], ["thumbnail", "hero"]],
    [
      ["audio", "image"],
      ["thumbnail", "hero", "audio"],
    ],
    [["video"], ["video"]],
    [
      ["audio", "image", "video"],
      ["thumbnail", "hero", "audio", "video"],
    ],
  ] as const)(
    "combines categories %j with OR and excludes documents",
    (categories, expected) => {
      expect(evaluate(query({ categories: [...categories] })).matched).toEqual(
        expected
      )
    }
  )

  it("matches a file by its own name", () => {
    const { matched, kept } = evaluate(query({ name: "theme" }))

    expect(matched).toEqual(["audio"])
    expect(kept).toEqual(new Set(["campaign", "audio"]))
  })

  it("keeps a name-matched folder's complete subtree for a name-only query", () => {
    const { index } = setup()

    const evaluation = index.evaluate(query({ name: "images" }))

    expect(evaluation.matchedFileIds).toEqual(["thumbnail", "hero"])
    expect(evaluation.keptIds).toEqual(
      new Set(["campaign", "images", "deep", "thumbnail", "drafts", "hero"])
    )
    expect(evaluation.folderNameMatches).toEqual(new Set(["images"]))
  })

  it("keeps a name-matched folder's descendants only if they pass size and category", () => {
    expect(
      evaluate(query({ name: "campaign", categories: ["audio"] }))
    ).toEqual({ matched: ["audio"], kept: new Set(["campaign", "audio"]) })
    // "Drafts" survives the name-only query but has no image to keep it here.
    expect(evaluate(query({ name: "images", categories: ["image"] }))).toEqual({
      matched: ["thumbnail", "hero"],
      kept: new Set(["campaign", "images", "deep", "thumbnail", "hero"]),
    })
  })

  it("keeps and counts every ancestor of a nested match", () => {
    const { index } = setup()

    const evaluation = index.evaluate(query({ name: "thumbnail" }))

    expect(evaluation.keptIds).toEqual(
      new Set(["campaign", "images", "deep", "thumbnail"])
    )
    expect(evaluation.matchCountByFolder).toEqual(
      new Map([
        ["deep", 1],
        ["images", 1],
        ["campaign", 1],
      ])
    )
  })

  it("keeps a folder without matching files only when its own name matches", () => {
    expect(evaluate(query({ name: "empty" }))).toEqual({
      matched: [],
      kept: new Set(["empty"]),
    })
    expect(evaluate(query({ name: "unknown" }))).toEqual({
      matched: [],
      kept: new Set(),
    })
  })

  it("counts a deep match on every ancestor of the 22-level chain", () => {
    const idOf = (name: string) => {
      const record = tree10k.find((candidate) => candidate.name === name)
      if (record === undefined) throw new Error(`Missing ${name}`)
      return record.id
    }
    const chainTop = idOf("Level 05")
    const bottom = idOf("Level 22")
    const leaf = tree10k.find((record) => record.parentId === bottom)
    if (leaf === undefined) throw new Error("Missing depth-22 file")
    const chainFiles = db10k.internal.fileCounts.get(chainTop)

    const { matchCountByFolder } = index10k.evaluate(
      query({ name: "level 05" })
    )

    const path = db10k.getNode(leaf.id).ancestors
    const chainStart = path.findIndex((ref) => ref.id === chainTop)
    expect(path).toHaveLength(22)
    expect(chainFiles).toBe(5)
    for (const [depth, ref] of path.entries()) {
      expect(matchCountByFolder.get(ref.id)).toBe(
        depth < chainStart ? chainFiles : db10k.internal.fileCounts.get(ref.id)
      )
    }
  })
})

describe("evaluate: cache", () => {
  it("shares one evaluation between queries with the same key", () => {
    const { index } = setup()

    const first = index.evaluate(
      query({ name: "Images", categories: ["image", "audio"] })
    )

    expect(
      index.evaluate(
        query({ name: " images ", categories: ["audio", "image"] })
      )
    ).toBe(first)
  })

  it("evicts the least recently used of more than five queries", () => {
    const { index } = setup()
    const queries = [1, 2, 3, 4, 5, 6].map((minBytes) => query({ minBytes }))
    const [first, second, third] = queries
      .slice(0, 5)
      .map((fileQuery) => index.evaluate(fileQuery))

    // Refresh the first query, then a sixth key evicts the second.
    expect(index.evaluate(queries[0])).toBe(first)
    index.evaluate(queries[5])

    expect(index.evaluate(queries[0])).toBe(first)
    expect(index.evaluate(queries[2])).toBe(third)
    expect(index.evaluate(queries[1])).not.toBe(second)
  })

  it("serves cached results until a mutation event clears them", () => {
    const { db, index } = setup()
    const large = query({ minBytes: 5 * MB })
    expect(index.stats(large).fileCount).toBe(2)

    const thumbnail = db.internal.records.get("thumbnail")
    if (thumbnail?.type !== "file") throw new Error("Missing thumbnail")
    thumbnail.sizeInBytes = 6 * MB
    expect(index.stats(large).fileCount).toBe(2)

    db.emitMutation({ type: "create", id: "thumbnail" })
    expect(index.stats(large).fileCount).toBe(3)
  })

  it("keeps serving cached results after dispose", () => {
    const { db, index } = setup()
    const large = query({ minBytes: 5 * MB })
    index.stats(large)
    index.dispose()

    db.internal.records.delete("hero")
    db.emitMutation({ type: "delete", deletedIds: ["hero"] })

    expect(index.stats(large).fileCount).toBe(2)
  })
})

describe("listChildren", () => {
  it("lists only kept children, with matchCount on folders", () => {
    const { index } = setup()

    const top = index.listChildren(null, query({ name: "images" }), {
      limit: 10,
    })
    const images = index.listChildren("images", query({ name: "images" }), {
      limit: 10,
    })

    expect(top).toEqual({
      items: [
        expect.objectContaining({
          id: "campaign",
          matchCount: 2,
          fileCount: 3,
        }),
      ],
      nextCursor: null,
      total: 1,
    })
    expect(images.items).toEqual([
      expect.objectContaining({ id: "deep", matchCount: 1 }),
      expect.objectContaining({ id: "drafts", matchCount: 0 }),
      expect.objectContaining({ id: "hero" }),
    ])
    expect(images.items[2]).not.toHaveProperty("matchCount")
  })

  it("lists every child for an inactive query, counting all files", () => {
    const { index } = setup()

    const page = index.listChildren(null, EMPTY_QUERY, { limit: 10 })

    expect(page.items).toEqual([
      expect.objectContaining({ id: "campaign", matchCount: 3 }),
      expect.objectContaining({ id: "empty", matchCount: 0 }),
      expect.objectContaining({ id: "video" }),
      expect.objectContaining({ id: "notes" }),
    ])
  })

  it("pages a filtered 5k folder with no gaps or duplicates", () => {
    const videos = query({ categories: ["video"] })
    const expected = ids(
      db10k
        .listChildren("folder-stock-footage", { limit: 10_000 })
        .items.filter(
          (item) => item.type === "file" && item.category === "video"
        )
    )

    const { items, totals } = listAll(
      index10k,
      "folder-stock-footage",
      videos,
      100
    )

    expect(expected.length).toBeGreaterThan(100)
    expect(ids(items)).toEqual(expected)
    expect(totals).toEqual(new Set([expected.length]))
  })

  it("returns fresh items", () => {
    const { index } = setup()
    const images = query({ name: "images" })

    const [campaign] = index.listChildren(null, images, { limit: 1 }).items
    campaign.name = "changed"
    if (campaign.type === "folder") campaign.matchCount = 99

    expect(index.listChildren(null, images, { limit: 1 }).items[0]).toEqual(
      expect.objectContaining({ name: "Campaign", matchCount: 2 })
    )
  })

  it.each([
    ["an unknown folder", "missing", { limit: 10 }, "not-found"],
    ["a file", "hero", { limit: 10 }, "not-found"],
    ["a zero limit", null, { limit: 0 }, "validation"],
    ["a malformed cursor", null, { limit: 10, cursor: "%%%" }, "validation"],
  ] as const)(
    "rejects %s",
    (_label, folderId, options: QueryPageOptions, code) => {
      const { index } = setup()

      expectApiError(
        () => index.listChildren(folderId, query({ name: "a" }), options),
        code
      )
    }
  )
})

describe("search", () => {
  it("returns hits in tree order with their ancestor ids", () => {
    const { index } = setup()

    const page = index.search(query({ minBytes: 0 }), { limit: 10 })

    expect(page.items.map(({ id, ancestorIds }) => [id, ancestorIds])).toEqual([
      ["thumbnail", ["campaign", "images", "deep"]],
      ["hero", ["campaign", "images"]],
      ["audio", ["campaign"]],
      ["video", []],
      ["notes", []],
    ])
    expect(page.items[0]).toEqual({
      id: "thumbnail",
      name: "thumbnail.png",
      parentId: "deep",
      type: "file",
      category: "image",
      sizeInBytes: MB,
      ancestorIds: ["campaign", "images", "deep"],
    })
    expect(page).toMatchObject({ nextCursor: null, total: 5 })
  })

  it("pages the 10k tree in depth-first listing order", () => {
    const audio = query({ categories: ["audio"] })
    const expected: string[] = []
    const visit = (folderId: string | null) => {
      for (const item of db10k.listChildren(folderId, { limit: 10_000 })
        .items) {
        if (item.type === "folder") visit(item.id)
        else if (item.category === "audio") expected.push(item.id)
      }
    }
    visit(null)

    const { hits, totals } = searchAll(index10k, audio, 100)

    expect(expected.length).toBeGreaterThan(100)
    expect(ids(hits)).toEqual(expected)
    expect(totals).toEqual(new Set([expected.length]))
    for (const hit of hits.slice(0, 50)) {
      expect(hit.ancestorIds).toEqual(ids(db10k.getNode(hit.id).ancestors))
    }
  })

  it("continues after the cursor when hits are created or deleted between pages", () => {
    const { db, index } = setup()
    const images = query({ categories: ["image"] })
    const first = index.search(images, { limit: 1 })
    const cursor = first.nextCursor ?? undefined
    expect(ids(first.items)).toEqual(["thumbnail"])

    insertFile(db, file("early", "a.png", "deep", "image", MB))
    insertFile(db, file("late", "zz.png", "images", "image", MB))
    const afterInserts = index.search(images, { limit: 10, cursor })
    expect(ids(afterInserts.items)).toEqual(["hero", "late"])
    expect(afterInserts.total).toBe(4)

    // The cursor's own hit is gone; its tree position still anchors the page.
    deleteFile(db, "thumbnail")
    const afterDelete = index.search(images, { limit: 10, cursor })
    expect(ids(afterDelete.items)).toEqual(["hero", "late"])
    expect(afterDelete.total).toBe(3)
  })

  it("counts matched files in stats", () => {
    const { index } = setup()

    expect(index.stats(query({ name: "images" }))).toEqual({ fileCount: 2 })
    expect(index.stats(EMPTY_QUERY)).toEqual({ fileCount: 5 })
  })

  it.each([
    ["not base64", "%%%"],
    ["not JSON", btoa("{")],
    ["an empty path", btoa("[]")],
    ["a listing cursor", btoa(JSON.stringify([1, "a.png", "a"]))],
    ["a bad sort key", btoa(JSON.stringify([[2, "a", "a"]]))],
  ])("rejects a cursor that is %s", (_label, cursor) => {
    const { index } = setup()

    expectApiError(
      () => index.search(query({ name: "a" }), { cursor, limit: 10 }),
      "validation"
    )
  })

  it.each([0, -1, 2.5])("rejects limit %s", (limit) => {
    const { index } = setup()

    expectApiError(
      () => index.search(query({ name: "a" }), { limit }),
      "validation"
    )
  })
})
