import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect } from "react"
import { describe, expect, it, vi } from "vitest"

import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type {
  FileExplorerApi,
  ListChildrenRequest,
} from "~/features/file-explorer/api/file-explorer-api"
import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import type {
  FileSummary,
  NodeSummary,
  Page,
} from "~/features/file-explorer/domain/types"
import {
  useExplorerStore,
  useLoader,
  useVisibleRows,
} from "~/features/file-explorer/state/explorer-provider"
import type { ExplorerStoreApi } from "~/features/file-explorer/state/explorer-store"
import type { Loader } from "~/features/file-explorer/state/loader"
import { renderWithExplorer } from "~/test/render-with-explorer"

import { TreeRow, treeRowId } from "./tree-row"

type Handles = { store: ExplorerStoreApi; loader: Loader }

/** Renders every visible row, unvirtualized, and hands out the store and loader. */
function TestTree({ onReady }: { onReady: (handles: Handles) => void }) {
  const store = useExplorerStore()
  const loader = useLoader()
  const rows = useVisibleRows()

  useEffect(() => onReady({ store, loader }), [onReady, store, loader])

  return (
    <div role="tree" aria-label="Project files">
      {rows.map((row) => (
        <TreeRow key={row.key} row={row} />
      ))}
    </div>
  )
}

function renderTree(api?: FileExplorerApi) {
  let handles: Handles | undefined
  const result = renderWithExplorer(
    <TestTree
      onReady={(next) => {
        handles = next
      }}
    />,
    { api }
  )

  return { ...result, ...handles! }
}

function treeItem(name: string | RegExp) {
  return screen.findByRole("treeitem", { name })
}

async function expandBrandSystem(tree: Handles) {
  await treeItem("Brand system (3 files)")
  act(() => tree.store.getState().toggleExpanded("folder-brand"))
  await act(() => tree.loader.ensureChildren("folder-brand"))
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const ROOT_FILE_COUNT = 1_500

const rootFiles: FileSummary[] = Array.from(
  { length: ROOT_FILE_COUNT },
  (_, index) => ({
    id: `file-${index}`,
    parentId: null,
    name: `file-${String(index).padStart(4, "0")}.txt`,
    type: "file",
    category: "doc",
    sizeInBytes: 1,
  })
)

/** Pages of `rootFiles`; the cursor is the next start index. */
function rootPage({ cursor, limit }: ListChildrenRequest): Page<NodeSummary> {
  const start = cursor === undefined ? 0 : Number(cursor)
  const end = Math.min(start + limit, ROOT_FILE_COUNT)

  return {
    items: rootFiles.slice(start, end),
    nextCursor: end < ROOT_FILE_COUNT ? String(end) : null,
    total: ROOT_FILE_COUNT,
  }
}

describe("TreeRow", () => {
  it("exposes a folder's name, file count, position and expansion", async () => {
    const tree = renderTree()

    const folder = await treeItem("Brand system (3 files)")
    expect(folder).toHaveAttribute("aria-level", "1")
    expect(folder).toHaveAttribute("aria-posinset", "2")
    expect(folder).toHaveAttribute("aria-setsize", "5")
    expect(folder).toHaveAttribute("aria-expanded", "false")
    expect(folder).not.toHaveAttribute("aria-selected")
    expect(document.getElementById(treeRowId("folder-brand"))).toBe(folder)

    act(() => tree.store.getState().toggleExpanded("folder-brand"))

    expect(folder).toHaveAttribute("aria-expanded", "true")
    const loading = screen.getByRole("treeitem", { name: "Loading…" })
    expect(loading).toHaveAttribute("aria-level", "2")
    expect(loading).not.toHaveAttribute("aria-expanded")

    act(() => tree.store.getState().toggleExpanded("folder-brand"))

    expect(folder).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("treeitem", { name: "Loading…" })).toBeNull()
  })

  it("exposes a file's name, size, category and selection", async () => {
    const tree = renderTree()
    await expandBrandSystem(tree)

    const file = await treeItem("brand-guidelines.pdf 4.6 MB Document")
    expect(file).toHaveAttribute("aria-level", "2")
    expect(file).toHaveAttribute("aria-posinset", "2")
    expect(file).toHaveAttribute("aria-setsize", "2")
    expect(file).toHaveAttribute("aria-selected", "false")
    expect(file).not.toHaveAttribute("aria-expanded")

    act(() => tree.store.getState().select("file-brand-guidelines"))

    expect(file).toHaveAttribute("aria-selected", "true")
    expect(
      screen.getByRole("treeitem", {
        name: "project-brief.pdf 512 KB Document",
      })
    ).toHaveAttribute("aria-selected", "false")
  })

  it("doesn't expose an empty folder as expandable", async () => {
    const api = createMockFileExplorerApi({ latency: 0 })
    await api.createFolder({ parentId: null, name: "Empty" })
    renderTree(api)

    const empty = await treeItem("Empty (0 files)")
    expect(empty).not.toHaveAttribute("aria-expanded")
    expect(empty).toHaveAttribute("aria-setsize", "6")
  })

  it("shows the matching file count while filtering", async () => {
    const tree = renderTree()
    await treeItem("Brand system (3 files)")

    await act(() =>
      tree.loader.applyFilters({
        name: "brand-guidelines",
        minBytes: null,
        maxBytes: null,
        categories: [],
      })
    )
    await act(() => tree.loader.ensureChildren(null))

    expect(await treeItem("Brand system (1 matching file)")).toBeInTheDocument()
  })

  it("requests the next page when the load-more row mounts, and again after each page while it stays", async () => {
    const mock = createMockFileExplorerApi({ latency: 0 })
    const nextPages: Deferred<Page<NodeSummary>>[] = []
    const listChildren = vi.fn(async (request: ListChildrenRequest) => {
      if (request.cursor === undefined) return rootPage(request)
      const next = deferred<Page<NodeSummary>>()
      nextPages.push(next)
      return next.promise
    })
    renderTree({ ...mock, listChildren })

    expect(await treeItem("Loading more… 100 of 1,500")).toHaveAttribute(
      "aria-level",
      "1"
    )
    expect(screen.getAllByRole("treeitem")).toHaveLength(101)
    await waitFor(() =>
      expect(listChildren).toHaveBeenLastCalledWith(
        expect.objectContaining({ folderId: null, cursor: "100" }),
        expect.anything()
      )
    )
    expect(nextPages).toHaveLength(1)

    await act(async () =>
      nextPages[0].resolve(
        rootPage({ folderId: null, cursor: "100", limit: 100 })
      )
    )

    expect(await treeItem("Loading more… 200 of 1,500")).toBeInTheDocument()
    expect(screen.getAllByRole("treeitem")).toHaveLength(201)
    await waitFor(() =>
      expect(listChildren).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: "200" }),
        expect.anything()
      )
    )
    expect(nextPages).toHaveLength(2)
  })

  it("retries the project files after a failure", async () => {
    const user = userEvent.setup()
    renderTree(createMockFileExplorerApi({ latency: 0, failFirst: 1 }))

    const error = await treeItem(/^Couldn't load project files/)
    expect(error).toHaveAttribute("aria-level", "1")
    expect(screen.getAllByRole("treeitem")).toHaveLength(1)

    await user.click(within(error).getByRole("button", { name: "Retry" }))

    expect(await treeItem("Brand system (3 files)")).toBeInTheDocument()
    expect(
      screen.queryByRole("treeitem", { name: /^Couldn't load/ })
    ).toBeNull()
  })

  it("names the folder that failed and retries it", async () => {
    const user = userEvent.setup()
    const mock = createMockFileExplorerApi({ latency: 0 })
    let brandFailuresLeft = 1
    const listChildren: FileExplorerApi["listChildren"] = async (
      request,
      signal
    ) => {
      if (request.folderId === "folder-brand" && brandFailuresLeft > 0) {
        brandFailuresLeft -= 1
        throw new ApiError("network", "Simulated network failure")
      }
      return mock.listChildren(request, signal)
    }
    const tree = renderTree({ ...mock, listChildren })
    await expandBrandSystem(tree)

    const error = await treeItem(/^Couldn't load Brand system/)
    expect(error).toHaveAttribute("aria-level", "2")

    await user.click(within(error).getByRole("button", { name: "Retry" }))

    expect(
      await treeItem("brand-guidelines.pdf 4.6 MB Document")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("treeitem", { name: /^Couldn't load/ })
    ).toBeNull()
  })
})
