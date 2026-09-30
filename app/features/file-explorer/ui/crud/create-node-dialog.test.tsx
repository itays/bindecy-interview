import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PREVIEW_URLS } from "~/features/file-explorer/api/mock/curated-fixture"
import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import type { NodeSummary } from "~/features/file-explorer/domain/types"
import { useExplorer } from "~/features/file-explorer/state/explorer-provider"
import { renderWithExplorer } from "~/test/render-with-explorer"
import { CreateNodeDialog } from "./create-node-dialog"
import type { CreateNodeKind } from "./create-node-dialog"

const MB = 1_048_576

/** Shows the active and selected ids, and whether the top level has loaded. */
function StoreProbe() {
  const { active, selected, loaded } = useExplorer((state) => ({
    active: state.activeId ?? "none",
    selected: state.selectedId ?? "none",
    loaded: state.nodesById.has("folder-brand"),
  }))

  return (
    <>
      <span data-testid="active">{active}</span>
      <span data-testid="selected">{selected}</span>
      {loaded ? <span>Top level loaded</span> : null}
    </>
  )
}

async function renderDialog(kind: CreateNodeKind, parentId: string | null) {
  const api = createMockFileExplorerApi({ latency: 0 })
  const createFolder = vi.spyOn(api, "createFolder")
  const createFile = vi.spyOn(api, "createFile")
  const onCreated = vi.fn<(node: NodeSummary) => void>()

  renderWithExplorer(
    <>
      <StoreProbe />
      <CreateNodeDialog
        open
        kind={kind}
        parentId={parentId}
        onOpenChange={() => {}}
        onCreated={onCreated}
      />
    </>,
    { api }
  )
  // The top level names the parent folder.
  await screen.findByText("Top level loaded")

  return { api, createFolder, createFile, onCreated, user: userEvent.setup() }
}

describe("CreateNodeDialog", () => {
  it("names the target folder, or the top level", async () => {
    await renderDialog("folder", "folder-brand")

    expect(
      screen.getByRole("dialog", { name: "New folder" })
    ).toHaveAccessibleDescription("Adds a folder to Brand system.")
  })

  it("describes a top-level file", async () => {
    await renderDialog("file", null)

    expect(
      screen.getByRole("dialog", { name: "New file" })
    ).toHaveAccessibleDescription("Adds a file at the top level.")
  })

  it("rejects a blank name on the field without calling the API", async () => {
    const { user, createFolder, onCreated } = await renderDialog(
      "folder",
      "folder-brand"
    )
    const name = screen.getByLabelText("Name")

    await user.type(name, "   ")
    await user.click(screen.getByRole("button", { name: "Create folder" }))

    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(name).toHaveAccessibleDescription("Enter a name.")
    expect(name).toHaveFocus()
    expect(createFolder).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it.each([
    ["blank", "", "Enter a size in megabytes."],
    ["negative", "-1", "Size must be zero or greater."],
    ["not a number", "2 MB", "Enter a valid size in megabytes."],
  ])("rejects a %s size on the field", async (_case, size, message) => {
    const { user, createFile } = await renderDialog("file", "folder-brand")

    await user.type(screen.getByLabelText("Name"), "notes.pdf")
    if (size) await user.type(screen.getByLabelText("Size (MB)"), size)
    await user.click(screen.getByRole("button", { name: "Create file" }))

    const field = screen.getByLabelText("Size (MB)")
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveAccessibleDescription(message)
    expect(createFile).not.toHaveBeenCalled()
  })

  it.each([
    ["another scheme", "ftp://example.com/a.png"],
    ["a relative path", "images/a.png"],
  ])("rejects a preview URL with %s", async (_case, url) => {
    const { user, createFile } = await renderDialog("file", "folder-brand")

    await user.type(screen.getByLabelText("Name"), "a.png")
    await user.type(screen.getByLabelText("Size (MB)"), "1")
    await user.type(screen.getByLabelText(/^Preview URL/), url)
    await user.click(screen.getByRole("button", { name: "Create file" }))

    const field = screen.getByLabelText(/^Preview URL/)
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(field).toHaveAccessibleDescription(
      "Enter a URL that starts with http:// or https://."
    )
    expect(createFile).not.toHaveBeenCalled()
  })

  it("shows a duplicate name on the name field, then creates after a rename", async () => {
    const { user, createFolder, onCreated } = await renderDialog(
      "folder",
      "folder-brand"
    )
    const name = screen.getByLabelText("Name")

    // Sibling names clash case-insensitively ("Logos" is in Brand system).
    await user.type(name, "logos")
    await user.click(screen.getByRole("button", { name: "Create folder" }))

    expect(await screen.findByText("logos already exists")).toBeInTheDocument()
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(name).toHaveAccessibleDescription("logos already exists")
    expect(name).toHaveFocus()
    expect(onCreated).not.toHaveBeenCalled()

    // Editing the name clears its error.
    await user.clear(name)
    expect(name).not.toHaveAttribute("aria-invalid")

    await user.type(name, "  Drafts ")
    await user.click(screen.getByRole("button", { name: "Create folder" }))

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(createFolder).toHaveBeenLastCalledWith({
      parentId: "folder-brand",
      name: "Drafts",
    })
    const created = onCreated.mock.calls[0][0]
    expect(created).toMatchObject({ type: "folder", name: "Drafts" })
    expect(screen.getByTestId("active")).toHaveTextContent(created.id)
  })

  it("creates a file in bytes with the category's sample preview when the URL is blank", async () => {
    const { user, createFile, onCreated } = await renderDialog(
      "file",
      "folder-brand"
    )

    await user.type(screen.getByLabelText("Name"), "cover.png")
    await user.selectOptions(screen.getByLabelText("Category"), "Image")
    await user.type(screen.getByLabelText("Size (MB)"), "1.5")
    await user.click(screen.getByRole("button", { name: "Create file" }))

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(createFile).toHaveBeenCalledWith({
      parentId: "folder-brand",
      name: "cover.png",
      category: "image",
      sizeInBytes: 1.5 * MB,
      previewUrl: PREVIEW_URLS.image[0],
    })
    expect(screen.getByTestId("selected")).toHaveTextContent(
      onCreated.mock.calls[0][0].id
    )
  })

  it("sends a given preview URL trimmed", async () => {
    const { user, createFile, onCreated } = await renderDialog("file", null)

    await user.type(screen.getByLabelText("Name"), "clip.mp4")
    await user.selectOptions(screen.getByLabelText("Category"), "Video")
    await user.type(screen.getByLabelText("Size (MB)"), "0")
    await user.type(
      screen.getByLabelText(/^Preview URL/),
      " https://example.com/clip.mp4 "
    )
    await user.click(screen.getByRole("button", { name: "Create file" }))

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        category: "video",
        sizeInBytes: 0,
        previewUrl: "https://example.com/clip.mp4",
      })
    )
  })

  it("shows an API error that belongs to no field as a form alert", async () => {
    const { user, api, onCreated } = await renderDialog(
      "folder",
      "folder-brand"
    )

    await api.deleteNode("folder-brand")
    await user.type(screen.getByLabelText("Name"), "Drafts")
    await user.click(screen.getByRole("button", { name: "Create folder" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Folder folder-brand not found"
    )
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid")
    expect(onCreated).not.toHaveBeenCalled()
  })
})
