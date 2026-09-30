import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import { useExplorer } from "~/features/file-explorer/state/explorer-provider"
import { renderWithExplorer } from "~/test/render-with-explorer"

import { TreePanel } from "../tree/tree-panel"
import { treeRowId } from "../tree/tree-row-id"

/** Shows the selected id, which the preview follows. */
function SelectionProbe() {
  const selected = useExplorer((state) => state.selectedId ?? "none")

  return <span data-testid="selected">{selected}</span>
}

async function renderPanel() {
  const api = createMockFileExplorerApi({ latency: 0 })
  // An empty top-level folder, sorted between Brand system and Launch campaign.
  await api.createFolder({ parentId: null, name: "Drafts" })
  const deleteNode = vi.spyOn(api, "deleteNode")

  renderWithExplorer(
    <>
      <SelectionProbe />
      <TreePanel />
    </>,
    { api }
  )
  await screen.findByRole("treeitem", { name: /^Asset library/ })

  return {
    api,
    deleteNode,
    tree: screen.getByRole("tree", { name: "Project files" }),
    user: userEvent.setup(),
  }
}

function activeRow() {
  const id = screen
    .getByRole("tree", { name: "Project files" })
    .getAttribute("aria-activedescendant")

  return id === null ? null : document.getElementById(id)
}

/** Focusing the tree makes its first row active. */
function focusTree(tree: HTMLElement) {
  act(() => tree.focus())
}

describe("DeleteNodeDialog", () => {
  it("keeps Delete disabled until a row is active", async () => {
    const { tree } = await renderPanel()
    const button = screen.getByRole("button", { name: "Delete" })

    expect(button).toBeDisabled()

    focusTree(tree)

    expect(button).toBeEnabled()
  })

  it.each([
    [
      /^Asset library/,
      "Delete Asset library?",
      "Deletes Asset library and the 9,413 files in it. This can't be undone.",
    ],
    [
      /^Drafts/,
      "Delete Drafts?",
      "Deletes Drafts, which has no files. This can't be undone.",
    ],
    [
      /^project-brief\.pdf/,
      "Delete project-brief.pdf?",
      "Deletes project-brief.pdf. This can't be undone.",
    ],
  ])("names %s and its files", async (row, title, description) => {
    const { user } = await renderPanel()

    await user.click(screen.getByRole("treeitem", { name: row }))
    await user.click(screen.getByRole("button", { name: "Delete" }))

    expect(
      await screen.findByRole("alertdialog", { name: title })
    ).toHaveAccessibleDescription(description)
  })

  it("opens from the Delete key, and Cancel leaves the tree unchanged", async () => {
    const { user, tree, deleteNode } = await renderPanel()

    focusTree(tree)
    await user.keyboard("{ArrowDown}{Delete}")

    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Brand system?",
    })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus()
    )

    await user.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(tree).toHaveFocus()
    expect(activeRow()).toHaveAccessibleName(/^Brand system/)
    expect(deleteNode).not.toHaveBeenCalled()
  })

  it("deletes a folder holding the selected file and activates the next row", async () => {
    const { user, tree, deleteNode } = await renderPanel()

    await user.click(screen.getByRole("treeitem", { name: /^Brand system/ }))
    await user.click(
      await screen.findByRole("treeitem", { name: /^brand-guidelines\.pdf/ })
    )
    expect(screen.getByTestId("selected")).toHaveTextContent(
      "file-brand-guidelines"
    )

    // Left moves from the file to its folder, which stays expanded.
    await user.keyboard("{ArrowLeft}{Delete}")
    await user.click(
      within(
        await screen.findByRole("alertdialog", { name: "Delete Brand system?" })
      ).getByRole("button", { name: "Delete" })
    )

    await waitFor(() =>
      expect(
        screen.queryByRole("treeitem", { name: /^Brand system/ })
      ).not.toBeInTheDocument()
    )
    expect(deleteNode).toHaveBeenCalledWith("folder-brand")
    expect(screen.queryByRole("treeitem", { name: /^Logos/ })).toBeNull()
    expect(screen.getByTestId("selected")).toHaveTextContent("none")
    // The subtree is skipped: Drafts follows Brand system at the top level.
    expect(activeRow()).toHaveAccessibleName(/^Drafts/)
    await waitFor(() => expect(tree).toHaveFocus())
  })

  it("activates the previous row after deleting the last one", async () => {
    const { user, tree } = await renderPanel()

    focusTree(tree)
    await user.keyboard("{End}{Delete}")
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Delete project-brief.pdf?",
        })
      ).getByRole("button", { name: "Delete" })
    )

    await waitFor(() => expect(activeRow()).toHaveAccessibleName(/^Research/))
    expect(
      screen.queryByRole("treeitem", { name: /^project-brief\.pdf/ })
    ).toBeNull()
    await waitFor(() => expect(tree).toHaveFocus())
  })

  it("shows an API error and keeps the dialog open with the tree unchanged", async () => {
    const { user, api } = await renderPanel()

    await user.click(
      screen.getByRole("treeitem", { name: /^project-brief\.pdf/ })
    )
    await user.click(screen.getByRole("button", { name: "Delete" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete project-brief.pdf?",
    })

    await api.deleteNode("file-project-brief")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "file-project-brief not found"
    )
    expect(dialog).toBeInTheDocument()
    // The modal hides the tree from role queries.
    expect(
      document.getElementById(treeRowId("file-project-brief"))
    ).toBeInTheDocument()
  })
})
