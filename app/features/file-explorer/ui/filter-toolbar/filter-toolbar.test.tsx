import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MockInstance } from "vitest"

import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import { CURATED_RECORDS } from "~/features/file-explorer/api/mock/curated-fixture"
import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import type { FileQuery } from "~/features/file-explorer/domain/types"
import {
  ExplorerProvider,
  useExplorer,
  useExplorerStore,
} from "~/features/file-explorer/state/explorer-provider"
import { renderWithExplorer } from "~/test/render-with-explorer"
import { FilterToolbar } from "./filter-toolbar"

const format = (count: number) => count.toLocaleString("en-US")

/** Shows the applied query and the selection, and selects a root file on demand. */
function StoreProbe() {
  const store = useExplorerStore()
  const applied = useExplorer((state) =>
    state.appliedQuery === null ? "none" : JSON.stringify(state.appliedQuery)
  )
  const selected = useExplorer((state) => state.selectedId ?? "none")

  return (
    <>
      <span data-testid="applied-query">{applied}</span>
      <span data-testid="selected">{selected}</span>
      <button
        type="button"
        onClick={() => store.getState().select("file-project-brief")}
      >
        Select project brief
      </button>
    </>
  )
}

/** Runs due timers and the zero-latency mock's promise chains inside `act`. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Renders the toolbar; `curatedOnly` limits the mock to the 10-file demo tree. */
async function renderToolbar({ curatedOnly = false } = {}) {
  const api = createMockFileExplorerApi({
    latency: 0,
    ...(curatedOnly && { nodes: CURATED_RECORDS.length }),
  })
  const search = vi.spyOn(api, "search")
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const result = renderWithExplorer(
    <>
      <FilterToolbar />
      <StoreProbe />
    </>,
    { api }
  )
  await advance(0)
  return { ...result, api, search, user }
}

function searchedQueries(
  search: MockInstance<FileExplorerApi["search"]>
): FileQuery[] {
  return search.mock.calls.map(([request]) => request.query)
}

function statusLine() {
  return screen.getByText(/^(Showing|No matching|Fix the|Counting)/, {
    selector: "p",
  })
}

// `shouldAdvanceTime` keeps Testing Library's own `setTimeout` waits (and
// user-event's) running; debounce assertions stay well inside 250 ms.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("FilterToolbar", () => {
  it("shows no count until the stats load, then the formatted total", async () => {
    const api = createMockFileExplorerApi({ latency: 0 })
    const { fileCount } = await createMockFileExplorerApi({
      latency: 0,
    }).getStats({})

    renderWithExplorer(<FilterToolbar />, { api })

    expect(statusLine()).toHaveTextContent("Counting files…")
    expect(screen.getByText("Counting…")).toBeInTheDocument()

    await advance(0)

    expect(fileCount).toBeGreaterThanOrEqual(1000)
    expect(statusLine()).toHaveTextContent(
      `Showing all ${format(fileCount)} files.`
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      `Showing all ${format(fileCount)} files.`
    )
    expect(
      screen.getByText(`${format(fileCount)} of ${format(fileCount)} files`)
    ).toBeInTheDocument()
  })

  it("applies rapid typing once, after the debounce, and announces the counts", async () => {
    const { search, user } = await renderToolbar()
    const reference = createMockFileExplorerApi({ latency: 0 })
    const { fileCount: total } = await reference.getStats({})

    await user.type(screen.getByLabelText("Name"), "hero")

    expect(search).not.toHaveBeenCalled()
    expect(screen.getByTestId("applied-query")).toHaveTextContent("none")
    expect(statusLine()).toHaveTextContent(
      `Showing all ${format(total)} files.`
    )

    await advance(250)

    expect(searchedQueries(search)).toEqual([
      { name: "hero", minBytes: null, maxBytes: null, categories: [] },
    ])
    const { fileCount: matches } = await reference.getStats({
      query: searchedQueries(search)[0],
    })
    expect(matches).toBeGreaterThan(0)
    expect(screen.getByRole("status")).toHaveTextContent(
      `Showing ${format(matches)} of ${format(total)} files.`
    )
    expect(statusLine()).toHaveTextContent(
      `Showing ${format(matches)} of ${format(total)} files.`
    )
  })

  it("never applies an invalid size range and shows the field errors", async () => {
    const { search, user } = await renderToolbar({ curatedOnly: true })
    const maximumSize = screen.getByLabelText("Maximum size (MB)")

    await user.type(screen.getByLabelText("Minimum size (MB)"), "5")
    await user.type(maximumSize, "1")
    await advance(1000)

    expect(search).not.toHaveBeenCalled()
    expect(statusLine()).toHaveTextContent(
      "Fix the size filters to update the file results."
    )
    expect(screen.getByText("Filters paused")).toBeInTheDocument()
    // The error waits until the field is left or the draft is committed.
    expect(maximumSize).not.toHaveAttribute("aria-invalid")

    await user.keyboard("{Enter}")
    await advance(1000)

    expect(search).not.toHaveBeenCalled()
    expect(screen.getByTestId("applied-query")).toHaveTextContent("none")
    expect(maximumSize).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Maximum size must be greater than or equal to minimum size."
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Fix the size filters to update the file results."
    )
  })

  it("shows a negative size error after leaving the field", async () => {
    const { search, user } = await renderToolbar({ curatedOnly: true })
    const minimumSize = screen.getByLabelText("Minimum size (MB)")

    await user.type(minimumSize, "-1")
    await user.tab()
    await advance(1000)

    expect(minimumSize).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Size must be zero or greater."
    )
    expect(search).not.toHaveBeenCalled()
  })

  it("applies at once on Enter without a second call after the debounce", async () => {
    const { search, user } = await renderToolbar({ curatedOnly: true })

    await user.type(screen.getByLabelText("Name"), "not-in-this-project{Enter}")
    await advance(0)

    expect(searchedQueries(search)).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent(
      "No matching files. Showing 0 of 10 files."
    )
    expect(screen.getByText("0 of 10 files")).toBeInTheDocument()

    await advance(1000)

    expect(search).toHaveBeenCalledTimes(1)
  })

  it("applies a file-type toggle at once", async () => {
    const { search, user } = await renderToolbar({ curatedOnly: true })
    const audio = screen.getByRole("button", { name: "Audio files" })

    await user.click(audio)
    await advance(0)

    expect(audio).toHaveAttribute("aria-pressed", "true")
    expect(searchedQueries(search)).toEqual([
      { name: "", minBytes: null, maxBytes: null, categories: ["audio"] },
    ])
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing 2 of 10 files."
    )
  })

  it("resets at once and cancels the pending apply", async () => {
    const { search, user } = await renderToolbar({ curatedOnly: true })
    const name = screen.getByLabelText("Name")
    const reset = screen.getByRole("button", { name: "Reset filters" })

    expect(reset).toBeDisabled()

    await user.type(name, "hero")
    await advance(250)
    await user.type(name, "-dusk")
    await user.click(reset)
    await advance(1000)

    expect(searchedQueries(search).map((query) => query.name)).toEqual(["hero"])
    expect(screen.getByTestId("applied-query")).toHaveTextContent("none")
    expect(name).toHaveValue("")
    expect(reset).toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing all 10 files."
    )
  })

  it("announces a selection the filters cleared", async () => {
    const { user } = await renderToolbar({ curatedOnly: true })

    await user.click(
      screen.getByRole("button", { name: "Select project brief" })
    )
    expect(screen.getByTestId("selected")).toHaveTextContent(
      "file-project-brief"
    )

    await user.type(screen.getByLabelText("Name"), "hero-dusk{Enter}")
    await advance(0)

    expect(screen.getByTestId("selected")).toHaveTextContent("none")
    expect(
      screen.getByText(
        "project-brief.pdf doesn't match the filters and was deselected."
      )
    ).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing 1 of 10 files."
    )
  })

  it("drops the pending apply when it unmounts", async () => {
    const { rerender, search, user, api } = await renderToolbar()

    await user.type(screen.getByLabelText("Name"), "hero")
    // Same provider instance, so its loader keeps working without the toolbar.
    rerender(
      <ExplorerProvider api={api}>
        <StoreProbe />
      </ExplorerProvider>
    )
    await advance(1000)

    expect(search).not.toHaveBeenCalled()
    expect(screen.getByTestId("applied-query")).toHaveTextContent("none")
  })
})
