/**
 * Regenerates the README screenshots in docs/images/.
 *
 *   bun scripts/capture-screenshots.ts <baseURL>
 *
 * <baseURL> serves the app, e.g. `bun run start` (http://localhost:4173) or
 * the production URL. Preview media load from their real hosts, so the
 * machine needs network access.
 */
import { mkdir } from "node:fs/promises"
import { chromium, expect, type Browser, type Page } from "@playwright/test"

const OUT_DIR = new URL("../docs/images/", import.meta.url)
const APP_PARAMS = "?seed=1&latency=0"

type Shot = {
  file: string
  viewport: { width: number; height: number }
  arrange: (page: Page) => Promise<void>
}

const SHOTS: Shot[] = [
  {
    file: "explorer-desktop.png",
    viewport: { width: 1440, height: 900 },
    async arrange(page) {
      await expandFolder(page, "Launch campaign")
      await expandFolder(page, "Photography selects")
      await selectFile(page, "hero-dusk.jpg")
    },
  },
  {
    file: "filter-active.png",
    viewport: { width: 1440, height: 900 },
    async arrange(page) {
      await page.locator("#file-name").fill("interview")
      await page.locator("#file-name").press("Enter")
      await expect(page.locator("form p")).toHaveText(
        /^Showing [\d,]+ of [\d,]+ files\.$/
      )
      await selectFile(page, "arden-interview.mp3")
    },
  },
  {
    file: "mobile.png",
    viewport: { width: 390, height: 844 },
    async arrange(page) {
      await expandFolder(page, "Brand system")
      await expandFolder(page, "Logos")
      await selectFile(page, "primary-mark.png")
      // Frame the tree card with the top of the preview stacked below it.
      await page
        .locator('[data-slot="card"]')
        .filter({ has: tree(page) })
        .evaluate((card) => {
          window.scrollTo(0, card.getBoundingClientRect().top + scrollY - 16)
        })
    },
  },
]

function tree(page: Page) {
  return page.getByRole("tree", { name: "Project files" })
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function expandFolder(page: Page, name: string) {
  const folder = tree(page).getByRole("treeitem", {
    name: new RegExp(`^${escapeRegExp(name)} \\(`),
  })
  await folder.click()
  await expect(folder).toHaveAttribute("aria-expanded", "true")
}

/** Selects the file and waits until its preview media has loaded. */
async function selectFile(page: Page, name: string) {
  const file = tree(page).getByRole("treeitem", {
    name: new RegExp(`^${escapeRegExp(name)} `),
  })
  await file.click()
  await expect(file).toHaveAttribute("aria-selected", "true")

  const preview = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name, exact: true }),
  })
  await expect(preview.getByRole("status")).toHaveCount(0, { timeout: 30_000 })
  await expect(preview.getByText(/preview unavailable$/)).toHaveCount(0)
}

async function capture(browser: Browser, baseURL: string, shot: Shot) {
  const page = await browser.newPage({
    viewport: shot.viewport,
    colorScheme: "light",
    reducedMotion: "reduce",
  })
  try {
    await page.goto(new URL(`/${APP_PARAMS}`, baseURL).href)
    await expect(tree(page).getByRole("treeitem").first()).toBeVisible()
    await shot.arrange(page)
    await page.evaluate(() => document.fonts.ready)
    // Keep hover styles and the text caret out of the image.
    await page.mouse.move(0, 0)
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())

    const path = new URL(shot.file, OUT_DIR)
    const png = await page.screenshot({ path: path.pathname })
    console.log(`${shot.file}: ${Math.round(png.byteLength / 1024)} KB`)
  } finally {
    await page.close()
  }
}

const baseURL = process.argv[2]
if (!baseURL) {
  console.error("Usage: bun scripts/capture-screenshots.ts <baseURL>")
  process.exit(1)
}

await mkdir(OUT_DIR, { recursive: true })
const browser = await chromium.launch()
try {
  for (const shot of SHOTS) await capture(browser, baseURL, shot)
} finally {
  await browser.close()
}
