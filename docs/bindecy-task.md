# File Explorer Project — Job Interview

## Frontend Engineering Challenge

**Duration:** 120 minutes

## Challenge Brief

### Project overview

Build a client-side React File Explorer that supports multi-level folder nesting and distinct file categories: Audio, Video, Images, and Documents.

### Application requirements

- Build a client-side React File Explorer with multi-level folder nesting.
- Support distinct categories: Audio, Video, Images, and Documents.
- Provide interactive file previews: selecting a file opens a preview panel.
- Provide search and filter controls for file name, size range, and categories.

### Target UI layout

```text
┌──────────────────────────────────────────────────────────┐
│ [🔍 Filter Name] [Min-Max Size] [☑ Audio ☑ Image ...]     │
├──────────────────────────┬───────────────────────────────┤
│ 📁 Project Files         │ Preview Panel                 │
│  ├── 📁 Media Assets     │ ┌───────────────────────────┐ │
│  │   ├── 🎵 melody.mp3   │ │ 📷 hero_banner.jpg        │ │
│  │   └── 📷 hero.jpg ◄───┼─┼─[ Active Media Preview ]  │ │
│  └── 📁 Docs             │ └───────────────────────────┘ │
│      └── 📄 spec.pdf     │                               │
└──────────────────────────┴───────────────────────────────┘
```

## Challenge Scope

1. **Recursive folder tree** — Render nested folders and files dynamically to *N* levels deep, with collapse and expand toggles.
2. **Categorized file display** — Display category-specific icons and attributes for audio, video, images, and documents.
3. **File preview panel** — Selecting a file opens a dedicated preview panel that renders the asset for its category.
4. **CRUD operations** — Let users add and delete folders and files dynamically.
5. **Multi-field filter controls** — Filter assets by name, file-size range, and selected categories.
6. **Performance at scale** — Render efficiently and discuss a scaling strategy for 10,000 or more items.

## Interview Rules

- **Environment:** Pure client-side React. Do not use Server Components.
- **Styling:** Choose any styling approach, including CSS Modules, Tailwind, styled-components, or inline styles.
- **Architecture:** Use a well-organized folder hierarchy, decoupled components, and clear separation of concerns.
- **Libraries:** Third-party form or state-management helper libraries are allowed when needed.

## Data Structure

### Schema attributes

- `id`: Unique node identifier.
- `type`: `'folder' | 'file'`.
- `children`: Array of child nodes.
- `category`: `'audio' | 'video' | 'image' | 'doc'`.
- `sizeInBytes`: File-size metric.
- `previewUrl`: Media URL for the asset preview.

### Mock data

```json
[
  {
    "id": "root_1",
    "name": "Project Files",
    "type": "folder",
    "children": [
      {
        "id": "sub_1",
        "name": "Media Assets",
        "type": "folder",
        "children": [
          {
            "id": "f1",
            "name": "synth.mp3",
            "category": "audio",
            "sizeInBytes": 450000,
            "previewUrl": "https://.../sample.mp3"
          },
          {
            "id": "f2",
            "name": "hero.jpg",
            "category": "image",
            "sizeInBytes": 1200000,
            "previewUrl": "https://.../hero.jpg"
          }
        ]
      },
      {
        "id": "f3",
        "name": "spec.pdf",
        "category": "doc",
        "sizeInBytes": 850000,
        "previewUrl": "https://.../spec.pdf"
      }
    ]
  }
]
```

## Interviewer clarification (addendum)

This section records a clarification received from the interviewer after the original brief; it is not part of the original brief.

- The primary evaluation focus is a large-scale tree with many thousands of items; don't assume the whole tree is loaded at once.
- Define a mocked data-access interface that behaves like a backend API (e.g. children of a folder, search, filtering, pagination).
- The frontend should request only the data needed for the current view.
- Evaluation pays attention to architecture, component boundaries, state management, rendering performance, and scalability decisions.
