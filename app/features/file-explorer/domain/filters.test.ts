import { describe, expect, it } from "vitest"

import {
  EMPTY_QUERY,
  isQueryActive,
  matchesFile,
  queryKey,
  toFileQuery,
  validateFileFilters,
} from "./filters"
import type { FileFilters } from "./filters"
import type { FileQuery, FileSummary } from "./types"

const MB = 1_048_576

type TestFile = Pick<FileSummary, "name" | "category" | "sizeInBytes">

const emptyFilters: FileFilters = {
  query: "",
  minSizeMb: "",
  maxSizeMb: "",
  categories: [],
}

function makeFilters(overrides: Partial<FileFilters>): FileFilters {
  return { ...emptyFilters, ...overrides }
}

function makeQuery(overrides: Partial<FileQuery>): FileQuery {
  return { ...EMPTY_QUERY, ...overrides }
}

function makeFile(overrides: Partial<TestFile>): TestFile {
  return { name: "file.bin", category: "image", sizeInBytes: MB, ...overrides }
}

describe("validateFileFilters", () => {
  it("accepts blank bounds as open-ended", () => {
    expect(validateFileFilters(makeFilters({ minSizeMb: "  " }))).toEqual({
      isValid: true,
      minSizeInBytes: null,
      maxSizeInBytes: null,
      minSizeError: null,
      maxSizeError: null,
      hasInvalidRange: false,
    })
  })

  it.each([
    ["0", 0],
    [".5", MB / 2],
    ["1.", MB],
    [" 2.25 ", 2.25 * MB],
  ])("converts %j megabytes to bytes", (value, bytes) => {
    expect(
      validateFileFilters(makeFilters({ minSizeMb: value }))
    ).toMatchObject({ isValid: true, minSizeInBytes: bytes })
  })

  it.each([
    ["-1", "Size must be zero or greater."],
    ["-0.5", "Size must be zero or greater."],
    ["large", "Enter a valid size in megabytes."],
    ["1e3", "Enter a valid size in megabytes."],
    ["0x10", "Enter a valid size in megabytes."],
    ["Infinity", "Enter a valid size in megabytes."],
    ["9".repeat(400), "Enter a valid size in megabytes."],
    ["1" + "0".repeat(303), "Enter a smaller size."],
  ])("rejects %j with its message", (value, message) => {
    expect(
      validateFileFilters(makeFilters({ minSizeMb: value }))
    ).toMatchObject({
      isValid: false,
      minSizeInBytes: null,
      minSizeError: message,
    })
    expect(
      validateFileFilters(makeFilters({ maxSizeMb: value }))
    ).toMatchObject({
      isValid: false,
      maxSizeInBytes: null,
      maxSizeError: message,
    })
  })

  it("reports min above max on the maximum field", () => {
    expect(
      validateFileFilters(makeFilters({ minSizeMb: "4", maxSizeMb: "2" }))
    ).toEqual({
      isValid: false,
      minSizeInBytes: 4 * MB,
      maxSizeInBytes: 2 * MB,
      minSizeError: null,
      maxSizeError:
        "Maximum size must be greater than or equal to minimum size.",
      hasInvalidRange: true,
    })
  })

  it("accepts equal minimum and maximum", () => {
    expect(
      validateFileFilters(makeFilters({ minSizeMb: "2", maxSizeMb: "2" }))
    ).toMatchObject({ isValid: true, hasInvalidRange: false })
  })

  it("does not report a range error when a bound is itself invalid", () => {
    expect(
      validateFileFilters(makeFilters({ minSizeMb: "-4", maxSizeMb: "2" }))
    ).toMatchObject({
      isValid: false,
      hasInvalidRange: false,
      minSizeError: "Size must be zero or greater.",
      maxSizeError: null,
    })
  })
})

describe("toFileQuery", () => {
  it("builds a query with a trimmed name, byte bounds and unique categories", () => {
    expect(
      toFileQuery({
        query: "  Hero Shot ",
        minSizeMb: "1",
        maxSizeMb: "2.5",
        categories: ["video", "audio", "video"],
      })
    ).toEqual({
      name: "Hero Shot",
      minBytes: MB,
      maxBytes: 2.5 * MB,
      categories: ["video", "audio"],
    })
  })

  it("maps empty filters to an inactive query", () => {
    const query = toFileQuery(emptyFilters)

    expect(query).toEqual(EMPTY_QUERY)
    expect(isQueryActive(query!)).toBe(false)
  })

  it.each([
    ["a negative minimum", { minSizeMb: "-1" }],
    ["a non-numeric maximum", { maxSizeMb: "large" }],
    ["min above max", { minSizeMb: "4", maxSizeMb: "2" }],
  ])("returns null for %s", (_label, overrides) => {
    expect(toFileQuery(makeFilters({ query: "a", ...overrides }))).toBeNull()
  })

  it("does not mutate its input", () => {
    const filters = makeFilters({
      query: " a ",
      categories: ["image", "image"],
    })
    const snapshot = structuredClone(filters)
    const query = toFileQuery(filters)

    expect(filters).toEqual(snapshot)
    expect(query!.categories).not.toBe(filters.categories)
  })
})

describe("isQueryActive", () => {
  it.each([
    ["a name", { name: "a" }],
    ["a zero minimum", { minBytes: 0 }],
    ["a maximum", { maxBytes: MB }],
    ["a category", { categories: ["audio" as const] }],
  ])("is active with %s", (_label, overrides) => {
    expect(isQueryActive(makeQuery(overrides))).toBe(true)
  })
})

describe("queryKey", () => {
  it("is stable across name case, surrounding whitespace, and category order or duplicates", () => {
    const key = queryKey(
      makeQuery({
        name: "Hero",
        minBytes: MB,
        categories: ["audio", "image"],
      })
    )

    expect(
      queryKey(
        makeQuery({
          name: "  hERO ",
          minBytes: MB,
          categories: ["image", "audio", "image"],
        })
      )
    ).toBe(key)
  })

  it.each([
    ["name", { name: "her" }],
    ["open vs zero minimum", { minBytes: 0 }],
    ["open vs zero maximum", { maxBytes: 0 }],
    ["categories", { categories: ["audio" as const] }],
  ])("distinguishes queries that differ by %s", (_label, overrides) => {
    expect(queryKey(makeQuery(overrides))).not.toBe(queryKey(EMPTY_QUERY))
  })

  it("does not confuse a minimum with a maximum", () => {
    expect(queryKey(makeQuery({ minBytes: MB }))).not.toBe(
      queryKey(makeQuery({ maxBytes: MB }))
    )
  })
})

describe("matchesFile", () => {
  it("matches every file, documents included, for the empty query", () => {
    expect(
      matchesFile(
        makeFile({ category: "doc", sizeInBytes: 0 }),
        [],
        EMPTY_QUERY
      )
    ).toBe(true)
  })

  it("matches file names as a trimmed, case-insensitive substring", () => {
    const query = toFileQuery(makeFilters({ query: "  HERO " }))!

    expect(matchesFile(makeFile({ name: "the-hero.png" }), [], query)).toBe(
      true
    )
    expect(matchesFile(makeFile({ name: "villain.png" }), [], query)).toBe(
      false
    )
  })

  it.each([
    ["below the minimum", MB - 1, false],
    ["at the minimum", MB, true],
    ["at the maximum", 2 * MB, true],
    ["above the maximum", 2 * MB + 1, false],
  ])(
    "applies inclusive bounds to a file %s",
    (_label, sizeInBytes, visible) => {
      const query = makeQuery({ minBytes: MB, maxBytes: 2 * MB })

      expect(matchesFile(makeFile({ sizeInBytes }), [], query)).toBe(visible)
    }
  )

  it("treats null bounds as open-ended", () => {
    expect(
      matchesFile(makeFile({ sizeInBytes: 0 }), [], makeQuery({ maxBytes: 0 }))
    ).toBe(true)
    expect(
      matchesFile(
        makeFile({ sizeInBytes: Number.MAX_SAFE_INTEGER }),
        [],
        makeQuery({ minBytes: MB })
      )
    ).toBe(true)
  })

  it("combines categories with OR", () => {
    const query = makeQuery({ categories: ["audio", "video"] })

    expect(matchesFile(makeFile({ category: "audio" }), [], query)).toBe(true)
    expect(matchesFile(makeFile({ category: "video" }), [], query)).toBe(true)
    expect(matchesFile(makeFile({ category: "image" }), [], query)).toBe(false)
  })

  it("hides documents once any category is selected", () => {
    const doc = makeFile({ category: "doc" })

    expect(matchesFile(doc, [], EMPTY_QUERY)).toBe(true)
    expect(
      matchesFile(
        doc,
        [],
        makeQuery({ categories: ["audio", "video", "image"] })
      )
    ).toBe(false)
  })

  it("combines name, size and category with AND", () => {
    const query = makeQuery({
      name: "hero",
      minBytes: MB,
      categories: ["image"],
    })

    expect(matchesFile(makeFile({ name: "hero.png" }), [], query)).toBe(true)
    expect(
      matchesFile(makeFile({ name: "hero.png", sizeInBytes: 0 }), [], query)
    ).toBe(false)
    expect(
      matchesFile(makeFile({ name: "hero.mp3", category: "audio" }), [], query)
    ).toBe(false)
  })

  it("keeps every file below a folder whose name matches when no other constraint is set", () => {
    const query = makeQuery({ name: "images" })

    expect(
      matchesFile(
        makeFile({ name: "notes.txt", category: "doc" }),
        ["Campaign", "Images", "Deep"],
        query
      )
    ).toBe(true)
    expect(
      matchesFile(makeFile({ name: "notes.txt" }), ["Campaign", "Deep"], query)
    ).toBe(false)
  })

  it("still applies size and category constraints below a matching folder", () => {
    const query = makeQuery({
      name: "campaign",
      maxBytes: 2 * MB,
      categories: ["audio"],
    })
    const ancestors = ["Campaign", "Sounds"]

    expect(
      matchesFile(
        makeFile({ name: "theme.mp3", category: "audio" }),
        ancestors,
        query
      )
    ).toBe(true)
    expect(
      matchesFile(
        makeFile({ name: "hero.png", category: "image" }),
        ancestors,
        query
      )
    ).toBe(false)
    expect(
      matchesFile(
        makeFile({ name: "theme.mp3", category: "audio", sizeInBytes: 3 * MB }),
        ancestors,
        query
      )
    ).toBe(false)
  })
})
