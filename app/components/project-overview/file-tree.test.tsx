import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { ProjectNode } from "~/types/project-node"

import { FileTree } from "./file-tree"

const longFileName =
  "northstar-campaign-final-approved-production-export-with-a-long-name.pdf"

const recursiveNodes: ProjectNode[] = [
  {
    id: "empty-folder",
    name: "Empty folder",
    type: "folder",
    children: [],
  },
  {
    id: "level-one",
    name: "Level one",
    type: "folder",
    children: [
      {
        id: "level-two",
        name: "Level two",
        type: "folder",
        children: [
          {
            id: "long-file",
            name: longFileName,
            type: "file",
            category: "doc",
            sizeInBytes: 1,
            previewUrl: "https://example.com/file.pdf",
          },
        ],
      },
    ],
  },
]

describe("FileTree", () => {
  it("renders empty folders and deeply nested long names accessibly", () => {
    render(
      <FileTree
        nodes={recursiveNodes}
        expandedFolderIds={new Set(["level-one", "level-two"])}
        selectedFileId={null}
        onFolderToggle={vi.fn()}
        onFileSelect={vi.fn()}
      />
    )

    expect(
      screen.getByRole("treeitem", { name: /Empty folder/i })
    ).not.toHaveAttribute("aria-expanded")

    const longFile = screen.getByRole("treeitem", {
      name: new RegExp(longFileName),
    })
    expect(longFile).toHaveAttribute("aria-level", "3")
    expect(within(longFile).getByTitle(longFileName)).toHaveTextContent(
      longFileName
    )
  })

  it("shows an accessible empty state for an empty project", () => {
    render(
      <FileTree
        nodes={[]}
        expandedFolderIds={new Set()}
        selectedFileId={null}
        onFolderToggle={vi.fn()}
        onFileSelect={vi.fn()}
      />
    )

    expect(screen.getByText("No matching files")).toBeInTheDocument()
    expect(screen.queryByRole("tree")).not.toBeInTheDocument()
  })
})
