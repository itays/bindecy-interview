import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import { StrictMode } from "react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type {
  CreateFileInput,
  FileExplorerApi,
} from "~/features/file-explorer/api/file-explorer-api"
import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import { renderWithExplorer } from "~/test/render-with-explorer"
import {
  ExplorerProvider,
  useApi,
  useExplorer,
  useExplorerStore,
  useLoader,
  useMutations,
  useVisibleRows,
} from "./explorer-provider"

/** Root listing names from a fresh mock with the same (default) seed. */
async function expectedRootNames(): Promise<string[]> {
  const page = await createMockFileExplorerApi({ latency: 0 }).listChildren({
    folderId: null,
    limit: 100,
  })
  return page.items.map((node) => node.name)
}

async function expectedTotal(): Promise<number> {
  const stats = await createMockFileExplorerApi({ latency: 0 }).getStats({})
  return stats.fileCount
}

function RootNames() {
  const names = useExplorer((state) =>
    (state.listings.browse?.root?.ids ?? []).map(
      (id) => state.nodesById.get(id)?.name
    )
  )
  return <output aria-label="root">{names.join(",")}</output>
}

function newFile(
  name: string,
  parentId: string | null = null
): CreateFileInput {
  return {
    parentId,
    name,
    category: "doc",
    sizeInBytes: 1,
    previewUrl: "https://example.com/file.pdf",
  }
}

function wrapperFor(api: FileExplorerApi) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ExplorerProvider api={api}>{children}</ExplorerProvider>
  }
}

afterEach(() => {
  window.history.replaceState(null, "", "/")
  vi.restoreAllMocks()
})

describe("ExplorerProvider", () => {
  it("loads the root listing into the store on mount", async () => {
    const names = await expectedRootNames()

    renderWithExplorer(<RootNames />)

    await waitFor(() =>
      expect(screen.getByLabelText("root")).toHaveTextContent(names.join(","))
    )
  })

  it("loads the total file count on mount", async () => {
    const total = await expectedTotal()
    const { result } = renderHook(() => useExplorer((s) => s.stats.total), {
      wrapper: wrapperFor(createMockFileExplorerApi({ latency: 0 })),
    })

    await waitFor(() => expect(result.current).toBe(total))
  })

  it("loads the root listing under StrictMode, which remounts the provider", async () => {
    const names = await expectedRootNames()

    render(
      <StrictMode>
        <ExplorerProvider api={createMockFileExplorerApi({ latency: 20 })}>
          <RootNames />
        </ExplorerProvider>
      </StrictMode>
    )

    await waitFor(() =>
      expect(screen.getByLabelText("root")).toHaveTextContent(names.join(","))
    )
  })

  it("aborts the in-flight requests on unmount", () => {
    const api = createMockFileExplorerApi({ latency: 1000 })
    const listChildren = vi.spyOn(api, "listChildren")
    const getStats = vi.spyOn(api, "getStats")
    const { unmount } = renderWithExplorer(<RootNames />, { api })
    const signals = [...listChildren.mock.calls, ...getStats.mock.calls].map(
      ([, signal]) => signal
    )

    unmount()

    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
  })

  it("uses the mock configured by the page URL when no api is given", async () => {
    window.history.replaceState(null, "", "/?latency=0&failFirst=1&nodes=18")

    const { result } = renderHook(
      () => useExplorer((s) => s.listings.browse?.root?.status),
      { wrapper: ExplorerProvider }
    )

    await waitFor(() => expect(result.current).toBe("error"))
  })

  it.each<[string, () => unknown]>([
    ["useExplorer", () => useExplorer((s) => s.selectedId)],
    ["useVisibleRows", useVisibleRows],
    ["useExplorerStore", useExplorerStore],
    ["useLoader", useLoader],
    ["useMutations", useMutations],
    ["useApi", useApi],
  ])("%s throws outside the provider", (_name, hook) => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => renderHook(hook)).toThrow(
      "Explorer hooks must be used inside <ExplorerProvider>"
    )
  })
})

describe("useMutations", () => {
  function renderTotalAndMutations(api: FileExplorerApi) {
    return renderHook(
      () => ({
        total: useExplorer((s) => s.stats.total),
        mutations: useMutations(),
      }),
      { wrapper: wrapperFor(api) }
    )
  }

  it("refreshes the total file count after a create and after a delete", async () => {
    const total = await expectedTotal()
    const { result } = renderTotalAndMutations(
      createMockFileExplorerApi({ latency: 0 })
    )
    await waitFor(() => expect(result.current.total).toBe(total))

    const created = await act(() =>
      result.current.mutations.createFile(newFile("new.pdf"))
    )
    await waitFor(() => expect(result.current.total).toBe(total + 1))

    await act(() => result.current.mutations.deleteNode(created.id))
    await waitFor(() => expect(result.current.total).toBe(total))
  })

  it("passes a failed mutation to the caller without refreshing the counts", async () => {
    const api = createMockFileExplorerApi({ latency: 0 })
    const getStats = vi.spyOn(api, "getStats")
    const { result } = renderTotalAndMutations(api)
    await waitFor(() => expect(result.current.total).not.toBeNull())

    const failure = await act(() =>
      result.current.mutations
        .createFile(newFile("new.pdf", "missing-folder"))
        .catch((error: unknown) => error)
    )

    expect(failure).toBeInstanceOf(ApiError)
    expect(getStats).toHaveBeenCalledTimes(1)
  })
})

describe("useExplorer", () => {
  it("re-renders only when the selected slice changes shallowly", async () => {
    let renders = 0
    const { result } = renderHook(
      () => {
        renders += 1
        return {
          slice: useExplorer((s) => ({
            selectedId: s.selectedId,
            activeId: s.activeId,
          })),
          store: useExplorerStore(),
        }
      },
      { wrapper: wrapperFor(createMockFileExplorerApi({ latency: 0 })) }
    )
    const { store } = result.current
    await waitFor(() =>
      expect(store.getState().listings.browse?.root?.status).toBe("idle")
    )
    const settled = renders

    act(() => store.getState().setStats({ total: 1 }))
    expect(renders).toBe(settled)

    act(() => store.getState().select("file-project-brief"))
    expect(renders).toBe(settled + 1)
    expect(result.current.slice).toEqual({
      selectedId: "file-project-brief",
      activeId: null,
    })
  })
})

describe("useVisibleRows", () => {
  it("keeps the same array until a row input changes", async () => {
    const { result } = renderHook(
      () => ({ rows: useVisibleRows(), store: useExplorerStore() }),
      { wrapper: wrapperFor(createMockFileExplorerApi({ latency: 0 })) }
    )
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0))
    const loaded = result.current.rows
    const { store } = result.current

    act(() => store.getState().select("file-project-brief"))
    act(() => store.getState().setStats({ total: 1 }))
    expect(result.current.rows).toBe(loaded)

    act(() => store.getState().toggleExpanded("folder-asset-library"))
    expect(result.current.rows).not.toBe(loaded)
    expect(result.current.rows).toContainEqual(
      expect.objectContaining({
        kind: "loading",
        folderId: "folder-asset-library",
      })
    )
  })
})
