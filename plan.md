# Plan: Project Overview with Recursive File Explorer

> Source: requirements supplied in the task
> Target: the existing React Router 7 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui application
> Output: `plan.md`

## Goal

Build a single-page project overview that lets a user filter a nested project tree, expand and collapse folders, select files, and inspect the selected asset in a preview pane.

## Current project context

- The index route is `app/routes/home.tsx` and currently contains only the starter screen.
- The project uses React Router framework mode without React Server Components.
- shadcn/ui is configured with the Base UI `base-nova` style, Lucide icons, and `~` import aliases.
- Tailwind CSS v4 and the semantic light/dark theme tokens are defined in `app/app.css`.
- Only the shadcn `Button` component is currently installed.
- No test runner is currently configured.

## Assumptions and clarified behavior

- Data is local fixture data for this iteration; there is no API, upload, persistence, or URL-synchronized state.
- The canonical internal model requires `type: "file"` on files, even though the example omits it. Fixture data will use the explicit discriminant. If future API data follows the abbreviated example, normalize it before rendering rather than weakening component types.
- File categories remain `audio | video | image | doc`. The category filter exposes only the requested `audio` and `image` choices. With neither selected, all categories remain visible; selecting one or both limits files to those categories.
- Name matching is a case-insensitive substring match.
- Minimum and maximum sizes are entered in MB for usability, converted to bytes for comparisons, and treated as inclusive bounds. Empty bounds are open-ended.
- All active filter dimensions combine with AND logic; multiple selected categories combine with OR logic within the category dimension.
- A folder remains in filtered results when it matches the name query or contains a matching descendant. A folder-name match keeps its descendants subject to active size/category filters. With a name-only query, a matching folder may show its complete subtree.
- While filters are active, ancestor folders of matching files are automatically shown expanded. Clearing filters restores the user's manually expanded/collapsed state.
- If the selected file is removed by filtering, clear the selection and return the preview to its empty state so the preview never represents a hidden tree item.
- Image, audio, video, and document nodes are all previewable even though only image/audio category filters are initially exposed.

## Architectural decisions

### Data model

Use a discriminated union so recursive rendering and preview behavior remain type-safe:

```ts
type FileCategory = "audio" | "video" | "image" | "doc"

type FolderNode = {
  id: string
  name: string
  type: "folder"
  children: ProjectNode[]
}

type FileNode = {
  id: string
  name: string
  type: "file"
  category: FileCategory
  sizeInBytes: number
  previewUrl: string
}

type ProjectNode = FolderNode | FileNode

type FileFilters = {
  query: string
  minSizeMb: string
  maxSizeMb: string
  categories: Array<"audio" | "image">
}
```

Keep filter inputs as strings so blank and partially entered numeric values remain representable. Parse and validate them before running the recursive filter.

### State ownership

The project overview container owns:

- Raw tree data.
- Current filter values.
- The set of manually expanded folder IDs.
- The selected `FileNode` or selected file ID.

Derived values should not be duplicated in state:

- Parsed byte bounds and validation state.
- Filtered tree.
- Match count.
- Ancestor IDs that must be expanded while filtering.
- Selected file path/breadcrumb, if displayed in the preview header.

Use memoization only around recursive derived work where it improves clarity; do not add a state-management package for this local interaction.

### Filtering algorithm

Implement filtering as a pure recursive utility:

1. Normalize the text query with `trim().toLocaleLowerCase()`.
2. Validate min/max as finite, non-negative MB values; mark `min > max` as invalid.
3. For a file, require it to pass name, inclusive size, and selected-category predicates.
4. For a folder, recursively filter its children and retain the folder when it has retained children or its own name matches.
5. Propagate a matching-folder-name flag so a name-only folder match can retain its descendants, while active size/category constraints still apply.
6. Return new filtered nodes instead of mutating fixture data.
7. Separately collect visible file IDs and ancestor folder IDs for selection cleanup and automatic expansion.

Add a byte-formatting helper using `Intl.NumberFormat` so tree and preview sizes are consistent.

### UI composition

Use the existing home route as the entry point and keep feature code in a focused feature directory. Suggested structure:

```text
app/
  components/
    project-overview/
      project-overview.tsx
      filter-toolbar.tsx
      file-tree.tsx
      tree-node.tsx
      file-preview.tsx
      file-tree-utils.ts
      file-tree-utils.test.ts
  data/
    project-files.ts
  types/
    project-node.ts
  routes/
    home.tsx
```

Responsibilities:

- `home.tsx`: route metadata and rendering the project overview feature.
- `project-overview.tsx`: state coordination and the page shell.
- `filter-toolbar.tsx`: accessible filter controls, validation, reset action, and result summary.
- `file-tree.tsx`: tree-level semantics, no-results state, and recursive node rendering.
- `tree-node.tsx`: one folder/file row, indentation, icon, expansion, selection, and recursive children.
- `file-preview.tsx`: empty, loading/error, and category-specific preview states.
- `file-tree-utils.ts`: pure filtering, ancestor lookup, visible-file collection, and size formatting.

### shadcn/ui usage

Install and compose shadcn components instead of recreating their behavior:

- Existing `Button` for reset/open actions and tree rows where appropriate.
- `Field` and `Input` for name/min/max controls and accessible validation text.
- `ToggleGroup` with `type="multiple"` for Audio and Image choices.
- `Card` with full header/content composition for the filter, tree, and preview surfaces.
- `ScrollArea` for independently scrollable tree and preview bodies.
- `Empty` for no selection, no matches, unsupported preview, and load-failure states.
- `Badge` for file category and formatted size metadata.
- `Separator` for semantic visual divisions where needed.

Use the project's Base UI APIs (including `render` rather than Radix-only `asChild` when a shadcn action renders as a link). Do not add `Resizable`; resizing was not requested and a CSS grid is sufficient.

### Layout and responsive behavior

Use a page-level CSS grid because the interface has both explicit rows and columns:

```text
Desktop / tablet
┌─────────────────────────────────────────────────────────────┐
│ Filters: name | minimum size | maximum size | audio | image │
├──────────────────────┬──────────────────────────────────────┤
│ Project files        │ Preview                              │
│ recursive tree       │ selected media/document + metadata   │
│ independently scroll │ independently scroll                 │
└──────────────────────┴──────────────────────────────────────┘

Narrow screens
┌──────────────────────┐
│ Filters (wrapped)    │
├──────────────────────┤
│ Project files        │
├──────────────────────┤
│ Preview              │
└──────────────────────┘
```

- The filter panel spans the full grid width.
- Use a bounded left track (roughly 18–22rem) and a `minmax(0, 1fr)` preview track so long names/URLs cannot force overflow.
- On narrow screens, stack the tree above the preview while preserving DOM/tab order.
- Use `min-h-dvh` rather than a fixed viewport height and allow each content panel to scroll with `overflow: auto`/`ScrollArea`.
- Give media intrinsic constraints (`max-inline-size`, `max-block-size`, and `object-contain`) and reserve a stable preview area to reduce layout shift.
- Use flex wrapping and `gap-*` for filter controls; do not use `space-x-*`/`space-y-*`.

### Theme and visual direction

Keep the interface as a compact project-inspection workspace rather than a decorative dashboard:

- Use only semantic classes backed by `app/app.css`, such as `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-accent`, and `ring-ring`.
- Do not introduce raw color utilities, gradients, manual dark-mode overrides, or a second token system.
- Preserve the configured Inter typography and Nova radius scale.
- Use icon shape and labels—not color alone—to distinguish folders, images, audio, video, and documents.
- Make the tree-to-preview relationship the visual signature: selected tree row, file path, file metadata, and preview header should clearly read as one inspection flow.

### Accessibility and interaction

- Give every filter a persistent text label; placeholders are hints, not labels.
- Numeric inputs use `inputMode="decimal"`, descriptive units, non-negative constraints, and `aria-invalid`/field error text for invalid ranges.
- Folder rows are real buttons with `aria-expanded`; file rows expose selected state with `aria-selected` or an equivalent announced state.
- Implement tree semantics (`role="tree"`, nested `role="group"`, and `role="treeitem"`) consistently. Support Enter/Space activation and standard arrow-key navigation: Up/Down between visible rows, Right to expand/enter a folder, Left to collapse/return to a parent, and Home/End to jump within the visible tree.
- Maintain a visible focus indicator using the theme's ring token.
- Keep row hit targets comfortably clickable and avoid icon-only controls unless they have accessible names.
- Selected and filtered states must not be conveyed by color alone.
- Use meaningful image alt text based on the file name. Native audio/video controls remain keyboard accessible.
- The document preview receives a title. External “Open file” actions use safe link attributes when opening another tab.
- Announce the filtered result count and “no matching files” state with an appropriate polite live region, without announcing every keystroke excessively.

### Preview behavior

- **No file selected:** show an `Empty` state directing the user to choose a file.
- **Image:** render a contained image with alt text, load state, and failure fallback.
- **Audio:** render native `<audio controls preload="metadata">` and file metadata.
- **Video:** render native `<video controls preload="metadata">` in a constrained aspect-ratio area.
- **Document:** render a titled `<iframe>`/browser document viewer when the URL is embeddable and always include an “Open file” fallback.
- **Unsupported or failed preview:** preserve file metadata and show a useful fallback action rather than a blank pane.
- Replacing the selected file updates the preview without changing folder expansion.

## Implementation phases

## Phase 1: Typed fixture and end-to-end page shell

**Requirements covered:** full-width top panel; two-column tree/preview layout; recursive schema foundation; theme adherence.

### What to build

Replace the starter home route with the project overview shell. Add the discriminated node types and realistic fixture data containing several folder depths and all four file categories. Compose themed filter, tree, and preview cards in the responsive grid. At this stage, the tree may render static nested content and the preview can show its empty state.

### Demo or verification

Open the index route and verify that the filter panel spans the page, the tree and preview form two columns on desktop, and the layout stacks without horizontal overflow on a narrow viewport.

### Acceptance criteria

- [ ] The application renders representative nested fixture data with unique IDs and explicit node types.
- [ ] The top panel spans both content columns.
- [ ] The left panel has a bounded width and the right panel consumes remaining space.
- [ ] The page stacks in logical DOM order on narrow screens.
- [ ] Styling uses only existing semantic theme tokens and the configured typography/radius.
- [ ] The project still passes type checking and production build.

---

## Phase 2: Recursive, accessible folder navigation

**Requirements covered:** recursively render several nesting levels; clicking a folder toggles it.

### What to build

Render folders and files recursively from the typed data. Track expanded folder IDs, show folder/file/category icons, indent by depth, and expose accessible tree semantics and keyboard interaction. Keep tree scrolling independent of the page shell.

### Demo or verification

Expand and collapse folders at multiple levels with mouse and keyboard. Navigate visible rows with arrow keys and confirm focus/expanded state is announced by a screen reader or accessibility inspector.

### Acceptance criteria

- [ ] Any depth supported by the data can render without hard-coded nesting limits.
- [ ] Folder activation toggles only that folder and preserves other folder states.
- [ ] File rows do not toggle folders.
- [ ] Long names truncate visually without breaking the grid and remain discoverable through an accessible label/title.
- [ ] Tree rows have visible hover, focus, expanded, and selected-ready states using semantic tokens.
- [ ] Up/Down/Left/Right/Home/End and Enter/Space behavior follows the documented tree interaction model.

---

## Phase 3: Filtering across the recursive tree

**Requirements covered:** filter by name, minimum size, maximum size, audio, and image; tree responds to top panel.

### What to build

Add controlled filter fields and the pure recursive filter utility. Preserve ancestor context for matching files, automatically reveal match paths, show a result count, validate numeric ranges, and provide a reset action. Add a themed no-results state.

### Demo or verification

Try name-only, min-only, max-only, single-category, multi-category, and combined filters against deeply nested files. Confirm matching files remain reachable through their folder ancestors and reset restores the complete tree and manual expansion state.

### Acceptance criteria

- [ ] Name filtering is trimmed, case-insensitive, and matches files and folders according to the documented semantics.
- [ ] Min/max comparisons are inclusive and correctly convert MB input to bytes.
- [ ] Blank size fields behave as open bounds.
- [ ] Negative, non-numeric, and min-greater-than-max input exposes an accessible validation state rather than silently producing misleading results.
- [ ] Audio and Image can be selected independently or together; no selection means all categories.
- [ ] Active dimensions combine predictably without mutating source data.
- [ ] Every visible matching file retains its ancestor path.
- [ ] No-results and result-count feedback is clear and accessible.

---

## Phase 4: File selection and category-aware preview

**Requirements covered:** clicking a file opens it in the right preview panel.

### What to build

Connect file activation to selected state and render the selected file's name, path, category, formatted size, and category-specific preview. Add empty, loading, unsupported, and failed-preview states plus an external open action.

### Demo or verification

Select one file from each category and verify that the appropriate browser-native preview appears. Filter out the selected file and confirm the selection clears. Test a broken URL and verify the fallback is usable.

### Acceptance criteria

- [ ] Clicking or keyboard-activating a file updates the preview and selected tree styling.
- [ ] Image, audio, video, and document categories use an appropriate preview strategy.
- [ ] Preview media remains contained and does not cause page overflow or layout shifts.
- [ ] File name, category, and formatted size remain visible even when the media cannot load.
- [ ] Broken/unsupported previews show a clear fallback and an open-file action.
- [ ] Filtering a selected file out of the tree clears the selection and preview.
- [ ] Selecting files does not reset folder expansion or filters.

---

## Phase 5: Automated coverage and final quality pass

**Requirements covered:** reliable recursive behavior, responsive layout, keyboard and visual quality.

### What to build

Add the smallest suitable test setup for the React Router/Vite project (Vitest, jsdom, and Testing Library). Cover the pure utilities heavily and use focused component tests for the key interaction flow. Finish with manual responsive and accessibility checks.

### Demo or verification

Run tests, type checking, formatting check, and production build. Exercise the page at desktop and mobile widths using keyboard-only navigation and browser accessibility tooling.

### Acceptance criteria

- [ ] Unit tests cover no filters, combined filters, inclusive bounds, folder-name matches, ancestor preservation, empty folders, invalid ranges, and deeply nested nodes.
- [ ] Component tests cover folder toggle, file selection, preview switching, category toggles, reset, no results, and selection cleanup after filtering.
- [ ] Tests verify important accessible names/states instead of implementation details or CSS classes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run build` passes.
- [ ] Formatting passes with the repository's Prettier configuration.
- [ ] There is no horizontal overflow at representative mobile, tablet, and desktop widths.
- [ ] Keyboard-only operation can filter, navigate the tree, select a file, and open the fallback link.
- [ ] Light and dark theme rendering remain readable without component-specific dark overrides.

## Test matrix

| Area | Cases |
| --- | --- |
| Recursive rendering | empty root, empty folder, one level, multiple levels, long names |
| Name filtering | case differences, surrounding whitespace, file match, folder match, no match |
| Size filtering | exact boundary, min only, max only, both bounds, zero-byte file, invalid values |
| Category filtering | none, audio, image, audio + image, doc/video visibility in default state |
| Expansion | independent folders, nested collapse, filter auto-expansion, clear-filter restoration |
| Selection | mouse, Enter/Space, switching files, selected file filtered out |
| Preview | image success/failure, audio, video, document embed/fallback, unsupported URL |
| Accessibility | labels, invalid fields, `aria-expanded`, selected state, tree keyboard navigation, focus visibility |
| Responsive layout | wide two-column, constrained tablet, stacked mobile, panel scrolling, long URLs/names |

## Completion checklist

- [ ] Install only the shadcn components used by the final composition and review generated files before use.
- [ ] Keep all styling aligned with `app/app.css`; do not replace or duplicate its theme variables.
- [ ] Keep recursive/filter logic pure and independent of presentation.
- [ ] Avoid adding a general state library, tree library, or resizable-panel dependency unless requirements expand.
- [ ] Use stable IDs as React keys; never use array indexes for tree nodes.
- [ ] Verify preview URLs used by fixtures permit the intended browser loading/embedding behavior.
- [ ] Verify no user-facing control or status depends on icon/color alone.
