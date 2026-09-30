import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect } from "react"
import type { ReactElement } from "react"
import { describe, expect, it } from "vitest"

import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import {
  useExplorerStore,
  useLoader,
} from "~/features/file-explorer/state/explorer-provider"
import { BROWSE_QUERY_KEY } from "~/features/file-explorer/state/explorer-store"
import type { ExplorerStoreApi } from "~/features/file-explorer/state/explorer-store"
import type { Loader } from "~/features/file-explorer/state/loader"
import { renderWithExplorer } from "~/test/render-with-explorer"

import { TreePanel } from "./tree-panel"
import { VirtualTree } from "./virtual-tree"

const EMPTY_QUERY = { name: "", minBytes: null, maxBytes: null, categories: [] }

type Handles = { store: ExplorerStoreApi; loader: Loader }

function Handles({ onReady }: { onReady: (handles: Handles) => void }) {
  const store = useExplorerStore()
  const loader = useLoader()

  useEffect(() => onReady({ store, loader }), [onReady, store, loader])

  return null
}

function renderTree(api?: FileExplorerApi, ui: ReactElement = <VirtualTree />) {
  let handles: Handles | undefined
  const result = renderWithExplorer(
    <>
      <Handles
        onReady={(next) => {
          handles = next
        }}
      />
      {ui}
    </>,
    { api }
  )

  return { ...result, ...handles! }
}

function treeItem(name: string | RegExp) {
  return screen.findByRole("treeitem", { name })
}

function activeRow() {
  const id = screen
    .getByRole("tree", { name: "Project files" })
    .getAttribute("aria-activedescendant")

  return id === null ? null : document.getElementById(id)
}

/** jsdom doesn't scroll; the viewport reports `top` and fires `scroll`. */
function scrollViewportTo(top: number) {
  const viewport = screen
    .getByRole("tree", { name: "Project files" })
    .closest<HTMLElement>('[data-slot="scroll-area-viewport"]')!

  Object.defineProperty(viewport, "scrollTop", {
    configurable: true,
    value: top,
  })
  fireEvent.scroll(viewport)
}

describe("VirtualTree", () => {
  it("moves aria-activedescendant with the arrow keys, Home and End", async () => {
    const user = userEvent.setup()
    renderTree()
    const first = await treeItem(/^Asset library/)
    const tree = screen.getByRole("tree", { name: "Project files" })
    const rows = screen.getAllByRole("treeitem")

    expect(tree).not.toHaveAttribute("aria-activedescendant")

    await user.tab()

    expect(tree).toHaveFocus()
    expect(activeRow()).toBe(first)

    await user.keyboard("{ArrowDown}")
    expect(activeRow()).toBe(rows[1])

    await user.keyboard("{End}")
    expect(activeRow()).toBe(rows.at(-1))

    await user.keyboard("{ArrowDown}")
    expect(activeRow()).toBe(rows.at(-1))

    await user.keyboard("{ArrowUp}")
    expect(activeRow()).toBe(rows.at(-2))

    await user.keyboard("{Home}")
    expect(activeRow()).toBe(first)
    expect(first).toHaveAttribute("data-active")
    expect(tree).toHaveFocus()
  })

  it("expands a folder with Enter: a loading row, then its children", async () => {
    const user = userEvent.setup()
    const mock = createMockFileExplorerApi({ latency: 0 })
    let releaseBrand: () => void = () => {}
    const brandGate = new Promise<void>((resolve) => {
      releaseBrand = resolve
    })
    renderTree({
      ...mock,
      listChildren: async (request, signal) => {
        if (request.folderId === "folder-brand") await brandGate
        return mock.listChildren(request, signal)
      },
    })
    const folder = await treeItem("Brand system (3 files)")

    await user.tab()
    await user.keyboard("{ArrowDown}")
    expect(activeRow()).toBe(folder)

    await user.keyboard("{Enter}")

    expect(folder).toHaveAttribute("aria-expanded", "true")
    const loading = screen.getByRole("treeitem", { name: "Loading…" })
    expect(loading).toHaveAttribute("aria-level", "2")
    expect(screen.getAllByRole("treeitem").indexOf(loading)).toBe(
      screen.getAllByRole("treeitem").indexOf(folder) + 1
    )

    await act(async () => releaseBrand())

    const child = await treeItem(/^Logos/)
    expect(child).toHaveAttribute("aria-level", "2")
    expect(screen.queryByRole("treeitem", { name: "Loading…" })).toBeNull()
    expect(activeRow()).toBe(folder)

    await user.keyboard("{Enter}")

    expect(folder).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("treeitem", { name: /^Logos/ })).toBeNull()
  })

  it("toggles a folder and selects a file on click, making the row active", async () => {
    const user = userEvent.setup()
    renderTree()
    const folder = await treeItem("Brand system (3 files)")

    await user.click(folder)

    expect(folder).toHaveAttribute("aria-expanded", "true")
    expect(activeRow()).toBe(folder)

    const file = await treeItem("brand-guidelines.pdf 4.6 MB Document")
    await user.click(file)

    expect(file).toHaveAttribute("aria-selected", "true")
    expect(activeRow()).toBe(file)
    expect(screen.getByRole("tree", { name: "Project files" })).toHaveFocus()

    await user.click(folder)

    expect(folder).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByRole("treeitem", { name: /^brand-guidelines/ })
    ).toBeNull()
    expect(activeRow()).toBe(folder)
  })

  it("renders a bounded window of a 5,000-child folder and keeps the active row mounted", async () => {
    const user = userEvent.setup()
    const tree = renderTree()
    await user.click(await treeItem(/^Asset library/))
    const stock = await treeItem(/^Stock footage/)
    await user.click(stock)
    const stockListing = () =>
      tree.store.getState().listings[BROWSE_QUERY_KEY]?.["folder-stock-footage"]
    await waitFor(() => expect(stockListing()?.ids).toHaveLength(100))

    // Every page; the load-more row sits below the window, so the test pages.
    await act(async () => {
      while (stockListing()?.nextCursor) {
        await tree.loader.loadMore("folder-stock-footage")
      }
    })
    expect(stockListing()?.ids).toHaveLength(5_000)
    expect(screen.getAllByRole("treeitem").length).toBeLessThanOrEqual(60)

    // Halfway down the folder (file rows are 50 px), far below "Stock footage".
    scrollViewportTo(2_500 * 50)

    await waitFor(() =>
      expect(
        screen.queryByRole("treeitem", { name: /^Asset library/ })
      ).toBeNull()
    )
    const items = screen.getAllByRole("treeitem")
    expect(items.length).toBeGreaterThan(20)
    expect(items.length).toBeLessThanOrEqual(60)
    const inWindow = items.filter((item) => item !== stock)
    expect(
      inWindow.every((item) => item.getAttribute("aria-setsize") === "5000")
    ).toBe(true)
    // The active row stays rendered far outside the window.
    expect(activeRow()).toBe(stock)

    await user.keyboard("{End}")

    expect(activeRow()).toHaveAccessibleName(
      "project-brief.pdf 512 KB Document"
    )
    expect(screen.getAllByRole("treeitem").length).toBeLessThanOrEqual(61)
  })
})

describe("TreePanel", () => {
  it("shows the file count for the applied query and a no-results state", async () => {
    const api = createMockFileExplorerApi({ latency: 0 })
    const [{ fileCount: total }, { fileCount: matching }] = await Promise.all([
      api.getStats({}),
      api.getStats({ query: { ...EMPTY_QUERY, name: "brand" } }),
    ])
    const tree = renderTree(api, <TreePanel />)
    const header = screen
      .getByText("Project files")
      .closest<HTMLElement>('[data-slot="card-header"]')!

    await waitFor(() =>
      expect(header).toHaveTextContent(`${total.toLocaleString("en")} files`)
    )

    await act(() => tree.loader.applyFilters({ ...EMPTY_QUERY, name: "brand" }))

    await waitFor(() =>
      expect(header).toHaveTextContent(
        `${matching.toLocaleString("en")} matching files`
      )
    )
    expect(await treeItem(/^Brand system/)).toBeInTheDocument()

    await act(() =>
      tree.loader.applyFilters({ ...EMPTY_QUERY, name: "no-such-file" })
    )

    expect(await screen.findByText("No matching files")).toBeInTheDocument()
    expect(screen.queryByRole("tree")).toBeNull()
    expect(header).toHaveTextContent("0 matching files")
    expect(header).toHaveTextContent("Adjust or reset the filters")
  })
})
