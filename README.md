# Bindecy Technical Interview — Project Overview

This project is a technical interview submission for **Bindecy**. It implements a single-page project overview where users can browse a nested file tree, filter project assets, and inspect a selected file without leaving the page.

The interface uses local fixture data and is focused on recursive UI behavior, predictable filtering, accessible keyboard interaction, responsive layout, and category-aware file previews.

## Requirements

The assignment was to build a project-file browser with:

- A full-width filter panel at the top of the page.
- A two-column workspace with a recursive file tree on the left and a preview panel on the right.
- Nested folders that can be expanded and collapsed at any depth.
- File selection that opens the chosen asset in the preview panel.
- Filters for file or folder name, minimum size, maximum size, audio files, and image files.
- Responsive behavior that stacks the file tree above the preview on narrow screens.
- Accessible controls and tree navigation.

## Implemented behavior

- Name matching is case-insensitive and ignores surrounding whitespace.
- Size filters are entered in MB, use inclusive bounds, and may be left empty for an open-ended range.
- Invalid or negative sizes, and a minimum greater than the maximum, produce accessible validation feedback.
- Audio and image filters can be selected independently or together. With neither selected, all file categories are visible.
- Different filter dimensions use AND logic; selected categories use OR logic within the category filter.
- Matching files retain their ancestor folders so their location in the tree remains clear.
- Matching paths expand automatically while filtering, without overwriting the user's normal folder expansion state.
- If filtering hides the selected file, the selection and preview are cleared.
- Images, audio, video, and documents use category-specific previews with loading, error, and external-open fallbacks.
- The tree supports keyboard navigation with Arrow keys, Home, End, Enter, and Space.

This iteration intentionally uses local data. It does not include an API, uploads, persistence, authentication, or URL-synchronized state.

## Tech stack

- React 19
- React Router 7 in framework mode
- TypeScript
- Tailwind CSS v4
- shadcn/ui with Base UI
- Lucide icons
- Vite
- Bun

## Getting started

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Then open the local URL printed by React Router, typically `http://localhost:5173`.

## Available commands

```bash
bun run dev        # Start the development server
bun run typecheck  # Generate route types and run TypeScript checks
bun run build      # Create a production build
bun run start      # Serve the production build
bun run format     # Format TypeScript and TSX files with Prettier
```

## Project structure

```text
app/
  components/
    project-overview/   # Filters, recursive tree, preview, and tree utilities
    ui/                 # shadcn/ui primitives used by the feature
  data/
    project-files.ts    # Local nested fixture data
  routes/
    home.tsx            # Index route
  types/
    project-node.ts     # Folder, file, category, and filter types
  app.css               # Tailwind setup and semantic theme tokens
```

The page container owns filters, folder expansion, and file selection. Filtering, file counting, path lookup, and size formatting are kept in pure utilities so the recursive data behavior remains separate from presentation.

## Design and accessibility notes

- The layout uses a bounded file-tree column and a flexible preview column on larger screens.
- The file tree and preview can scroll independently.
- Folder and file rows expose tree semantics, expanded state, selection state, and visible focus styles.
- Filter controls have persistent labels, and result updates are announced through a polite live region.
- Styling uses the application's semantic light and dark theme tokens rather than component-specific color overrides.

The detailed implementation plan, assumptions, acceptance criteria, and test matrix are documented in [`plan.md`](./plan.md).
