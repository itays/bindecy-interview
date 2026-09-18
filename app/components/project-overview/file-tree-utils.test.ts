import { describe, expect, it } from "vitest"

import type { FileFilters, ProjectNode } from "~/types/project-node"

import {
  filterProjectTree,
  findFileLocation,
  formatFileSize,
  validateFileFilters,
} from "./file-tree-utils"

const MB = 1_048_576

const nodes: ProjectNode[] = [
  {
    id: "campaign",
    name: "Campaign",
    type: "folder",
    children: [
      {
        id: "audio",
        name: "theme.mp3",
        type: "file",
        category: "audio",
        sizeInBytes: 2 * MB,
        previewUrl: "https://example.com/theme.mp3",
      },
      {
        id: "images",
        name: "Images",
        type: "folder",
        children: [
          {
            id: "hero",
            name: "Hero.JPG",
            type: "file",
            category: "image",
            sizeInBytes: 5 * MB,
            previewUrl: "https://example.com/hero.jpg",
          },
          {
            id: "deep",
            name: "Deep",
            type: "folder",
            children: [
              {
                id: "thumbnail",
                name: "thumbnail.png",
                type: "file",
                category: "image",
                sizeInBytes: MB,
                previewUrl: "https://example.com/thumbnail.png",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "notes",
    name: "notes.pdf",
    type: "file",
    category: "doc",
    sizeInBytes: 0,
    previewUrl: "https://example.com/notes.pdf",
  },
  {
    id: "empty",
    name: "Empty folder",
    type: "folder",
    children: [],
  },
]

const emptyFilters: FileFilters = {
  query: "",
  minSizeMb: "",
  maxSizeMb: "",
  categories: [],
}

function makeFilters(overrides: Partial<FileFilters>): FileFilters {
  return { ...emptyFilters, ...overrides }
}

function visibleIds(result: ReturnType<typeof filterProjectTree>) {
  return [...result.visibleFileIds]
}

describe("filterProjectTree", () => {
  it("handles an empty project", () => {
    const result = filterProjectTree([], emptyFilters)

    expect(result.nodes).toEqual([])
    expect(result.fileCount).toBe(0)
    expect(result.visibleFileIds).toEqual(new Set())
  })

  it("returns all files and empty folders when no filters are active", () => {
    const result = filterProjectTree(nodes, emptyFilters)

    expect(result.nodes).toEqual(nodes)
    expect(result.nodes).not.toBe(nodes)
    expect(result.fileCount).toBe(4)
    expect(result.hasActiveFilters).toBe(false)
    expect(result.nodes.at(-1)).toMatchObject({ id: "empty", children: [] })
  })

  it("combines trimmed case-insensitive names, inclusive sizes, and categories", () => {
    const result = filterProjectTree(
      nodes,
      makeFilters({
        query: "  HERO  ",
        minSizeMb: "5",
        maxSizeMb: "5.0",
        categories: ["image"],
      })
    )

    expect(visibleIds(result)).toEqual(["hero"])
    expect(result.nodes).toEqual([
      expect.objectContaining({
        id: "campaign",
        children: [
          expect.objectContaining({
            id: "images",
            children: [expect.objectContaining({ id: "hero" })],
          }),
        ],
      }),
    ])
  })

  it("uses inclusive minimum and maximum bounds, including open bounds and zero-byte files", () => {
    expect(
      visibleIds(
        filterProjectTree(
          nodes,
          makeFilters({ minSizeMb: "1", maxSizeMb: "2" })
        )
      )
    ).toEqual(["audio", "thumbnail"])

    expect(
      visibleIds(filterProjectTree(nodes, makeFilters({ minSizeMb: "2" })))
    ).toEqual(["audio", "hero"])

    expect(
      visibleIds(filterProjectTree(nodes, makeFilters({ maxSizeMb: "0" })))
    ).toEqual(["notes"])
  })

  it("keeps a matching folder's complete subtree for a name-only search", () => {
    const result = filterProjectTree(nodes, makeFilters({ query: "images" }))

    expect(visibleIds(result)).toEqual(["hero", "thumbnail"])
    expect(result.ancestorFolderIds).toEqual(
      new Set(["deep", "images", "campaign"])
    )
  })

  it("keeps document and video files visible by default", () => {
    const defaultCategoryNodes: ProjectNode[] = [
      {
        id: "video",
        name: "launch.mp4",
        type: "file",
        category: "video",
        sizeInBytes: MB,
        previewUrl: "https://example.com/launch.mp4",
      },
      nodes[1],
    ]

    expect(
      visibleIds(filterProjectTree(defaultCategoryNodes, emptyFilters))
    ).toEqual(["video", "notes"])
  })

  it("supports individual and combined category filters", () => {
    expect(
      visibleIds(
        filterProjectTree(nodes, makeFilters({ categories: ["audio"] }))
      )
    ).toEqual(["audio"])
    expect(
      visibleIds(
        filterProjectTree(nodes, makeFilters({ categories: ["image"] }))
      )
    ).toEqual(["hero", "thumbnail"])
    expect(
      visibleIds(
        filterProjectTree(
          nodes,
          makeFilters({ categories: ["audio", "image"] })
        )
      )
    ).toEqual(["audio", "hero", "thumbnail"])

    const videoNode: ProjectNode = {
      id: "video",
      name: "launch.mp4",
      type: "file",
      category: "video",
      sizeInBytes: 10 * MB,
      previewUrl: "https://example.com/launch.mp4",
    }

    expect(
      visibleIds(
        filterProjectTree(
          [...nodes, videoNode],
          makeFilters({ categories: ["video"] })
        )
      )
    ).toEqual(["video"])
  })

  it("still applies file constraints beneath a matching folder", () => {
    const result = filterProjectTree(
      nodes,
      makeFilters({ query: "campaign", categories: ["audio"] })
    )

    expect(visibleIds(result)).toEqual(["audio"])
  })

  it("preserves every ancestor of a deeply nested match", () => {
    const result = filterProjectTree(nodes, makeFilters({ query: "thumbnail" }))

    expect(result.nodes).toEqual([
      expect.objectContaining({
        id: "campaign",
        children: [
          expect.objectContaining({
            id: "images",
            children: [
              expect.objectContaining({
                id: "deep",
                children: [expect.objectContaining({ id: "thumbnail" })],
              }),
            ],
          }),
        ],
      }),
    ])
    expect(result.ancestorFolderIds).toEqual(
      new Set(["deep", "images", "campaign"])
    )
  })

  it("retains an empty folder only when its own name matches", () => {
    const matching = filterProjectTree(nodes, makeFilters({ query: "empty" }))
    const missing = filterProjectTree(nodes, makeFilters({ query: "unknown" }))

    expect(matching.nodes).toEqual([
      expect.objectContaining({ id: "empty", children: [] }),
    ])
    expect(matching.fileCount).toBe(0)
    expect(missing.nodes).toEqual([])
  })

  it.each([
    ["negative minimum", { minSizeMb: "-1" }, "minSizeError"],
    ["non-numeric maximum", { maxSizeMb: "large" }, "maxSizeError"],
    [
      "minimum above maximum",
      { minSizeMb: "4", maxSizeMb: "2" },
      "maxSizeError",
    ],
  ] as const)(
    "reports an invalid range for %s without showing misleading results",
    (_label, overrides, errorKey) => {
      const result = filterProjectTree(nodes, makeFilters(overrides))

      expect(result.validation.isValid).toBe(false)
      expect(result.validation[errorKey]).toBeTruthy()
      expect(result.fileCount).toBe(4)
      expect(result.nodes).toEqual(nodes)
    }
  )
})

describe("public file tree helpers", () => {
  it("validates open-ended decimal bounds", () => {
    expect(validateFileFilters(makeFilters({ minSizeMb: ".5" }))).toMatchObject(
      {
        isValid: true,
        minSizeInBytes: MB / 2,
        maxSizeInBytes: null,
      }
    )
  })

  it("finds a deeply nested file and its full path", () => {
    expect(findFileLocation(nodes, "thumbnail")).toEqual({
      file: expect.objectContaining({ id: "thumbnail" }),
      path: ["Campaign", "Images", "Deep", "thumbnail.png"],
    })
    expect(findFileLocation(nodes, "missing")).toBeNull()
  })

  it("formats bytes, kilobytes, and megabytes consistently", () => {
    expect(formatFileSize(512)).toBe("512 B")
    expect(formatFileSize(1536)).toBe("1.5 KB")
    expect(formatFileSize(2.5 * MB)).toBe("2.5 MB")
  })
})
