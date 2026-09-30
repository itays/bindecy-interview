import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import type {
  FileCategory,
  FileDetail,
  NodeDetail,
} from "~/features/file-explorer/domain/types"
import { useExplorerStore } from "~/features/file-explorer/state/explorer-provider"
import { renderWithExplorer } from "~/test/render-with-explorer"

import {
  FileDetailPreview,
  FilePreview,
  GENERIC_DETAIL_ERROR,
} from "./file-preview"

function makeDetail(
  category: FileCategory,
  previewUrl = `https://example.com/asset.${category}`
): FileDetail {
  return {
    id: `file-${category}`,
    name: `asset.${category}`,
    parentId: "folder-assets",
    type: "file",
    category,
    sizeInBytes: 1_048_576,
    previewUrl,
    ancestors: [
      { id: "folder-brand", name: "Brand" },
      { id: "folder-assets", name: "Assets" },
    ],
  }
}

type GetNodeCall = {
  id: string
  signal: AbortSignal | undefined
  resolve: (detail: NodeDetail) => void
  reject: (error: unknown) => void
}

/** A zero-latency mock whose `getNode` calls wait for the test to settle them. */
function createControlledApi() {
  const calls: GetNodeCall[] = []
  const api: FileExplorerApi = {
    ...createMockFileExplorerApi({ latency: 0 }),
    getNode: (id, signal) =>
      new Promise<NodeDetail>((resolve, reject) => {
        calls.push({ id, signal, resolve, reject })
      }),
  }
  return { api, calls }
}

function SelectButton({ id }: { id: string | null }) {
  const store = useExplorerStore()
  return (
    <button type="button" onClick={() => store.getState().select(id)}>
      {id === null ? "Clear selection" : `Select ${id}`}
    </button>
  )
}

function renderConnectedPreview(api: FileExplorerApi) {
  return renderWithExplorer(
    <>
      <SelectButton id="file-image" />
      <SelectButton id="file-doc" />
      <SelectButton id="file-wordmark-v2" />
      <SelectButton id={null} />
      <FilePreview />
    </>,
    { api }
  )
}

function select(id: string | null) {
  fireEvent.click(
    screen.getByRole("button", {
      name: id === null ? "Clear selection" : `Select ${id}`,
    })
  )
}

describe("FileDetailPreview", () => {
  it("shows an image while loading and after it becomes ready", () => {
    render(<FileDetailPreview detail={makeDetail("image")} />)
    const image = screen.getByRole("img", {
      name: "Preview of asset.image",
    })

    expect(screen.getByRole("status")).toHaveTextContent("Loading image…")

    fireEvent.load(image)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(image).toBeVisible()
  })

  it("shows the path from the ancestors down to the file", () => {
    render(<FileDetailPreview detail={makeDetail("image")} />)

    expect(screen.getByText("Brand / Assets / asset.image")).toBeInTheDocument()
  })

  it("keeps metadata and an external action when an image fails", () => {
    render(<FileDetailPreview detail={makeDetail("image")} />)

    fireEvent.error(screen.getByRole("img", { name: "Preview of asset.image" }))

    expect(screen.getByText("Image preview unavailable")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 2, name: "asset.image" })
    ).toBeInTheDocument()
    expect(screen.getByText("1 MB")).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "Open file" })).toHaveLength(2)
    for (const openFile of screen.getAllByRole("link", {
      name: "Open file",
    })) {
      expect(openFile).toHaveAttribute(
        "href",
        "https://example.com/asset.image"
      )
    }
  })

  it("renders labelled native audio and video previews", () => {
    const { rerender } = render(
      <FileDetailPreview detail={makeDetail("audio")} />
    )

    expect(
      screen.getByLabelText("Audio preview of asset.audio")
    ).toHaveAttribute("preload", "metadata")

    rerender(<FileDetailPreview detail={makeDetail("video")} />)

    expect(
      screen.getByLabelText("Video preview of asset.video")
    ).toHaveAttribute("preload", "metadata")
  })

  it("embeds documents with a titled frame and safe fallback link", () => {
    render(<FileDetailPreview detail={makeDetail("doc")} />)
    const frame = screen.getByTitle("Preview of asset.doc")
    const openFile = screen.getByRole("link", { name: "Open file" })

    expect(frame).toHaveAttribute("sandbox", "")
    expect(openFile.tagName).toBe("A")
    expect(openFile).toHaveAttribute("target", "_blank")
    expect(openFile).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("rejects unsupported preview URLs without exposing an open action", () => {
    render(
      <FileDetailPreview detail={makeDetail("doc", "javascript:alert(1)")} />
    )

    expect(screen.getByText("Preview unavailable")).toBeInTheDocument()
    expect(
      screen.getByText(/does not have a supported HTTP preview URL/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Open file" })
    ).not.toBeInTheDocument()
  })
})

describe("FilePreview", () => {
  it("asks for a selection while nothing is selected", () => {
    renderConnectedPreview(createControlledApi().api)

    expect(screen.getByText("Select a file to preview")).toBeInTheDocument()
    expect(screen.getByText("No selection")).toBeInTheDocument()
  })

  it("shows a loading state while the detail request is pending", async () => {
    const { api, calls } = createControlledApi()
    renderConnectedPreview(api)

    select("file-image")

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading file details…"
    )
    expect(calls.map((call) => call.id)).toEqual(["file-image"])

    await act(async () => calls[0].resolve(makeDetail("image")))

    expect(
      screen.getByRole("heading", { level: 2, name: "asset.image" })
    ).toBeInTheDocument()
    expect(screen.getByText("Brand / Assets / asset.image")).toBeInTheDocument()
  })

  it("shows Retry after a failed request and recovers when it succeeds", async () => {
    const { api, calls } = createControlledApi()
    renderConnectedPreview(api)

    select("file-image")
    await act(async () =>
      calls[0].reject(new ApiError("network", "The network is down"))
    )

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load file details"
    )
    expect(screen.getByText("The network is down")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading file details…"
    )
    expect(calls.map((call) => call.id)).toEqual(["file-image", "file-image"])

    await act(async () => calls[1].resolve(makeDetail("image")))

    expect(
      screen.getByRole("heading", { level: 2, name: "asset.image" })
    ).toBeInTheDocument()
  })

  it("shows a generic message for a failure that isn't an ApiError", async () => {
    const { api, calls } = createControlledApi()
    renderConnectedPreview(api)

    select("file-image")
    await act(async () => calls[0].reject(new TypeError("boom")))

    expect(screen.getByText(GENERIC_DETAIL_ERROR)).toBeInTheDocument()
    expect(screen.queryByText("boom")).not.toBeInTheDocument()
  })

  it("aborts the previous request on a new selection and ignores its late result", async () => {
    const { api, calls } = createControlledApi()
    renderConnectedPreview(api)

    select("file-image")
    select("file-doc")

    expect(calls[0].signal?.aborted).toBe(true)
    expect(calls[1].signal?.aborted).toBe(false)

    await act(async () => calls[0].resolve(makeDetail("image")))

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading file details…"
    )

    await act(async () => calls[1].resolve(makeDetail("doc")))

    expect(
      screen.getByRole("heading", { level: 2, name: "asset.doc" })
    ).toBeInTheDocument()
  })

  it("shows a file loaded earlier at once, without another request", async () => {
    const { api, calls } = createControlledApi()
    renderConnectedPreview(api)

    select("file-image")
    await act(async () => calls[0].resolve(makeDetail("image")))
    select("file-doc")
    await act(async () => calls[1].resolve(makeDetail("doc")))

    select("file-image")

    expect(
      screen.getByRole("heading", { level: 2, name: "asset.image" })
    ).toBeInTheDocument()
    expect(calls).toHaveLength(2)
  })

  it("loads a file that failed earlier again when it is selected again", async () => {
    const { api, calls } = createControlledApi()
    renderConnectedPreview(api)

    select("file-image")
    await act(async () => calls[0].reject(new ApiError("network", "Offline")))
    select("file-doc")
    await act(async () => calls[1].resolve(makeDetail("doc")))

    select("file-image")

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading file details…"
    )
    expect(calls.map((call) => call.id)).toEqual([
      "file-image",
      "file-doc",
      "file-image",
    ])
  })

  it("returns to the empty state when the selection is cleared", () => {
    const { api, calls } = createControlledApi()
    renderConnectedPreview(api)

    select("file-image")
    select(null)

    expect(calls[0].signal?.aborted).toBe(true)
    expect(screen.getByText("Select a file to preview")).toBeInTheDocument()
  })

  it("previews a nested file from the mock backend with its folder path", async () => {
    renderConnectedPreview(createMockFileExplorerApi({ latency: 0 }))

    select("file-wordmark-v2")

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "wordmark-v2.png",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText("Brand system / Logos / Archive / wordmark-v2.png")
    ).toBeInTheDocument()
  })
})
