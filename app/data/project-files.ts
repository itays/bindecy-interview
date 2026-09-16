import type { ProjectNode } from "~/types/project-node"

export const projectFiles: ProjectNode[] = [
  {
    id: "folder-brand",
    name: "Brand system",
    type: "folder",
    children: [
      {
        id: "file-brand-guidelines",
        name: "brand-guidelines.pdf",
        type: "file",
        category: "doc",
        sizeInBytes: 4_823_040,
        previewUrl:
          "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      },
      {
        id: "folder-logos",
        name: "Logos",
        type: "folder",
        children: [
          {
            id: "file-primary-mark",
            name: "primary-mark.png",
            type: "file",
            category: "image",
            sizeInBytes: 1_572_864,
            previewUrl:
              "https://images.unsplash.com/photo-1561214115-f2f134cc4912?auto=format&fit=crop&w=1600&q=85",
          },
          {
            id: "folder-archive",
            name: "Archive",
            type: "folder",
            children: [
              {
                id: "file-wordmark-v2",
                name: "wordmark-v2.png",
                type: "file",
                category: "image",
                sizeInBytes: 786_432,
                previewUrl:
                  "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=1600&q=85",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "folder-launch-campaign",
    name: "Launch campaign",
    type: "folder",
    children: [
      {
        id: "folder-film",
        name: "Film",
        type: "folder",
        children: [
          {
            id: "file-launch-film",
            name: "launch-film-final.mp4",
            type: "file",
            category: "video",
            sizeInBytes: 18_874_368,
            previewUrl:
              "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
          },
          {
            id: "file-launch-score",
            name: "launch-score.mp3",
            type: "file",
            category: "audio",
            sizeInBytes: 3_145_728,
            previewUrl:
              "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
          },
        ],
      },
      {
        id: "folder-photography",
        name: "Photography selects",
        type: "folder",
        children: [
          {
            id: "file-hero-dusk",
            name: "hero-dusk.jpg",
            type: "file",
            category: "image",
            sizeInBytes: 6_291_456,
            previewUrl:
              "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=85",
          },
          {
            id: "file-product-detail",
            name: "product-detail.jpg",
            type: "file",
            category: "image",
            sizeInBytes: 5_242_880,
            previewUrl:
              "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1800&q=85",
          },
        ],
      },
    ],
  },
  {
    id: "folder-research",
    name: "Research",
    type: "folder",
    children: [
      {
        id: "folder-interviews",
        name: "Customer interviews",
        type: "folder",
        children: [
          {
            id: "file-interview-arden",
            name: "arden-interview.mp3",
            type: "file",
            category: "audio",
            sizeInBytes: 9_437_184,
            previewUrl:
              "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
          },
        ],
      },
      {
        id: "file-insights-report",
        name: "insights-report.pdf",
        type: "file",
        category: "doc",
        sizeInBytes: 2_097_152,
        previewUrl:
          "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      },
    ],
  },
  {
    id: "file-project-brief",
    name: "project-brief.pdf",
    type: "file",
    category: "doc",
    sizeInBytes: 524_288,
    previewUrl:
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  },
]
