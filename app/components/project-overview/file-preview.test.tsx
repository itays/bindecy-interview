import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { FileCategory, FileNode } from "~/types/project-node"

import { FilePreview } from "./file-preview"
import type { FileLocation } from "./file-tree-utils"

function makeLocation(
  category: FileCategory,
  previewUrl = `https://example.com/asset.${category}`
): FileLocation {
  const file: FileNode = {
    id: `file-${category}`,
    name: `asset.${category}`,
    type: "file",
    category,
    sizeInBytes: 1_048_576,
    previewUrl,
  }

  return { file, path: ["Assets", file.name] }
}

describe("FilePreview", () => {
  it("shows an image while loading and after it becomes ready", () => {
    render(<FilePreview location={makeLocation("image")} />)
    const image = screen.getByRole("img", {
      name: "Preview of asset.image",
    })

    expect(screen.getByRole("status")).toHaveTextContent("Loading image…")

    fireEvent.load(image)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(image).toBeVisible()
  })

  it("keeps metadata and an external action when an image fails", () => {
    render(<FilePreview location={makeLocation("image")} />)

    fireEvent.error(screen.getByRole("img", { name: "Preview of asset.image" }))

    expect(screen.getByText("Image preview unavailable")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 2, name: "asset.image" })
    ).toBeInTheDocument()
    expect(screen.getByText("1 MB")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Open file" })).toHaveLength(2)
    for (const openFile of screen.getAllByRole("button", {
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
      <FilePreview location={makeLocation("audio")} />
    )

    expect(
      screen.getByLabelText("Audio preview of asset.audio")
    ).toHaveAttribute("preload", "metadata")

    rerender(<FilePreview location={makeLocation("video")} />)

    expect(
      screen.getByLabelText("Video preview of asset.video")
    ).toHaveAttribute("preload", "metadata")
  })

  it("embeds documents with a titled frame and safe fallback link", () => {
    render(<FilePreview location={makeLocation("doc")} />)
    const frame = screen.getByTitle("Preview of asset.doc")
    const openFile = screen.getByRole("button", { name: "Open file" })

    expect(frame).toHaveAttribute("sandbox", "")
    expect(openFile.tagName).toBe("A")
    expect(openFile).toHaveAttribute("target", "_blank")
    expect(openFile).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("rejects unsupported preview URLs without exposing an open action", () => {
    render(
      <FilePreview location={makeLocation("doc", "javascript:alert(1)")} />
    )

    expect(screen.getByText("Preview unavailable")).toBeInTheDocument()
    expect(
      screen.getByText(/does not have a supported HTTP preview URL/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Open file" })
    ).not.toBeInTheDocument()
  })
})
