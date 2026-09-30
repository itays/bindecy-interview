import type { FileCategory } from "~/features/file-explorer/domain/types"

import type { MockRecord } from "./generate-tree"

const PDF_URL =
  "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
const VIDEO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
const AUDIO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"
const PRIMARY_MARK_URL =
  "https://images.unsplash.com/photo-1561214115-f2f134cc4912?auto=format&fit=crop&w=1600&q=85"
const WORDMARK_URL =
  "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=1600&q=85"
const HERO_DUSK_URL =
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=85"
const PRODUCT_DETAIL_URL =
  "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1800&q=85"

/** Verified preview URLs, the only ones mock records may use. */
export const PREVIEW_URLS: Readonly<Record<FileCategory, readonly string[]>> = {
  audio: [AUDIO_URL],
  video: [VIDEO_URL],
  image: [PRIMARY_MARK_URL, WORDMARK_URL, HERO_DUSK_URL, PRODUCT_DETAIL_URL],
  doc: [PDF_URL],
}

/** The hand-written demo tree, flattened with parents before children. */
export const CURATED_RECORDS: readonly MockRecord[] = [
  { id: "folder-brand", parentId: null, name: "Brand system", type: "folder" },
  {
    id: "file-brand-guidelines",
    parentId: "folder-brand",
    name: "brand-guidelines.pdf",
    type: "file",
    category: "doc",
    sizeInBytes: 4_823_040,
    previewUrl: PDF_URL,
  },
  {
    id: "folder-logos",
    parentId: "folder-brand",
    name: "Logos",
    type: "folder",
  },
  {
    id: "file-primary-mark",
    parentId: "folder-logos",
    name: "primary-mark.png",
    type: "file",
    category: "image",
    sizeInBytes: 1_572_864,
    previewUrl: PRIMARY_MARK_URL,
  },
  {
    id: "folder-archive",
    parentId: "folder-logos",
    name: "Archive",
    type: "folder",
  },
  {
    id: "file-wordmark-v2",
    parentId: "folder-archive",
    name: "wordmark-v2.png",
    type: "file",
    category: "image",
    sizeInBytes: 786_432,
    previewUrl: WORDMARK_URL,
  },
  {
    id: "folder-launch-campaign",
    parentId: null,
    name: "Launch campaign",
    type: "folder",
  },
  {
    id: "folder-film",
    parentId: "folder-launch-campaign",
    name: "Film",
    type: "folder",
  },
  {
    id: "file-launch-film",
    parentId: "folder-film",
    name: "launch-film-final.mp4",
    type: "file",
    category: "video",
    sizeInBytes: 18_874_368,
    previewUrl: VIDEO_URL,
  },
  {
    id: "file-launch-score",
    parentId: "folder-film",
    name: "launch-score.mp3",
    type: "file",
    category: "audio",
    sizeInBytes: 3_145_728,
    previewUrl: AUDIO_URL,
  },
  {
    id: "folder-photography",
    parentId: "folder-launch-campaign",
    name: "Photography selects",
    type: "folder",
  },
  {
    id: "file-hero-dusk",
    parentId: "folder-photography",
    name: "hero-dusk.jpg",
    type: "file",
    category: "image",
    sizeInBytes: 6_291_456,
    previewUrl: HERO_DUSK_URL,
  },
  {
    id: "file-product-detail",
    parentId: "folder-photography",
    name: "product-detail.jpg",
    type: "file",
    category: "image",
    sizeInBytes: 5_242_880,
    previewUrl: PRODUCT_DETAIL_URL,
  },
  { id: "folder-research", parentId: null, name: "Research", type: "folder" },
  {
    id: "folder-interviews",
    parentId: "folder-research",
    name: "Customer interviews",
    type: "folder",
  },
  {
    id: "file-interview-arden",
    parentId: "folder-interviews",
    name: "arden-interview.mp3",
    type: "file",
    category: "audio",
    sizeInBytes: 9_437_184,
    previewUrl: AUDIO_URL,
  },
  {
    id: "file-insights-report",
    parentId: "folder-research",
    name: "insights-report.pdf",
    type: "file",
    category: "doc",
    sizeInBytes: 2_097_152,
    previewUrl: PDF_URL,
  },
  {
    id: "file-project-brief",
    parentId: null,
    name: "project-brief.pdf",
    type: "file",
    category: "doc",
    sizeInBytes: 524_288,
    previewUrl: PDF_URL,
  },
]
