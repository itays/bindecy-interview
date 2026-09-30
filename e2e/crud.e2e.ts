import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

/** Opens the explorer with a short mock latency and "Brand system" expanded and active. */
async function openBrandSystem(page: Page) {
  const pageErrors: Error[] = []
  page.on("pageerror", (error) => pageErrors.push(error))
  // Previews point at external hosts; keep the run offline.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())

  await page.goto("/?seed=1&latency=50")

  const tree = page.getByRole("tree", { name: "Project files" })
  const brandSystem = tree.getByRole("treeitem", { name: /^Brand system/ })

  await brandSystem.click()
  await expect(brandSystem).toHaveAttribute("aria-expanded", "true")
  await expect(tree.getByRole("treeitem", { name: /^Logos/ })).toBeVisible()

  return { tree, brandSystem, pageErrors }
}

test("creates a folder and a file in sorted position with the counts updated", async ({
  page,
}) => {
  const { tree, brandSystem, pageErrors } = await openBrandSystem(page)

  await expect(brandSystem).toHaveAccessibleName("Brand system (3 files)")
  await expect(page.getByText("9,423 files", { exact: true })).toBeVisible()
  await expect(
    page.locator("p", { hasText: "Showing all 9,423 files." })
  ).toBeVisible()

  await page.getByRole("button", { name: "New folder" }).click()
  const folderDialog = page.getByRole("dialog", { name: "New folder" })
  await expect(folderDialog).toHaveAccessibleDescription(
    "Adds a folder to Brand system."
  )
  await folderDialog.getByLabel("Name").fill("Drafts")
  await folderDialog.getByRole("button", { name: "Create folder" }).click()
  await expect(folderDialog).toBeHidden()

  // Folders sort first, by name: Drafts, Logos, then brand-guidelines.pdf.
  const drafts = page.locator("#tree-row-folder-new-1")
  await expect(drafts).toHaveAccessibleName("Drafts (0 files)")
  await expect(drafts).toHaveAttribute("aria-posinset", "1")
  await expect(drafts).toHaveAttribute("aria-setsize", "3")
  await expect(page.locator("#tree-row-folder-logos")).toHaveAttribute(
    "aria-posinset",
    "2"
  )
  await expect(page.locator("#tree-row-file-brand-guidelines")).toHaveAttribute(
    "aria-posinset",
    "3"
  )

  // Focus is back on the tree, with the new folder active and in view.
  await expect(tree).toBeFocused()
  await expect(tree).toHaveAttribute(
    "aria-activedescendant",
    "tree-row-folder-new-1"
  )
  await expect(drafts).toBeInViewport()

  // The active folder is the new file's parent.
  await page.getByRole("button", { name: "New file" }).click()
  const fileDialog = page.getByRole("dialog", { name: "New file" })
  await expect(fileDialog).toHaveAccessibleDescription("Adds a file to Drafts.")
  await fileDialog.getByLabel("Name").fill("notes.pdf")
  await fileDialog.getByLabel("Size (MB)").fill("2")
  await fileDialog.getByRole("button", { name: "Create file" }).click()
  await expect(fileDialog).toBeHidden()

  const notes = page.locator("#tree-row-file-new-1")
  await expect(drafts).toHaveAttribute("aria-expanded", "true")
  await expect(notes).toHaveAccessibleName("notes.pdf 2 MB Document")
  await expect(notes).toHaveAttribute("aria-level", "3")
  await expect(notes).toHaveAttribute("aria-selected", "true")
  await expect(tree).toBeFocused()
  await expect(tree).toHaveAttribute(
    "aria-activedescendant",
    "tree-row-file-new-1"
  )
  await expect(notes).toBeInViewport()
  await expect(page.getByRole("heading", { name: "notes.pdf" })).toBeVisible()

  await expect(drafts).toHaveAccessibleName("Drafts (1 file)")
  await expect(brandSystem).toHaveAccessibleName("Brand system (4 files)")
  await expect(
    page.locator("p", { hasText: "Showing all 9,424 files." })
  ).toBeVisible()
  await expect(page.getByText("9,424 files", { exact: true })).toBeVisible()

  expect(pageErrors).toEqual([])
})

test("scrolls a new node below the fold into view", async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())
  await page.goto("/?seed=1&latency=50")

  const tree = page.getByRole("tree", { name: "Project files" })
  const assetLibrary = tree.getByRole("treeitem", { name: /^Asset library/ })
  await assetLibrary.click()
  await expect(
    tree.getByRole("treeitem", { name: /^Collection 001/ })
  ).toBeVisible()

  // Asset library lists 27 folders, so a file sorts after all of them.
  await page.getByRole("button", { name: "New file" }).click()
  const dialog = page.getByRole("dialog", { name: "New file" })
  await dialog.getByLabel("Name").fill("overview.pdf")
  await dialog.getByLabel("Size (MB)").fill("1")
  await dialog.getByRole("button", { name: "Create file" }).click()
  await expect(dialog).toBeHidden()

  const overview = page.locator("#tree-row-file-new-1")
  await expect(overview).toHaveAttribute("aria-posinset", "28")
  await expect(tree).toBeFocused()
  await expect(tree).toHaveAttribute(
    "aria-activedescendant",
    "tree-row-file-new-1"
  )
  await expect(overview).toBeInViewport()
  await expect(assetLibrary).not.toBeInViewport()
})

test("shows a duplicate name on the name field and keeps the dialog open", async ({
  page,
}) => {
  const { tree, pageErrors } = await openBrandSystem(page)

  await page.getByRole("button", { name: "New folder" }).click()
  const dialog = page.getByRole("dialog", { name: "New folder" })
  const name = dialog.getByLabel("Name")
  await name.fill("LOGOS")
  await name.press("Enter")

  await expect(name).toHaveAttribute("aria-invalid", "true")
  await expect(name).toHaveAccessibleDescription("LOGOS already exists")
  await expect(name).toBeFocused()
  await expect(dialog).toBeVisible()

  // Cancel leaves the tree as it was and returns focus to the button.
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("button", { name: "New folder" })).toBeFocused()
  await expect(tree.getByRole("treeitem", { name: /^logos/i })).toHaveCount(1)
  await expect(page.locator("#tree-row-folder-logos")).toHaveAttribute(
    "aria-setsize",
    "2"
  )

  expect(pageErrors).toEqual([])
})
