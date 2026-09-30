import { expect, test, type Page } from "@playwright/test"

const IMAGE_URL = /^https:\/\/images\.unsplash\.com\//
const AUDIO_URL = /^https:\/\/interactive-examples\.mdn\.mozilla\.net\/.+\.mp3$/
const VIDEO_URL = /^https:\/\/interactive-examples\.mdn\.mozilla\.net\/.+\.mp4$/
const DOCUMENT_URL = /^https:\/\/www\.w3\.org\/.+\.pdf$/

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
)

/** A tenth of a second of 8-bit mono silence; Chromium plays it in `<audio>` and `<video>`. */
function silentWav(): Buffer {
  const sampleRate = 8_000
  const samples = sampleRate / 10
  const wav = Buffer.alloc(44 + samples, 0x80)
  wav.write("RIFF", 0, "ascii")
  wav.writeUInt32LE(36 + samples, 4)
  wav.write("WAVEfmt ", 8, "ascii")
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate, 28)
  wav.writeUInt16LE(1, 32)
  wav.writeUInt16LE(8, 34)
  wav.write("data", 36, "ascii")
  wav.writeUInt32LE(samples, 40)
  return wav
}

/** Aborts every external request, then serves tiny valid stand-ins for the fixture's media. */
async function stubMedia(page: Page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort())
  await page.route(IMAGE_URL, (route) =>
    route.fulfill({ contentType: "image/png", body: PNG_1X1 })
  )
  const wav = silentWav()
  for (const url of [AUDIO_URL, VIDEO_URL]) {
    await page.route(url, (route) =>
      route.fulfill({ contentType: "audio/wav", body: wav })
    )
  }
  await page.route(DOCUMENT_URL, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Stub document</title><p>Stub document</p>",
    })
  )
}

function trackPageErrors(page: Page): Error[] {
  const pageErrors: Error[] = []
  page.on("pageerror", (error) => pageErrors.push(error))
  return pageErrors
}

function previewCard(page: Page) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: /^Preview$/ }),
  })
}

function projectTree(page: Page) {
  return page.getByRole("tree", { name: "Project files" })
}

async function expandFolder(page: Page, name: RegExp) {
  const folder = projectTree(page).getByRole("treeitem", { name })
  await expect(folder).toHaveAttribute("aria-expanded", "false")
  await folder.click()
  await expect(folder).toHaveAttribute("aria-expanded", "true")
}

async function selectFile(page: Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const file = projectTree(page).getByRole("treeitem", {
    name: new RegExp(`^${escaped} `),
  })
  await file.click()
  await expect(file).toHaveAttribute("aria-selected", "true")
}

/** Checks the header: the file's name, path, category badge, and `category · size` line. */
async function expectPreviewHeader(
  page: Page,
  file: { name: string; path: string; category: string; size: string }
) {
  const preview = previewCard(page)
  await expect(
    preview.getByRole("heading", { name: file.name, exact: true })
  ).toBeVisible()
  await expect(preview.locator('[data-slot="card-description"]')).toHaveText(
    file.path
  )
  await expect(preview.locator('[data-slot="badge"]')).toHaveText(file.category)
  await expect(
    preview.getByText(file.size, { exact: true }).locator("..")
  ).toHaveText(`${file.category}·${file.size}`)
}

test("each file category renders its preview element with the file's name, size and category", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page)
  await stubMedia(page)
  await page.goto("/")
  const preview = previewCard(page)

  await expandFolder(page, /^Brand system/)
  await expandFolder(page, /^Logos/)
  await selectFile(page, "primary-mark.png")
  await expectPreviewHeader(page, {
    name: "primary-mark.png",
    path: "Brand system / Logos / primary-mark.png",
    category: "Image",
    size: "1.5 MB",
  })
  const image = preview.getByRole("img", {
    name: "Preview of primary-mark.png",
  })
  await expect(image).toHaveAttribute("src", IMAGE_URL)
  await expect(preview.getByText("Loading image…")).toHaveCount(0)
  await expect(image).toHaveCSS("opacity", "1")

  await expandFolder(page, /^Launch campaign/)
  await expandFolder(page, /^Film/)
  await selectFile(page, "launch-score.mp3")
  await expectPreviewHeader(page, {
    name: "launch-score.mp3",
    path: "Launch campaign / Film / launch-score.mp3",
    category: "Audio",
    size: "3 MB",
  })
  const audio = preview.getByLabel("Audio preview of launch-score.mp3")
  await expect(audio).toBeVisible()
  await expect(audio).toHaveJSProperty("tagName", "AUDIO")
  await expect(audio.locator("source")).toHaveAttribute("src", AUDIO_URL)
  await expect(preview.getByText("Loading audio controls…")).toHaveCount(0)

  await selectFile(page, "launch-film-final.mp4")
  await expectPreviewHeader(page, {
    name: "launch-film-final.mp4",
    path: "Launch campaign / Film / launch-film-final.mp4",
    category: "Video",
    size: "18 MB",
  })
  const video = preview.getByLabel("Video preview of launch-film-final.mp4")
  await expect(video).toHaveJSProperty("tagName", "VIDEO")
  await expect(video.locator("source")).toHaveAttribute("src", VIDEO_URL)
  await expect(preview.getByText("Loading video…")).toHaveCount(0)
  await expect(video).toHaveCSS("opacity", "1")

  await selectFile(page, "project-brief.pdf")
  await expectPreviewHeader(page, {
    name: "project-brief.pdf",
    path: "project-brief.pdf",
    category: "Document",
    size: "512 KB",
  })
  const document = preview.getByTitle("Preview of project-brief.pdf")
  await expect(document).toHaveJSProperty("tagName", "IFRAME")
  await expect(document).toHaveAttribute("src", DOCUMENT_URL)
  await expect(preview.getByText("Loading document…")).toHaveCount(0)
  await expect(document).toHaveCSS("opacity", "1")
  await expect(
    preview.getByRole("link", { name: "Open file" })
  ).toHaveAttribute("href", DOCUMENT_URL)

  expect(pageErrors).toEqual([])
})

test("a media URL that fails to load shows the fallback with an Open file link", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page)
  await stubMedia(page)
  for (const url of [IMAGE_URL, AUDIO_URL, VIDEO_URL]) {
    await page.route(url, (route) =>
      route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "Not found",
      })
    )
  }
  await page.goto("/")
  const preview = previewCard(page)

  await expandFolder(page, /^Brand system/)
  await expandFolder(page, /^Logos/)
  await expandFolder(page, /^Launch campaign/)
  await expandFolder(page, /^Film/)

  for (const file of [
    {
      name: "primary-mark.png",
      title: "Image preview unavailable",
      description:
        "The image could not be loaded here. You can still try opening the original file.",
      url: IMAGE_URL,
      media: preview.getByRole("img"),
    },
    {
      name: "launch-score.mp3",
      title: "Audio preview unavailable",
      description:
        "The recording could not be loaded here. You can still try opening the original file.",
      url: AUDIO_URL,
      media: preview.locator("audio"),
    },
    {
      name: "launch-film-final.mp4",
      title: "Video preview unavailable",
      description:
        "The video could not be loaded here. You can still try opening the original file.",
      url: VIDEO_URL,
      media: preview.locator("video"),
    },
  ]) {
    await selectFile(page, file.name)
    await expect(
      preview.getByRole("heading", { name: file.name, exact: true })
    ).toBeVisible()

    const fallback = preview
      .locator('[data-slot="empty"]')
      .filter({ hasText: file.title })
    await expect(fallback).toBeVisible()
    await expect(fallback).toContainText(file.description)
    const openFile = fallback.getByRole("link", { name: "Open file" })
    await expect(openFile).toHaveAttribute("href", file.url)
    await expect(openFile).toHaveAttribute("target", "_blank")
    await expect(openFile).toHaveAttribute("rel", "noopener noreferrer")
    await expect(file.media).toHaveCount(0)
  }

  expect(pageErrors).toEqual([])
})

test("switching the selected file keeps the folder expansion", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page)
  await stubMedia(page)
  await page.goto("/")
  const tree = projectTree(page)
  const preview = previewCard(page)

  await expandFolder(page, /^Brand system/)
  await expandFolder(page, /^Launch campaign/)
  await expandFolder(page, /^Film/)

  const expandedFolders = [/^Brand system/, /^Launch campaign/, /^Film/].map(
    (name) => tree.getByRole("treeitem", { name })
  )
  const collapsedFolders = [/^Logos/, /^Photography selects/, /^Research/].map(
    (name) => tree.getByRole("treeitem", { name })
  )

  for (const name of [
    "launch-film-final.mp4",
    "brand-guidelines.pdf",
    "launch-score.mp3",
  ]) {
    await selectFile(page, name)
    await expect(preview.getByRole("heading", { name })).toBeVisible()
    await expect(tree.locator('[aria-selected="true"]')).toHaveCount(1)
    for (const folder of expandedFolders) {
      await expect(folder).toHaveAttribute("aria-expanded", "true")
    }
    for (const folder of collapsedFolders) {
      await expect(folder).toHaveAttribute("aria-expanded", "false")
    }
  }

  expect(pageErrors).toEqual([])
})

test("the preview shows a loading state while the file detail request is pending", async ({
  page,
}) => {
  const pageErrors = trackPageErrors(page)
  await stubMedia(page)
  await page.goto("/?latency=1500")
  const preview = previewCard(page)

  await expect(
    preview.getByText("Select a file to preview", { exact: true })
  ).toBeVisible()

  await selectFile(page, "project-brief.pdf")

  const loading = preview.getByRole("status").filter({
    hasText: "Loading file details…",
  })
  await expect(loading).toBeVisible()
  await expect(preview.locator('[data-slot="badge"]')).toHaveText("Loading")
  await expect(
    preview.getByRole("heading", { name: "project-brief.pdf" })
  ).toHaveCount(0)

  await expect(
    preview.getByRole("heading", { name: "project-brief.pdf" })
  ).toBeVisible()
  await expect(loading).toHaveCount(0)
  await expect(preview.locator('[data-slot="badge"]')).toHaveText("Document")
  await expect(
    preview.getByTitle("Preview of project-brief.pdf")
  ).toHaveAttribute("src", DOCUMENT_URL)

  expect(pageErrors).toEqual([])
})
