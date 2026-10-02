import { describe, expect, it } from "vitest"

import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import { EMPTY_QUERY, queryKey } from "~/features/file-explorer/domain/filters"
import { ROOT_ID } from "~/features/file-explorer/domain/types"
import type {
  FileSummary,
  FolderSummary,
  NodeSummary,
} from "~/features/file-explorer/domain/types"
import { BROWSE_QUERY_KEY, createExplorerStore } from "./explorer-store"
import type { ExplorerStoreApi } from "./explorer-store"
import { createMutations } from "./mutations"
import type { ExplorerMutations } from "./mutations"

function folder(
  id: string,
  parentId: string | null,
  overrides: Partial<FolderSummary> = {}
): FolderSummary {
  return {
    id,
    name: id,
    parentId,
    type: "folder",
    childCount: 0,
    fileCount: 0,
    ...overrides,
  }
}

function file(
  id: string,
  parentId: string | null,
  overrides: Partial<FileSummary> = {}
): FileSummary {
  return {
    id,
    name: id,
    parentId,
    type: "file",
    category: "image",
    sizeInBytes: 1_000,
    ...overrides,
  }
}

/** Loads the first browse page of `folderId`'s children. */
function load(
  store: ExplorerStoreApi,
  folderId: string | null,
  items: NodeSummary[],
  {
    nextCursor = null,
    total = items.length,
  }: { nextCursor?: string | null; total?: number } = {}
) {
  store
    .getState()
    .receivePage(
      BROWSE_QUERY_KEY,
      folderId,
      { items, nextCursor, total },
      { append: false }
    )
}

function browseListing(store: ExplorerStoreApi, key: string) {
  return store.getState().listings[BROWSE_QUERY_KEY]?.[key]
}

function fakeApi(
  crud: Partial<
    Pick<FileExplorerApi, "createFolder" | "createFile" | "deleteNode">
  >
): FileExplorerApi {
  const unused = () => Promise.reject(new Error("Not a CRUD method"))

  return {
    listChildren: unused,
    getNode: unused,
    search: unused,
    getStats: unused,
    createFolder: unused,
    createFile: unused,
    deleteNode: unused,
    ...crud,
  }
}

/** Creates `node` through a server that returns it. */
function create(store: ExplorerStoreApi, node: NodeSummary) {
  const mutations = createMutations(
    fakeApi({
      createFolder: async () => node,
      createFile: async () => node,
    }),
    store
  )

  return node.type === "folder"
    ? mutations.createFolder({ parentId: node.parentId, name: node.name })
    : mutations.createFile({
        parentId: node.parentId,
        name: node.name,
        category: node.category,
        sizeInBytes: node.sizeInBytes,
        previewUrl: "https://example.com/new.png",
      })
}

/** Deletes `id` through a server that reports `deletedIds`. */
function remove(store: ExplorerStoreApi, id: string, deletedIds = [id]) {
  return createMutations(
    fakeApi({ deleteNode: async () => ({ deletedIds }) }),
    store
  ).deleteNode(id)
}

const pngQuery = { ...EMPTY_QUERY, name: "png" }

describe("create", () => {
  /** `docs` shows two folders and two files out of 20 children. */
  function loadDocs(store: ExplorerStoreApi) {
    load(store, null, [folder("docs", null, { childCount: 20 })])
    load(
      store,
      "docs",
      [
        folder("folder-alpha", "docs", { name: "Alpha" }),
        folder("folder-gamma", "docs", { name: "Gamma" }),
        file("file-1", "docs", { name: "beta.png" }),
        file("file-2", "docs", { name: "Delta.png" }),
      ],
      { nextCursor: "cursor", total: 20 }
    )
  }

  it.each([
    [
      "a folder among folders by case-insensitive name",
      folder("folder-new", "docs", { name: "beta" }),
      ["folder-alpha", "folder-new", "folder-gamma", "file-1", "file-2"],
    ],
    [
      "a folder before every file",
      folder("folder-new", "docs", { name: "zeta" }),
      ["folder-alpha", "folder-gamma", "folder-new", "file-1", "file-2"],
    ],
    [
      "a file after every folder",
      file("file-new", "docs", { name: "Aardvark.png" }),
      ["folder-alpha", "folder-gamma", "file-new", "file-1", "file-2"],
    ],
    [
      "a file among files by case-insensitive name",
      file("file-new", "docs", { name: "CHARLIE.png" }),
      ["folder-alpha", "folder-gamma", "file-1", "file-new", "file-2"],
    ],
    [
      "an equal name before a greater id",
      file("file-0", "docs", { name: "Beta.png" }),
      ["folder-alpha", "folder-gamma", "file-0", "file-1", "file-2"],
    ],
    [
      "an equal name after a smaller id",
      file("file-15", "docs", { name: "BETA.PNG" }),
      ["folder-alpha", "folder-gamma", "file-1", "file-15", "file-2"],
    ],
  ])("inserts %s inside the loaded prefix", async (_, node, ids) => {
    const store = createExplorerStore()
    loadDocs(store)

    await create(store, node)

    expect(browseListing(store, "docs")).toMatchObject({
      ids,
      nextCursor: "cursor",
      total: 21,
    })
  })

  it("only counts a node that sorts beyond a partly loaded listing", async () => {
    const store = createExplorerStore()
    loadDocs(store)
    const before = browseListing(store, "docs")

    await create(store, file("file-new", "docs", { name: "zulu.png" }))

    expect(browseListing(store, "docs")).toMatchObject({
      ids: before?.ids,
      total: 21,
    })
  })

  it("appends a node that sorts last once every page is loaded", async () => {
    const store = createExplorerStore()
    load(store, "docs", [file("file-1", "docs", { name: "beta.png" })])

    await create(store, file("file-new", "docs", { name: "zulu.png" }))

    expect(browseListing(store, "docs")).toMatchObject({
      ids: ["file-1", "file-new"],
      total: 2,
    })
  })

  it("leaves a listing whose first page is in flight to that page", async () => {
    const store = createExplorerStore()
    store.getState().setListingStatus(BROWSE_QUERY_KEY, "docs", "loading")
    const loading = browseListing(store, "docs")

    await create(store, file("file-new", "docs"))

    expect(browseListing(store, "docs")).toBe(loading)
  })

  it("doesn't list a node twice when a later page already delivered it", async () => {
    const store = createExplorerStore()
    const created = file("file-new", "docs", { name: "zulu.png" })
    load(store, "docs", [file("file-1", "docs"), created])

    await create(store, created)

    expect(browseListing(store, "docs")).toMatchObject({
      ids: ["file-1", "file-new"],
      total: 2,
    })
  })

  it("records the node and bumps counts when the parent listing isn't loaded", async () => {
    const store = createExplorerStore()
    load(store, null, [folder("docs", null, { childCount: 2, fileCount: 2 })])
    const created = file("file-new", "docs")

    await create(store, created)

    const { nodesById, listings } = store.getState()
    expect(nodesById.get("file-new")).toBe(created)
    expect(nodesById.get("docs")).toMatchObject({
      childCount: 3,
      fileCount: 3,
    })
    expect(listings[BROWSE_QUERY_KEY]).not.toHaveProperty("docs")
  })

  describe("counts", () => {
    /** `projects` › `design` › `drafts`, where `drafts` isn't expanded. */
    function loadProjects(store: ExplorerStoreApi) {
      load(store, null, [
        folder("projects", null, { childCount: 1, fileCount: 4 }),
      ])
      load(store, "projects", [
        folder("design", "projects", { childCount: 2, fileCount: 4 }),
      ])
      load(store, "design", [
        folder("drafts", "design", { childCount: 2, fileCount: 3 }),
        file("logo.png", "design"),
      ])
    }

    it("adds a new file to the parent's children and every ancestor's files", async () => {
      const store = createExplorerStore()
      loadProjects(store)

      await create(store, file("file-new", "drafts"))

      const { nodesById } = store.getState()
      expect(nodesById.get("drafts")).toMatchObject({
        childCount: 3,
        fileCount: 4,
      })
      expect(nodesById.get("design")).toMatchObject({
        childCount: 2,
        fileCount: 5,
      })
      expect(nodesById.get("projects")).toMatchObject({
        childCount: 1,
        fileCount: 5,
      })
    })

    it("adds a new folder to the parent's children only", async () => {
      const store = createExplorerStore()
      loadProjects(store)
      const before = store.getState().nodesById

      await create(store, folder("folder-new", "drafts"))

      const { nodesById } = store.getState()
      expect(nodesById.get("drafts")).toMatchObject({
        childCount: 3,
        fileCount: 3,
      })
      expect(nodesById.get("design")).toBe(before.get("design"))
      expect(nodesById.get("projects")).toBe(before.get("projects"))
    })
  })

  it("expands the parent and makes a new file active and selected", async () => {
    const store = createExplorerStore()
    load(store, null, [folder("docs", null)])

    await create(store, file("file-new", "docs"))

    const { expanded, activeId, selectedId } = store.getState()
    expect(expanded.has("docs")).toBe(true)
    expect(activeId).toBe("file-new")
    expect(selectedId).toBe("file-new")
  })

  it("makes a new folder active but keeps the selection", async () => {
    const store = createExplorerStore()
    load(store, null, [folder("docs", null), file("file-1", null)])
    store.getState().select("file-1")

    await create(store, folder("folder-new", "docs"))

    expect(store.getState()).toMatchObject({
      activeId: "folder-new",
      selectedId: "file-1",
    })
  })

  it("expands the parent while filtering", async () => {
    const store = createExplorerStore()
    load(store, null, [folder("docs", null)])
    store.getState().applyFilters(pngQuery)

    await create(store, file("file-new", "docs"))

    const { expanded, appliedQuery } = store.getState()
    expect(expanded).toEqual(new Set(["docs"]))
    expect(appliedQuery).toBe(pngQuery)
  })
})

describe("deleteNode", () => {
  /** Ids the server deletes with `archive`, loaded or not. */
  const archiveSubtree = ["archive", "old", "scan.png", "deep-1", "deep-2"]

  /** `projects` › `docs` › `archive` › `old`, every level expanded-ready. */
  function loadArchive(store: ExplorerStoreApi) {
    load(store, null, [
      folder("projects", null, { childCount: 1, fileCount: 6 }),
    ])
    load(store, "projects", [
      folder("docs", "projects", { childCount: 2, fileCount: 6 }),
    ])
    load(store, "docs", [
      folder("archive", "docs", { childCount: 2, fileCount: 5 }),
      file("notes.txt", "docs"),
    ])
    load(store, "archive", [
      folder("old", "archive", { childCount: 4, fileCount: 4 }),
      file("scan.png", "archive"),
    ])
    load(store, "old", [file("deep-1", "old")], {
      nextCursor: "cursor",
      total: 4,
    })
  }

  it("removes the subtree's nodes and listings and unlists it from its parent", async () => {
    const store = createExplorerStore()
    loadArchive(store)
    const before = store.getState().listings[BROWSE_QUERY_KEY]

    await remove(store, "archive", archiveSubtree)

    const { nodesById, listings } = store.getState()
    const browse = listings[BROWSE_QUERY_KEY]
    expect(archiveSubtree.filter((id) => nodesById.has(id))).toEqual([])
    expect(browse.docs).toMatchObject({ ids: ["notes.txt"], total: 1 })
    expect(browse).not.toHaveProperty("archive")
    expect(browse).not.toHaveProperty("old")
    expect(browse[ROOT_ID]).toBe(before[ROOT_ID])
    expect(browse.projects).toBe(before.projects)
  })

  it.each([
    ["folder", "archive", archiveSubtree, 1],
    ["file", "notes.txt", ["notes.txt"], 5],
  ])(
    "subtracts a deleted %s from the parent's children and every ancestor's files",
    async (_, id, deletedIds, remainingFiles) => {
      const store = createExplorerStore()
      loadArchive(store)

      await remove(store, id, deletedIds)

      const { nodesById } = store.getState()
      expect(nodesById.get("docs")).toMatchObject({
        childCount: 1,
        fileCount: remainingFiles,
      })
      expect(nodesById.get("projects")).toMatchObject({
        childCount: 1,
        fileCount: remainingFiles,
      })
    }
  )

  it("only uncounts a node beyond the loaded prefix while pages are pending", async () => {
    const store = createExplorerStore()
    load(store, "docs", [file("a", "docs")], { nextCursor: "cursor", total: 3 })
    store
      .getState()
      .receivePage(
        queryKey(pngQuery),
        "docs",
        { items: [file("z.png", "docs")], nextCursor: null, total: 1 },
        { append: false }
      )

    await remove(store, "z.png")

    expect(browseListing(store, "docs")).toMatchObject({
      ids: ["a"],
      total: 2,
    })
  })

  it("leaves a listing whose first page is in flight to that page", async () => {
    const store = createExplorerStore()
    load(store, null, [folder("docs", null, { childCount: 1, fileCount: 1 })])
    store
      .getState()
      .receivePage(
        queryKey(pngQuery),
        "docs",
        { items: [file("a.png", "docs")], nextCursor: null, total: 1 },
        { append: false }
      )
    store.getState().setListingStatus(BROWSE_QUERY_KEY, "docs", "loading")
    const loading = browseListing(store, "docs")

    await remove(store, "a.png")

    expect(browseListing(store, "docs")).toBe(loading)
  })

  it("clears selection, active row and expanded entries inside the subtree", async () => {
    const store = createExplorerStore()
    loadArchive(store)
    const { toggleExpanded, select, setActive } = store.getState()
    for (const id of ["projects", "docs", "archive", "old"]) {
      toggleExpanded(id)
    }
    select("scan.png")
    setActive("old")

    await remove(store, "archive", archiveSubtree)

    const state = store.getState()
    expect(state.expanded).toEqual(new Set(["projects", "docs"]))
    expect(state.selectedId).toBeNull()
    expect(state.activeId).toBeNull()
  })

  it("keeps selection, active row and expanded entries outside the subtree", async () => {
    const store = createExplorerStore()
    loadArchive(store)
    const { toggleExpanded, select, setActive } = store.getState()
    toggleExpanded("docs")
    select("notes.txt")
    setActive("docs")
    const { expanded } = store.getState()

    await remove(store, "archive", archiveSubtree)

    const state = store.getState()
    expect(state.expanded).toBe(expanded)
    expect(state.selectedId).toBe("notes.txt")
    expect(state.activeId).toBe("docs")
  })
})

describe("create and delete", () => {
  it.each<[string, (store: ExplorerStoreApi) => Promise<unknown>]>([
    ["creating", (store) => create(store, file("b.png", "docs"))],
    ["deleting", (store) => remove(store, "a.png")],
  ])(
    "drop the filtered listings but keep browse listings and expansion when %s",
    async (_, mutate) => {
      const store = createExplorerStore()
      load(store, null, [folder("docs", null, { childCount: 1, fileCount: 1 })])
      load(store, "docs", [file("a.png", "docs")])
      const key = queryKey(pngQuery)
      const { applyFilters, receivePage, toggleExpanded } = store.getState()
      toggleExpanded("docs")
      applyFilters(pngQuery)
      receivePage(
        key,
        null,
        {
          items: [folder("docs", null, { matchCount: 1 })],
          nextCursor: null,
          total: 1,
        },
        { append: false }
      )

      await mutate(store)

      const { listings, expanded, appliedQuery } = store.getState()
      expect(Object.keys(listings)).toEqual([BROWSE_QUERY_KEY])
      expect(Object.keys(listings[BROWSE_QUERY_KEY])).toEqual([ROOT_ID, "docs"])
      expect(expanded).toEqual(new Set(["docs"]))
      expect(appliedQuery).toBe(pngQuery)
    }
  )

  it.each<[string, (mutations: ExplorerMutations) => Promise<unknown>]>([
    ["createFolder", (m) => m.createFolder({ parentId: "docs", name: "a" })],
    [
      "createFile",
      (m) =>
        m.createFile({
          parentId: "docs",
          name: "a.png",
          category: "image",
          sizeInBytes: 1,
          previewUrl: "https://example.com/a.png",
        }),
    ],
    ["deleteNode", (m) => m.deleteNode("docs")],
  ])(
    "%s rethrows the API error and leaves the store untouched",
    async (_, run) => {
      const store = createExplorerStore()
      load(store, null, [folder("docs", null)])
      load(store, "docs", [file("a.png", "docs")])
      const before = store.getState()
      const error = new ApiError("conflict", "A sibling has that name")
      const reject = () => Promise.reject(error)

      await expect(
        run(
          createMutations(
            fakeApi({
              createFolder: reject,
              createFile: reject,
              deleteNode: reject,
            }),
            store
          )
        )
      ).rejects.toBe(error)
      expect(store.getState()).toBe(before)
    }
  )
})
