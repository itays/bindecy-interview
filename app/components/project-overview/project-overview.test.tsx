import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { ProjectOverview } from "./project-overview"

function renderOverview() {
  const user = userEvent.setup()
  render(<ProjectOverview />)
  return user
}

describe("ProjectOverview", () => {
  it("toggles folders while exposing their expanded state", async () => {
    const user = renderOverview()
    const brandFolder = screen.getByRole("treeitem", {
      name: /Brand system/i,
    })

    expect(brandFolder).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("treeitem", { name: /brand-guidelines\.pdf/i })
    ).toBeInTheDocument()

    await user.click(brandFolder)

    expect(brandFolder).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByRole("treeitem", { name: /brand-guidelines\.pdf/i })
    ).not.toBeInTheDocument()

    await user.click(brandFolder)

    expect(brandFolder).toHaveAttribute("aria-expanded", "true")

    const logosFolder = screen.getByRole("treeitem", { name: /Logos\s*2/i })
    const launchFolder = screen.getByRole("treeitem", {
      name: /Launch campaign/i,
    })
    await user.click(logosFolder)
    const archiveFolder = screen.getByRole("treeitem", {
      name: /Archive\s*1/i,
    })
    await user.click(archiveFolder)

    expect(archiveFolder).toHaveAttribute("aria-expanded", "true")
    expect(logosFolder).toHaveAttribute("aria-expanded", "true")

    await user.click(archiveFolder)
    await user.click(launchFolder)

    expect(archiveFolder).toHaveAttribute("aria-expanded", "false")
    expect(logosFolder).toHaveAttribute("aria-expanded", "true")
    expect(launchFolder).toHaveAttribute("aria-expanded", "false")
  })

  it("expands and collapses every folder with one control", async () => {
    const user = renderOverview()
    const expandAll = screen.getByRole("button", { name: "Expand all" })

    expect(
      screen.queryByRole("treeitem", { name: /Archive\s*1/i })
    ).not.toBeInTheDocument()

    await user.click(expandAll)

    expect(
      screen.getByRole("treeitem", { name: /Archive\s*1/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("treeitem", { name: /launch-film-final\.mp4/i })
    ).toBeInTheDocument()

    const collapseAll = screen.getByRole("button", { name: "Collapse all" })
    await user.click(collapseAll)

    expect(
      screen.queryByRole("treeitem", { name: /brand-guidelines\.pdf/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("treeitem", { name: /launch-film-final\.mp4/i })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Expand all" })
    ).toBeInTheDocument()
  })

  it("auto-expands a filtered path and restores manual expansion on reset", async () => {
    const user = renderOverview()
    const nameFilter = screen.getByLabelText("Name")
    const logosFolder = screen.getByRole("treeitem", { name: /Logos\s*2/i })

    expect(logosFolder).toHaveAttribute("aria-expanded", "false")

    await user.type(nameFilter, "wordmark-v2")

    expect(
      screen.getByRole("treeitem", { name: /Logos\s*1/i })
    ).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("treeitem", { name: /Archive\s*1/i })
    ).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("treeitem", { name: /wordmark-v2\.png/i })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Reset filters" }))

    expect(
      screen.getByRole("treeitem", { name: /Logos\s*2/i })
    ).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByRole("treeitem", { name: /Archive/i })
    ).not.toBeInTheDocument()
  })

  it("selects files and switches the preview without changing filters", async () => {
    const user = renderOverview()
    const projectBrief = screen.getByRole("treeitem", {
      name: /project-brief\.pdf/i,
    })
    const filmFolder = screen.getByRole("treeitem", { name: /Film\s*2/i })

    await user.click(projectBrief)

    expect(projectBrief).toHaveAttribute("aria-selected", "true")
    expect(
      screen.getByRole("heading", { level: 2, name: "project-brief.pdf" })
    ).toBeInTheDocument()

    await user.click(filmFolder)
    const launchScore = screen.getByRole("treeitem", {
      name: /launch-score\.mp3/i,
    })
    await user.click(launchScore)

    expect(projectBrief).toHaveAttribute("aria-selected", "false")
    expect(launchScore).toHaveAttribute("aria-selected", "true")
    expect(
      screen.getByRole("heading", { level: 2, name: "launch-score.mp3" })
    ).toBeInTheDocument()
    expect(
      screen.getByTitle("Launch campaign / Film / launch-score.mp3")
    ).toHaveTextContent("Launch campaign / Film / launch-score.mp3")
    expect(
      screen.getByLabelText("Audio preview of launch-score.mp3")
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("")
  })

  it("filters by category and resets to all file types", async () => {
    const user = renderOverview()
    const audioToggle = screen.getByRole("button", { name: "Audio files" })

    await user.click(audioToggle)

    expect(audioToggle).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("treeitem", { name: /launch-score\.mp3/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("treeitem", { name: /arden-interview\.mp3/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("treeitem", { name: /project-brief\.pdf/i })
    ).not.toBeInTheDocument()

    const imageToggle = screen.getByRole("button", { name: "Image files" })
    await user.click(imageToggle)

    expect(audioToggle).toHaveAttribute("aria-pressed", "true")
    expect(imageToggle).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("treeitem", { name: /hero-dusk\.jpg/i })
    ).toBeInTheDocument()

    const videoToggle = screen.getByRole("button", { name: "Video files" })
    await user.click(videoToggle)

    expect(videoToggle).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("treeitem", { name: /launch-film-final\.mp4/i })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Reset filters" }))

    expect(audioToggle).toHaveAttribute("aria-pressed", "false")
    expect(imageToggle).toHaveAttribute("aria-pressed", "false")
    expect(videoToggle).toHaveAttribute("aria-pressed", "false")
    expect(
      screen.getByRole("treeitem", { name: /project-brief\.pdf/i })
    ).toBeInTheDocument()
    expect(
      screen.getByText("Showing all 10 files.", { selector: "p" })
    ).toBeInTheDocument()
  })

  it("shows a no-results state for a query with no matches", async () => {
    const user = renderOverview()

    await user.type(screen.getByLabelText("Name"), "not-in-this-project")
    await user.tab()

    expect(screen.getByText("No matching files")).toBeInTheDocument()
    expect(
      screen.getByText("No matching files. Showing 0 of 10 files.", {
        selector: "p",
      })
    ).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(
      "No matching files. Showing 0 of 10 files."
    )
    expect(screen.queryByRole("tree")).not.toBeInTheDocument()
  })

  it("exposes invalid size feedback after leaving the field", async () => {
    const user = renderOverview()
    const minimumSize = screen.getByLabelText("Minimum size (MB)")

    await user.type(minimumSize, "-1")
    await user.tab()

    expect(minimumSize).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Size must be zero or greater."
    )
    expect(screen.getByText("Filters paused")).toBeInTheDocument()
  })

  it("clears the selection when filtering hides the selected file", async () => {
    const user = renderOverview()

    await user.click(
      screen.getByRole("treeitem", { name: /project-brief\.pdf/i })
    )
    expect(
      screen.getByRole("heading", { level: 2, name: "project-brief.pdf" })
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText("Name"), "hero-dusk")

    expect(
      await screen.findByText("Select a file to preview")
    ).toBeInTheDocument()
    const tree = screen.getByRole("tree", { name: "Project files" })
    expect(
      within(tree).getByRole("treeitem", { name: /hero-dusk\.jpg/i })
    ).toBeInTheDocument()
    expect(
      within(tree).queryByRole("treeitem", { name: /project-brief\.pdf/i })
    ).not.toBeInTheDocument()
  })

  it("supports keyboard tree navigation and activation", async () => {
    const user = renderOverview()
    const brandFolder = screen.getByRole("treeitem", {
      name: /Brand system/i,
    })
    const brandGuidelines = screen.getByRole("treeitem", {
      name: /brand-guidelines\.pdf/i,
    })
    const projectBrief = screen.getByRole("treeitem", {
      name: /project-brief\.pdf/i,
    })

    brandFolder.focus()
    await user.keyboard("{End} ")

    expect(projectBrief).toHaveFocus()
    expect(projectBrief).toHaveAttribute("aria-selected", "true")

    await user.keyboard("{Home}{ArrowDown}{Enter}")

    expect(brandGuidelines).toHaveFocus()
    expect(brandGuidelines).toHaveAttribute("aria-selected", "true")

    await user.keyboard("{ArrowLeft}")
    expect(brandFolder).toHaveFocus()

    await user.keyboard("{ArrowRight}")
    expect(brandGuidelines).toHaveFocus()

    await user.keyboard("{ArrowLeft}{ArrowLeft}")
    expect(brandFolder).toHaveFocus()
    expect(brandFolder).toHaveAttribute("aria-expanded", "false")
  })
})
