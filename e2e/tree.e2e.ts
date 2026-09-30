import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

const MOCK_URL = "/?seed=1&latency=50"

/** Blocks external requests, opens the explorer and waits for the top level. */
async function openExplorer(page: Page, url = MOCK_URL) {
  const pageErrors: Error[] = []
  page.on("pageerror", (error) => pageErrors.push(error))

  // Fixture previews point at external hosts.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())

  await page.goto(url)

  const tree = page.getByRole("tree", { name: "Project files" })
  const viewport = page
    .locator('[data-slot="scroll-area-viewport"]')
    .filter({ has: tree })

  return { tree, viewport, pageErrors }
}

/** Status rows use `status:<folderKey>` ids, which CSS `#id` can't express. */
function statusRow(page: Page, folderKey: string) {
  return page.locator(`[id="tree-row-status:${folderKey}"]`)
}

/**
 * Freezes the page clock so the mock's latency timers only fire on
 * `clock.runFor`, making transient loading rows observable. Needs
 * `page.clock.install()` before `page.goto`.
 */
async function pauseClock(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000))
}

test("expanding a folder shows its loading row, then the children", async ({
  page,
}) => {
  await page.clock.install()
  const { tree, pageErrors } = await openExplorer(page)
  const brandFolder = tree.getByRole("treeitem", { name: /^Brand system/ })

  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")
  await pauseClock(page)
  await brandFolder.click()

  const loadingRow = statusRow(page, "folder-brand")
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")
  await expect(loadingRow).toHaveRole("treeitem")
  await expect(loadingRow).toHaveText("Loading…")
  await expect(loadingRow).toHaveAttribute("aria-level", "2")
  await expect(tree.locator("#tree-row-folder-logos")).toHaveCount(0)

  await page.clock.runFor(100)

  await expect(loadingRow).toHaveCount(0)
  await expect(tree.locator("#tree-row-folder-logos")).toHaveAccessibleName(
    /^Logos/
  )
  await expect(
    tree.locator("#tree-row-file-brand-guidelines")
  ).toHaveAccessibleName("brand-guidelines.pdf 4.6 MB Document")

  expect(pageErrors).toEqual([])
})

test("folder and file rows expose their name, expansion and selection through ARIA", async ({
  page,
}) => {
  const { tree, pageErrors } = await openExplorer(page)
  const topLevel = tree.getByRole("treeitem")

  await expect(topLevel).toHaveCount(5)
  await expect(topLevel.nth(0)).toHaveAccessibleName(
    "Asset library (9,413 files)"
  )
  await expect(topLevel.nth(1)).toHaveAccessibleName("Brand system (3 files)")
  await expect(topLevel.nth(2)).toHaveAccessibleName(/^Launch campaign/)
  await expect(topLevel.nth(3)).toHaveAccessibleName(/^Research/)
  await expect(topLevel.nth(4)).toHaveAccessibleName(/^project-brief\.pdf/)

  const brandFolder = tree.locator("#tree-row-folder-brand")
  await expect(brandFolder).toHaveAttribute("aria-level", "1")
  await expect(brandFolder).toHaveAttribute("aria-posinset", "2")
  await expect(brandFolder).toHaveAttribute("aria-setsize", "5")
  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")
  await expect(brandFolder).not.toHaveAttribute("aria-selected")

  await brandFolder.click()

  const guidelines = tree.locator("#tree-row-file-brand-guidelines")
  await expect(guidelines).toHaveAccessibleName(
    "brand-guidelines.pdf 4.6 MB Document"
  )
  await expect(guidelines).toHaveAttribute("aria-level", "2")
  await expect(guidelines).toHaveAttribute("aria-selected", "false")
  await expect(guidelines).not.toHaveAttribute("aria-expanded")

  const logos = tree.locator("#tree-row-folder-logos")
  await expect(logos).toHaveAccessibleName("Logos (2 files)")
  await expect(logos).toHaveAttribute("aria-expanded", "false")
  await expect(logos).not.toHaveAttribute("aria-selected")

  await guidelines.click()
  await expect(guidelines).toHaveAttribute("aria-selected", "true")

  expect(pageErrors).toEqual([])
})

test("clicks toggle folders, select files and set aria-activedescendant", async ({
  page,
}) => {
  const { tree, pageErrors } = await openExplorer(page)
  const brandFolder = tree.getByRole("treeitem", { name: /^Brand system/ })

  await brandFolder.click()
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")
  await expect(tree).toHaveAttribute(
    "aria-activedescendant",
    "tree-row-folder-brand"
  )
  await expect(tree).toBeFocused()

  const guidelines = tree.getByRole("treeitem", {
    name: /^brand-guidelines\.pdf/,
  })
  await guidelines.click()
  await expect(guidelines).toHaveAttribute("aria-selected", "true")
  await expect(tree).toHaveAttribute(
    "aria-activedescendant",
    "tree-row-file-brand-guidelines"
  )
  await expect(
    page.getByRole("heading", { name: "brand-guidelines.pdf" })
  ).toBeVisible()
  await expect(
    page.getByText("Brand system / brand-guidelines.pdf")
  ).toBeVisible()

  const brief = tree.getByRole("treeitem", { name: /^project-brief\.pdf/ })
  await brief.click()
  await expect(brief).toHaveAttribute("aria-selected", "true")
  await expect(guidelines).toHaveAttribute("aria-selected", "false")
  await expect(
    page.getByRole("heading", { name: "project-brief.pdf" })
  ).toBeVisible()

  await brandFolder.click()
  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")
  await expect(guidelines).toHaveCount(0)
  await expect(tree).toHaveAttribute(
    "aria-activedescendant",
    "tree-row-folder-brand"
  )

  expect(pageErrors).toEqual([])
})

test("the keyboard moves the active row, expands, collapses and selects", async ({
  page,
}) => {
  await page.clock.install()
  const { tree, pageErrors } = await openExplorer(page)
  const active = (id: string) =>
    expect(tree).toHaveAttribute("aria-activedescendant", `tree-row-${id}`)
  const brandFolder = tree.locator("#tree-row-folder-brand")

  await expect(tree.getByRole("treeitem")).toHaveCount(5)
  await tree.focus()
  await active("folder-asset-library")

  await page.keyboard.press("ArrowDown")
  await active("folder-brand")

  await pauseClock(page)
  await page.keyboard.press("ArrowRight")
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")
  await active("folder-brand")

  // Right on an expanded folder moves to its first row: the loading row until
  // the page lands, then the page's first item.
  await page.keyboard.press("ArrowRight")
  await active("status:folder-brand")
  await expect(statusRow(page, "folder-brand")).toHaveText("Loading…")
  await page.clock.runFor(100)
  await active("folder-logos")
  await page.clock.resume()

  await page.keyboard.press("ArrowDown")
  await active("file-brand-guidelines")

  // Left from a nested file goes to its parent, then collapses it.
  await page.keyboard.press("ArrowLeft")
  await active("folder-brand")
  await page.keyboard.press("ArrowLeft")
  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")
  await active("folder-brand")

  await page.keyboard.press("Enter")
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")
  await page.keyboard.press("Space")
  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")
  await page.keyboard.press("Space")
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")

  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await active("file-brand-guidelines")
  const guidelines = tree.locator("#tree-row-file-brand-guidelines")
  await page.keyboard.press("Enter")
  await expect(guidelines).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("heading", { name: "brand-guidelines.pdf" })
  ).toBeVisible()

  await page.keyboard.press("End")
  await active("file-project-brief")
  const brief = tree.getByRole("treeitem", { name: /^project-brief\.pdf/ })
  await page.keyboard.press("Space")
  await expect(brief).toHaveAttribute("aria-selected", "true")
  await expect(guidelines).toHaveAttribute("aria-selected", "false")
  await expect(
    page.getByRole("heading", { name: "project-brief.pdf" })
  ).toBeVisible()

  await page.keyboard.press("ArrowUp")
  await expect(tree).not.toHaveAttribute(
    "aria-activedescendant",
    "tree-row-file-project-brief"
  )
  await page.keyboard.press("Home")
  await active("folder-asset-library")
  await page.keyboard.press("ArrowUp")
  await active("folder-asset-library")
  await expect(tree).toBeFocused()

  expect(pageErrors).toEqual([])
})

test("scrolling the 5,000-file folder loads pages and keeps the DOM bounded", async ({
  page,
}) => {
  await page.clock.install()
  const { tree, viewport, pageErrors } = await openExplorer(page)
  const scrollToBottom = () =>
    viewport.evaluate((element) => element.scrollTo(0, element.scrollHeight))

  await tree.getByRole("treeitem", { name: /^Asset library/ }).click()
  await expect(
    tree.getByRole("treeitem", { name: /^Collection 001/ })
  ).toBeVisible()

  // Stock footage sits below the 25 generated collections and Deep archive.
  const stockFootage = tree.locator("#tree-row-folder-stock-footage")
  await expect(async () => {
    await scrollToBottom()
    await expect(stockFootage).toBeVisible({ timeout: 250 })
  }).toPass({ intervals: [100] })
  await expect(stockFootage).toHaveAccessibleName("Stock footage (5,000 files)")
  await stockFootage.click()
  await expect(stockFootage).toHaveAttribute("aria-expanded", "true")

  await expect(tree.locator("#tree-row-file-g26")).toHaveAccessibleName(
    /^clip-00001\.mp4 /
  )
  const loadMore = statusRow(page, "folder-stock-footage")
  await expect(loadMore).toHaveCount(0)

  // Off-screen, the load-more row isn't rendered and requests nothing: after
  // two seconds of mock time, scrolling to it still shows the first page only.
  // Its request then lands right below the first page, in view, and pushes
  // the load-more row out of range.
  await pauseClock(page)
  await page.clock.runFor(2_000)
  await scrollToBottom()
  await expect(loadMore).toHaveText("Loading more… 100 of 5,000")
  await page.clock.runFor(100)
  await page.clock.resume()
  await expect(
    tree.getByRole("treeitem", { name: /^clip-00384\.mp4 / })
  ).toHaveAttribute("aria-posinset", "101")
  await expect(loadMore).toHaveCount(0)

  // Scroll to the end until at least 1,000 files have loaded (a busy machine
  // may land more than one page per scroll), then freeze the clock.
  const lastRenderedFile = () =>
    tree.evaluate((element) =>
      Math.max(
        ...Array.from(
          element.querySelectorAll('[role="treeitem"][aria-level="3"]'),
          (row) => Number(row.getAttribute("aria-posinset"))
        )
      )
    )
  await expect
    .poll(
      async () => {
        await scrollToBottom()
        return lastRenderedFile()
      },
      { intervals: [100], timeout: 20_000 }
    )
    .toBeGreaterThanOrEqual(1_000)
  await pauseClock(page)
  await scrollToBottom()
  await expect(loadMore).toHaveText(/^Loading more… \d,\d00 of 5,000$/)

  // File rows have a fixed height, so row 1,000's offset follows from any
  // rendered file row.
  await viewport.evaluate((element) => {
    const row = element.querySelector<HTMLElement>(
      '[role="treeitem"][aria-level="3"]'
    )!
    const top = new DOMMatrix(getComputedStyle(row).transform).m42
    const position = Number(row.getAttribute("aria-posinset"))
    element.scrollTo(0, top + (1_000 - position) * row.offsetHeight)
  })
  const row1000 = tree.locator("#tree-row-file-g3727")
  await expect(row1000).toHaveAccessibleName(/^clip-03702\.mp4 /)
  await expect(row1000).toHaveAttribute("aria-posinset", "1000")
  await expect(row1000).toHaveAttribute("aria-setsize", "5000")
  await expect(row1000).toBeInViewport()

  // Only the rows in range plus overscan render, and the active folder stays
  // mounted for `aria-activedescendant`.
  await expect
    .poll(() => tree.getByRole("treeitem").count())
    .toBeLessThanOrEqual(100)
  await expect(tree).toHaveAttribute(
    "aria-activedescendant",
    "tree-row-folder-stock-footage"
  )
  await expect(stockFootage).toBeAttached()
  await expect(tree.locator("#tree-row-file-g26")).toHaveCount(0)

  expect(pageErrors).toEqual([])
})

test("a failed root listing shows an error row whose Retry loads the folders", async ({
  page,
}) => {
  const { tree, pageErrors } = await openExplorer(
    page,
    `${MOCK_URL}&failFirst=1`
  )
  const errorRow = statusRow(page, "root")

  await expect(errorRow).toHaveRole("treeitem")
  await expect(errorRow).toContainText("Couldn't load project files")
  await expect(tree.getByRole("treeitem")).toHaveCount(1)

  const retry = errorRow.getByRole("button", { name: "Retry" })
  await expect(retry).toHaveAttribute("tabindex", "-1")

  await tree.focus()
  await expect(tree).toHaveAttribute(
    "aria-activedescendant",
    "tree-row-status:root"
  )
  await retry.click()

  await expect(errorRow).toHaveCount(0)
  await expect(tree.getByRole("treeitem")).toHaveCount(5)
  await expect(
    tree.getByRole("treeitem", { name: /^Asset library/ })
  ).toBeVisible()
  await expect(
    tree.getByRole("treeitem", { name: /^project-brief\.pdf/ })
  ).toBeVisible()
  await expect(tree).toBeFocused()

  expect(pageErrors).toEqual([])
})
