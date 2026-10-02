import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

// `latency=0` resolves mock requests on a microtask, so the only timer left
// in a filter flow is the toolbar's 250 ms debounce.
const ZERO_LATENCY = "/?latency=0"

async function openExplorer(page: Page, url = ZERO_LATENCY) {
  const pageErrors: Error[] = []
  page.on("pageerror", (error) => pageErrors.push(error))

  // Fixture previews point at external hosts.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())

  await page.goto(url)

  const tree = page.getByRole("tree", { name: "Project files" })
  // The toolbar is the page's only form; its visible line and its live
  // region both carry the result text.
  const form = page.locator("form")
  const statusLine = form.locator("p")
  const statusRegion = form.getByRole("status")

  await expect(statusLine).toHaveText("Showing all 9,423 files.")
  await expect(tree.getByRole("treeitem")).toHaveCount(5)

  return {
    pageErrors,
    tree,
    statusLine,
    statusRegion,
    nameInput: page.locator("#file-name"),
    minimumSize: page.locator("#minimum-size"),
    maximumSize: page.locator("#maximum-size"),
    resetButton: page.getByRole("button", { name: "Reset filters" }),
    toolbarBadge: cardBadge(page, "Filter files"),
    treeBadge: cardBadge(page, "Project files"),
  }
}

/**
 * Pauses a clock set up with `page.clock.install()` before `goto`; an
 * installed clock keeps ticking until paused. Due timers fire on the jump.
 */
async function freezeClock(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
}

/** The count badge in the header of the card titled `title`. */
function cardBadge(page: Page, title: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({
      has: page.locator('[data-slot="card-title"]', {
        hasText: new RegExp(`^${title}$`),
      }),
    })
    .locator('[data-slot="card-action"] [data-slot="badge"]')
}

test("typing a name updates the counts and leaves the folders collapsed", async ({
  page,
}) => {
  const { pageErrors, tree, statusLine, statusRegion, nameInput, ...ui } =
    await openExplorer(page)

  await expect(ui.toolbarBadge).toHaveText("9,423 of 9,423 files")
  await expect(ui.treeBadge).toHaveText("9,423 files")

  await nameInput.fill("wordmark")

  await expect(statusLine).toHaveText("Showing 1 of 9,423 files.")
  await expect(statusRegion).toHaveText("Showing 1 of 9,423 files.")
  await expect(ui.toolbarBadge).toHaveText("1 of 9,423 files")
  await expect(ui.treeBadge).toHaveText("1 matching file")

  // Nothing opens by itself; the counts lead down to the hit.
  const brandFolder = tree.getByRole("treeitem", {
    name: /^Brand system \(1 matching file\)/,
  })
  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")
  await expect(tree.getByRole("treeitem")).toHaveCount(1)

  await brandFolder.click()
  await tree
    .getByRole("treeitem", { name: /^Logos \(1 matching file\)/ })
    .click()
  await tree
    .getByRole("treeitem", { name: /^Archive \(1 matching file\)/ })
    .click()

  await expect(
    tree.getByRole("treeitem", { name: /^wordmark-v2\.png/ })
  ).toBeVisible()
  await expect(tree.getByRole("treeitem")).toHaveCount(4)

  await nameInput.fill("zzz-no-such-file")

  await expect(statusLine).toHaveText(
    "No matching files. Showing 0 of 9,423 files."
  )
  await expect(ui.toolbarBadge).toHaveText("0 of 9,423 files")
  await expect(tree).toHaveCount(0)
  await expect(
    page.getByText("No matching files", { exact: true })
  ).toBeVisible()

  expect(pageErrors).toEqual([])
})

test("file-type toggles combine with each other and with the name", async ({
  page,
}) => {
  const { pageErrors, tree, statusLine, nameInput } = await openExplorer(page)
  const audio = page.getByRole("button", { name: "Audio files" })
  const image = page.getByRole("button", { name: "Image files" })
  const video = page.getByRole("button", { name: "Video files" })
  const launchFolder = tree.getByRole("treeitem", { name: /^Launch campaign/ })

  await launchFolder.click()
  await expect(launchFolder).toHaveAttribute("aria-expanded", "true")
  await expect(audio).toHaveAttribute("aria-pressed", "false")

  await audio.click()
  await expect(audio).toHaveAttribute("aria-pressed", "true")
  await expect(statusLine).toHaveText("Showing 1,492 of 9,423 files.")

  // The type filter keeps Launch campaign open and opens nothing else.
  await expect(launchFolder).toHaveAttribute("aria-expanded", "true")
  await expect(
    tree.getByRole("treeitem", { name: /^Film \(1 matching file\)/ })
  ).toHaveAttribute("aria-expanded", "false")
  await expect(
    tree.getByRole("treeitem", { name: /^Research \(1 matching file\)/ })
  ).toHaveAttribute("aria-expanded", "false")
  await expect(tree.getByRole("treeitem")).toHaveCount(4)

  // Toggles are a union: audio + image = 1,492 + 2,136.
  await image.click()
  await expect(image).toHaveAttribute("aria-pressed", "true")
  await expect(statusLine).toHaveText("Showing 3,628 of 9,423 files.")

  await audio.click()
  await expect(audio).toHaveAttribute("aria-pressed", "false")
  await expect(statusLine).toHaveText("Showing 2,136 of 9,423 files.")

  await audio.click()
  await video.click()
  await expect(statusLine).toHaveText("Showing 8,552 of 9,423 files.")

  // The name narrows the type filter: of the four "launch" files only the
  // score is audio.
  await image.click()
  await video.click()
  await expect(statusLine).toHaveText("Showing 1,492 of 9,423 files.")
  await nameInput.fill("launch")

  await expect(statusLine).toHaveText("Showing 1 of 9,423 files.")
  await expect(tree.getByRole("treeitem")).toHaveCount(2)

  await tree.getByRole("treeitem", { name: /^Film/ }).click()

  await expect(
    tree.getByRole("treeitem", { name: /^launch-score\.mp3/ })
  ).toBeVisible()
  await expect(
    tree.getByRole("treeitem", { name: /^launch-film-final\.mp4/ })
  ).toHaveCount(0)
  await expect(tree.getByRole("treeitem")).toHaveCount(3)

  expect(pageErrors).toEqual([])
})

test("an invalid size range shows the field error and leaves the tree unchanged", async ({
  page,
}) => {
  // A paused clock proves the debounced invalid draft fires and is dropped.
  await page.clock.install()
  const {
    pageErrors,
    tree,
    statusLine,
    statusRegion,
    minimumSize,
    maximumSize,
    ...ui
  } = await openExplorer(page)
  const brandFolder = tree.getByRole("treeitem", { name: /^Brand system/ })

  await brandFolder.click()
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")
  await expect(tree.getByRole("treeitem")).toHaveCount(7)
  await freezeClock(page)

  await minimumSize.fill("10")
  await maximumSize.fill("5")

  // The error waits for the field to be left.
  await expect(statusLine).toHaveText(
    "Fix the size filters to update the file results."
  )
  await expect(ui.toolbarBadge).toHaveText("Filters paused")
  await expect(maximumSize).not.toHaveAttribute("aria-invalid")

  await maximumSize.blur()

  await expect(maximumSize).toHaveAttribute("aria-invalid", "true")
  await expect(maximumSize).toHaveAccessibleDescription(
    "Maximum size must be greater than or equal to minimum size."
  )
  await expect(statusRegion).toHaveText(
    "Fix the size filters to update the file results."
  )

  await page.clock.runFor(250)

  await expect(ui.treeBadge).toHaveText("9,423 files")
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")
  await expect(tree.getByRole("treeitem")).toHaveCount(7)
  await expect(
    tree.getByRole("treeitem", { name: /^Asset library \(9,413 files\)/ })
  ).toBeVisible()

  // Fixing the range applies it.
  await maximumSize.fill("20")
  await page.clock.runFor(250)

  await expect(maximumSize).not.toHaveAttribute("aria-invalid")
  await expect(statusLine).toHaveText(/^Showing [\d,]+ of 9,423 files\.$/)
  await expect(statusLine).not.toHaveText("Showing all 9,423 files.")

  expect(pageErrors).toEqual([])
})

test("filters keep the expanded folders, and Reset keeps changes made while filtering", async ({
  page,
}) => {
  const { pageErrors, tree, statusLine, nameInput, resetButton } =
    await openExplorer(page)
  const brandFolder = tree.getByRole("treeitem", { name: /^Brand system/ })
  const launchFolder = tree.getByRole("treeitem", { name: /^Launch campaign/ })

  await expect(resetButton).toBeDisabled()

  await brandFolder.click()
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")

  await nameInput.fill("launch")

  await expect(statusLine).toHaveText("Showing 4 of 9,423 files.")
  await expect(launchFolder).toHaveAttribute("aria-expanded", "false")
  await expect(brandFolder).toHaveCount(0)
  await expect(resetButton).toBeEnabled()

  await launchFolder.click()
  await expect(launchFolder).toHaveAttribute("aria-expanded", "true")

  await resetButton.click()

  await expect(statusLine).toHaveText("Showing all 9,423 files.")
  await expect(nameInput).toHaveValue("")
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")
  await expect(launchFolder).toHaveAttribute("aria-expanded", "true")
  await expect(
    tree.getByRole("treeitem", { name: /^brand-guidelines\.pdf/ })
  ).toBeVisible()
  await expect(
    tree.getByRole("treeitem", { name: /^Photography selects/ })
  ).toBeVisible()
  await expect(tree.getByRole("treeitem")).toHaveCount(9)
  await expect(resetButton).toBeDisabled()

  expect(pageErrors).toEqual([])
})

test("a selected file that stops matching is deselected and announced", async ({
  page,
}) => {
  const { pageErrors, tree, statusLine, nameInput, resetButton } =
    await openExplorer(page)
  const projectBrief = tree.getByRole("treeitem", {
    name: /^project-brief\.pdf/,
  })
  const notice = page.getByText(
    "project-brief.pdf doesn't match the filters and was deselected.",
    { exact: true }
  )

  await projectBrief.click()
  await expect(projectBrief).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("heading", { name: "project-brief.pdf" })
  ).toBeVisible()

  await nameInput.fill("guidelines")

  await expect(statusLine).toHaveText("Showing 1 of 9,423 files.")
  await expect(page.getByText("Select a file to preview")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "project-brief.pdf" })
  ).toHaveCount(0)
  await expect(notice).toBeAttached()
  await expect(notice.locator("xpath=..")).toHaveAttribute(
    "aria-live",
    "polite"
  )

  // Clearing the filters doesn't bring the selection back.
  await resetButton.click()
  await expect(projectBrief).toHaveAttribute("aria-selected", "false")
  await expect(page.getByText("Select a file to preview")).toBeVisible()

  expect(pageErrors).toEqual([])
})

test("a selected file that keeps matching through its folder stays selected", async ({
  page,
}) => {
  const { pageErrors, tree, statusLine, nameInput } = await openExplorer(page)
  const guidelines = tree.getByRole("treeitem", {
    name: /^brand-guidelines\.pdf/,
  })
  const heading = page.getByRole("heading", { name: "brand-guidelines.pdf" })
  const notice = page.getByText(
    "brand-guidelines.pdf doesn't match the filters and was deselected.",
    { exact: true }
  )

  await tree.getByRole("treeitem", { name: /^Brand system/ }).click()
  await guidelines.click()
  await expect(guidelines).toHaveAttribute("aria-selected", "true")
  await expect(heading).toBeVisible()
  await expect(
    page.getByText("Brand system / brand-guidelines.pdf")
  ).toBeVisible()

  // "system" matches only the "Brand system" folder, not the file name.
  await nameInput.fill("system")

  await expect(statusLine).toHaveText("Showing 3 of 9,423 files.")
  await expect(guidelines).toHaveAttribute("aria-selected", "true")
  await expect(heading).toBeVisible()
  await expect(notice).toHaveCount(0)

  await nameInput.fill("logos")

  await expect(statusLine).toHaveText("Showing 2 of 9,423 files.")
  await expect(heading).toHaveCount(0)
  await expect(page.getByText("Select a file to preview")).toBeVisible()
  await expect(notice).toBeAttached()

  expect(pageErrors).toEqual([])
})

test("typing applies after the 250 ms debounce and Enter applies at once", async ({
  page,
}) => {
  // Once paused, timers only run on `clock.runFor`, so the debounce can't
  // fire by itself.
  await page.clock.install()
  const { pageErrors, tree, statusLine, statusRegion, nameInput } =
    await openExplorer(page)
  await freezeClock(page)

  await nameInput.fill("guidelines")

  await page.clock.runFor(249)
  await expect(statusLine).toHaveText("Showing all 9,423 files.")
  await expect(tree.getByRole("treeitem")).toHaveCount(5)

  await page.clock.runFor(1)
  await expect(statusLine).toHaveText("Showing 1 of 9,423 files.")
  await expect(statusRegion).toHaveText("Showing 1 of 9,423 files.")
  const brandFolder = tree.getByRole("treeitem", { name: /^Brand system/ })
  await expect(brandFolder).toHaveAccessibleName(
    /^Brand system \(1 matching file\)/
  )
  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")

  await nameInput.fill("brand")
  // Still the previous query: the new draft waits for the debounce.
  await expect(statusLine).toHaveText("Showing 1 of 9,423 files.")
  await expect(tree.getByRole("treeitem")).toHaveCount(1)

  await nameInput.press("Enter")

  await expect(statusLine).toHaveText("Showing 3 of 9,423 files.")
  await expect(statusRegion).toHaveText("Showing 3 of 9,423 files.")
  await expect(brandFolder).toHaveAccessibleName(
    /^Brand system \(3 matching files\)/
  )
  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")

  expect(pageErrors).toEqual([])
})
