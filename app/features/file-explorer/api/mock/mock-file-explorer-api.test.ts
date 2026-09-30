import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type {
  CreateFileInput,
  FileExplorerApi,
} from "~/features/file-explorer/api/file-explorer-api"
import { EMPTY_QUERY } from "~/features/file-explorer/domain/filters"
import type { FileQuery } from "~/features/file-explorer/domain/types"

import { CURATED_RECORDS } from "./curated-fixture"
import { DEFAULT_MOCK_CONFIG, parseMockConfig } from "./mock-config"
import type { MockConfig } from "./mock-config"
import { createMockFileExplorerApi } from "./mock-file-explorer-api"

// Only the curated tree: Brand system/, Launch campaign/, Research/ and
// project-brief.pdf at the top level, 10 files in total.
const SMALL = { nodes: CURATED_RECORDS.length }
const TOP_LEVEL = { folderId: null, limit: 50 }
// "Launch campaign" matches by name, so its 4 files match too.
const LAUNCH: FileQuery = { ...EMPTY_QUERY, name: "launch" }

const newFile = (name: string): CreateFileInput => ({
  parentId: null,
  name,
  category: "doc",
  sizeInBytes: 10,
  previewUrl: "https://example.com/new.pdf",
})

/** Starts one call of every method; returns them with their names. */
function callEveryMethod(api: FileExplorerApi, signal?: AbortSignal) {
  return [
    ["listChildren", api.listChildren(TOP_LEVEL, signal)],
    ["getNode", api.getNode("folder-brand", signal)],
    ["search", api.search({ query: LAUNCH, limit: 10 }, signal)],
    ["getStats", api.getStats({}, signal)],
    ["createFolder", api.createFolder({ parentId: null, name: "New" })],
    ["createFile", api.createFile(newFile("new.pdf"))],
    ["deleteNode", api.deleteNode("file-project-brief")],
  ] as const
}

async function expectAbortError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason
  )
  expect(error).toBeInstanceOf(DOMException)
  expect(error).toHaveProperty("name", "AbortError")
}

async function expectNetworkError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason
  )
  expect(error).toBeInstanceOf(ApiError)
  expect(error).toHaveProperty("code", "network")
}

describe("createMockFileExplorerApi", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("latency", () => {
    it("resolves every method without timers when latency is 0", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })

      for (const [, call] of callEveryMethod(api)) await call

      expect(vi.getTimerCount()).toBe(0)
    })

    it.each([1, 2, 3])(
      "settles every method within [0.5, 1.5] x latency (seed %i)",
      async (seed) => {
        const api = createMockFileExplorerApi({ ...SMALL, seed, latency: 100 })
        const settled = new Set<string>()
        for (const [name, call] of callEveryMethod(api)) {
          const done = () => settled.add(name)
          void call.then(done, done)
        }

        await vi.advanceTimersByTimeAsync(49)
        expect(settled.size).toBe(0)

        await vi.advanceTimersByTimeAsync(101)
        expect(settled.size).toBe(7)
      }
    )

    it("runs each call against the DB when its delay ends, not when it starts", async () => {
      // Seed 4's jitter lands the create between the reads' completions.
      const api = createMockFileExplorerApi({
        ...SMALL,
        seed: 4,
        latency: 100,
      })
      let created = false
      const reads = Array.from({ length: 8 }, () =>
        api.listChildren(TOP_LEVEL).then((page) => ({
          sawFolder: page.items.some((item) => item.name === "Aardvark"),
          resolvedAfterCreate: created,
        }))
      )
      void api.createFolder({ parentId: null, name: "Aardvark" }).then(() => {
        created = true
      })

      await vi.advanceTimersByTimeAsync(150)
      const results = await Promise.all(reads)

      // All reads started before the create finished; some finish on each side.
      expect(results.some((read) => read.resolvedAfterCreate)).toBe(true)
      expect(results.some((read) => !read.resolvedAfterCreate)).toBe(true)
      for (const read of results) {
        expect(read.sawFolder).toBe(read.resolvedAfterCreate)
      }
    })
  })

  describe("abort", () => {
    it("rejects every read with an AbortError when the signal is already aborted", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 100 })
      const controller = new AbortController()
      controller.abort()

      await expectAbortError(api.listChildren(TOP_LEVEL, controller.signal))
      await expectAbortError(api.getNode("folder-brand", controller.signal))
      await expectAbortError(
        api.search({ query: LAUNCH, limit: 10 }, controller.signal)
      )
      await expectAbortError(api.getStats({}, controller.signal))
      expect(vi.getTimerCount()).toBe(0)
    })

    it("rejects mid-delay without waiting for the timer and clears it", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 100 })
      const controller = new AbortController()
      const read = api.listChildren(TOP_LEVEL, controller.signal)

      await vi.advanceTimersByTimeAsync(10)
      controller.abort()

      await expectAbortError(read)
      expect(vi.getTimerCount()).toBe(0)
    })

    it("resolves normally when the signal is never aborted", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 100 })
      const read = api.getStats({}, new AbortController().signal)

      await vi.advanceTimersByTimeAsync(150)

      await expect(read).resolves.toEqual({ fileCount: 10 })
    })

    it("does not spend the failFirst budget on aborted calls", async () => {
      const api = createMockFileExplorerApi({
        ...SMALL,
        latency: 100,
        failFirst: 1,
      })
      const controller = new AbortController()
      const aborted = api.listChildren(TOP_LEVEL, controller.signal)
      await vi.advanceTimersByTimeAsync(10)
      controller.abort()
      await expectAbortError(aborted)

      // Attach the expectation first: the rejection lands while timers run.
      const failed = expectNetworkError(api.listChildren(TOP_LEVEL))
      await vi.advanceTimersByTimeAsync(150)
      await failed

      const succeeded = api.listChildren(TOP_LEVEL)
      await vi.advanceTimersByTimeAsync(150)
      await expect(succeeded).resolves.toMatchObject({ total: 4 })
    })
  })

  describe("failures", () => {
    it("rejects every read with a network ApiError when failRate is 1", async () => {
      const api = createMockFileExplorerApi({
        ...SMALL,
        latency: 0,
        failRate: 1,
      })

      for (let i = 0; i < 5; i++) {
        await expectNetworkError(api.listChildren(TOP_LEVEL))
        await expectNetworkError(api.getNode("folder-brand"))
        await expectNetworkError(api.search({ query: LAUNCH, limit: 10 }))
        await expectNetworkError(api.getStats({}))
      }
    })

    it("never fails mutations at random, even when failRate is 1", async () => {
      const api = createMockFileExplorerApi({
        ...SMALL,
        latency: 0,
        failRate: 1,
      })

      await expect(
        api.createFolder({ parentId: null, name: "New" })
      ).resolves.toMatchObject({ name: "New", type: "folder" })
      await expect(api.createFile(newFile("new.pdf"))).resolves.toMatchObject({
        name: "new.pdf",
      })
      await expect(api.deleteNode("folder-research")).resolves.toEqual({
        deletedIds: [
          "folder-research",
          "folder-interviews",
          "file-interview-arden",
          "file-insights-report",
        ],
      })
    })

    it("never rejects reads when failRate is 0", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })

      const stats = await Promise.all(
        Array.from({ length: 50 }, () => api.getStats({}))
      )

      expect(stats).toEqual(Array(50).fill({ fileCount: 10 }))
    })

    it("fails exactly the first failFirst listChildren calls and no other read", async () => {
      const api = createMockFileExplorerApi({
        ...SMALL,
        latency: 0,
        failFirst: 2,
      })
      const node = { id: "folder-brand", name: "Brand system" }

      await expect(api.getNode("folder-brand")).resolves.toMatchObject(node)
      await expect(
        api.search({ query: LAUNCH, limit: 10 })
      ).resolves.toMatchObject({ total: 4 })
      await expect(api.getStats({})).resolves.toEqual({ fileCount: 10 })
      await expectNetworkError(api.listChildren(TOP_LEVEL))
      await expect(api.getNode("folder-brand")).resolves.toMatchObject(node)
      await expectNetworkError(api.listChildren(TOP_LEVEL))
      await expect(api.listChildren(TOP_LEVEL)).resolves.toMatchObject({
        total: 4,
      })
      await expect(api.listChildren(TOP_LEVEL)).resolves.toMatchObject({
        total: 4,
      })
    })

    it.each([
      [
        "an unknown node",
        (api: FileExplorerApi) => api.getNode("missing"),
        "not-found",
      ],
      [
        "an unknown folder",
        (api: FileExplorerApi) =>
          api.listChildren({ folderId: "missing", limit: 10 }),
        "not-found",
      ],
      [
        "a malformed cursor",
        (api: FileExplorerApi) =>
          api.search({ query: LAUNCH, cursor: "bad", limit: 10 }),
        "validation",
      ],
      [
        "a duplicate sibling name",
        (api: FileExplorerApi) =>
          api.createFolder({ parentId: null, name: "research" }),
        "conflict",
      ],
      [
        "deleting an unknown node",
        (api: FileExplorerApi) => api.deleteNode("missing"),
        "not-found",
      ],
    ])("rejects %s with the backend's ApiError", async (_, call, code) => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })

      await expect(call(api)).rejects.toMatchObject({
        name: "ApiError",
        code,
      })
    })
  })

  describe("routing", () => {
    it.each([
      ["omitted", undefined],
      ["inactive", { ...EMPTY_QUERY, name: "  " }],
    ])(
      "lists every child without matchCount when the query is %s",
      async (_, query) => {
        const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })

        const page = await api.listChildren({ ...TOP_LEVEL, query })

        expect(page.items.map((item) => item.name)).toEqual([
          "Brand system",
          "Launch campaign",
          "Research",
          "project-brief.pdf",
        ])
        expect(page.items[0]).not.toHaveProperty("matchCount")
        await expect(api.getStats({ query })).resolves.toEqual({
          fileCount: 10,
        })
      }
    )

    it("lists only matching children with matchCount for an active query", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })

      const page = await api.listChildren({ ...TOP_LEVEL, query: LAUNCH })

      expect(page).toEqual({
        items: [
          expect.objectContaining({ name: "Launch campaign", matchCount: 4 }),
        ],
        nextCursor: null,
        total: 1,
      })
      await expect(api.getStats({ query: LAUNCH })).resolves.toEqual({
        fileCount: 4,
      })
    })

    it("searches across the whole tree with ancestor ids", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })

      const page = await api.search({ query: LAUNCH, limit: 2 })

      expect(page.total).toBe(4)
      expect(page.items[0]).toMatchObject({
        name: "launch-film-final.mp4",
        ancestorIds: ["folder-launch-campaign", "folder-film"],
      })
      const next = await api.search({
        query: LAUNCH,
        cursor: page.nextCursor ?? undefined,
        limit: 2,
      })
      expect(next.items).toHaveLength(2)
      expect(next.nextCursor).toBeNull()
    })
  })

  describe("copies", () => {
    it("returns listing items that callers may mutate", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })
      for (const query of [undefined, LAUNCH]) {
        const first = await api.listChildren({ ...TOP_LEVEL, query })
        const expected = structuredClone(first)
        for (const item of first.items) {
          item.name = "changed"
          if (item.type === "folder") item.matchCount = -1
        }

        await expect(
          api.listChildren({ ...TOP_LEVEL, query })
        ).resolves.toEqual(expected)
      }
    })

    it("returns node details whose ancestors callers may mutate", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })
      const first = await api.getNode("file-wordmark-v2")
      const expected = structuredClone(first)
      first.name = "changed"
      first.ancestors[0].name = "changed"
      first.ancestors.push({ id: "x", name: "x" })

      await expect(api.getNode("file-wordmark-v2")).resolves.toEqual(expected)
    })

    it("returns search hits whose ancestorIds callers may mutate", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })
      const first = await api.search({ query: LAUNCH, limit: 10 })
      const expected = structuredClone(first)
      for (const hit of first.items) {
        hit.name = "changed"
        hit.ancestorIds.push("x")
      }

      await expect(api.search({ query: LAUNCH, limit: 10 })).resolves.toEqual(
        expected
      )
    })

    it("returns created nodes that callers may mutate", async () => {
      const api = createMockFileExplorerApi({ ...SMALL, latency: 0 })
      const created = await api.createFolder({ parentId: null, name: "New" })
      created.name = "changed"

      await expect(api.getNode(created.id)).resolves.toMatchObject({
        name: "New",
      })
    })
  })
})

describe("parseMockConfig", () => {
  it("uses the defaults when no param is set", () => {
    expect(parseMockConfig(new URLSearchParams())).toEqual(DEFAULT_MOCK_CONFIG)
    expect(DEFAULT_MOCK_CONFIG).toEqual({
      seed: 1,
      nodes: 10_000,
      latency: 250,
      failRate: 0,
      failFirst: 0,
    })
  })

  it("reads every field from one query string", () => {
    expect(
      parseMockConfig(
        new URLSearchParams(
          "seed=7&nodes=500&latency=0&failRate=0.5&failFirst=3"
        )
      )
    ).toEqual({ seed: 7, nodes: 500, latency: 0, failRate: 0.5, failFirst: 3 })
  })

  it.each<[keyof MockConfig, string, number]>([
    ["seed", "42", 42],
    ["seed", "-7", -7],
    ["seed", "3.9", 3],
    ["seed", "-3.9", -3],
    ["seed", "", 1],
    ["seed", "abc", 1],
    ["seed", "Infinity", 1],
    ["nodes", "17", CURATED_RECORDS.length],
    ["nodes", "-1", CURATED_RECORDS.length],
    ["nodes", "18", 18],
    ["nodes", "500.7", 500],
    ["nodes", "200000", 200_000],
    ["nodes", "200001", 200_000],
    ["nodes", "", 10_000],
    ["nodes", "many", 10_000],
    ["latency", "-10", 0],
    ["latency", "0", 0],
    ["latency", "12.5", 12.5],
    ["latency", "10000", 10_000],
    ["latency", "10001", 10_000],
    ["latency", " ", 250],
    ["latency", "fast", 250],
    ["failRate", "-0.1", 0],
    ["failRate", " 0.25 ", 0.25],
    ["failRate", "1", 1],
    ["failRate", "1.5", 1],
    ["failRate", "NaN", 0],
    ["failFirst", "-1", 0],
    ["failFirst", "2.9", 2],
    ["failFirst", "1000", 1_000],
    ["failFirst", "1001", 1_000],
    ["failFirst", "one", 0],
  ])("parses %s=%j as %d", (field, raw, expected) => {
    const config = parseMockConfig(new URLSearchParams({ [field]: raw }))

    expect(config).toEqual({ ...DEFAULT_MOCK_CONFIG, [field]: expected })
  })
})
