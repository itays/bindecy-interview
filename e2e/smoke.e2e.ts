import { expect, test } from "@playwright/test"

test("@smoke renders the explorer and responds to folder and file interaction", async ({
  page,
}) => {
  const pageErrors: Error[] = []
  page.on("pageerror", (error) => pageErrors.push(error))

  // Keep the smoke deterministic: fixture previews point at external hosts.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())

  await page.goto("/")

  await expect(
    page.getByRole("heading", { name: "Project overview" })
  ).toBeVisible()

  const tree = page.getByRole("tree", { name: "Project files" })
  const brandFolder = tree.getByRole("treeitem", { name: /^Brand system/ })

  // SPA mode renders the tree only after the client bundle runs, so a visible
  // tree is already interactive. Folders start collapsed and load their
  // children on expand (250 ms mock latency).
  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")
  await brandFolder.click()
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")
  await brandFolder.click()
  await expect(brandFolder).toHaveAttribute("aria-expanded", "false")
  await brandFolder.click()
  await expect(brandFolder).toHaveAttribute("aria-expanded", "true")

  const brandGuidelines = tree.getByRole("treeitem", {
    name: /^brand-guidelines\.pdf/,
  })
  await brandGuidelines.click()

  await expect(brandGuidelines).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("heading", { name: "brand-guidelines.pdf" })
  ).toBeVisible()

  expect(pageErrors).toEqual([])
})
