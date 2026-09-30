import { cn } from "cn"
import {
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { memo, useEffect } from "react"
import type { CSSProperties, MouseEvent, ReactNode } from "react"
import { shallow } from "zustand/shallow"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { formatFileSize } from "~/features/file-explorer/domain/format"
import type {
  FileSummary,
  FolderSummary,
} from "~/features/file-explorer/domain/types"
import {
  useExplorer,
  useLoader,
} from "~/features/file-explorer/state/explorer-provider"
import {
  currentQueryKey,
  isFiltering,
} from "~/features/file-explorer/state/explorer-store"
import type { ExplorerState } from "~/features/file-explorer/state/explorer-store"
import { ROW_HEIGHT } from "~/features/file-explorer/state/visible-rows"
import type {
  ErrorRow,
  LoadMoreRow,
  LoadingRow,
  NodeRow,
  Row,
} from "~/features/file-explorer/state/visible-rows"
import { fileCategoryDetails } from "~/features/file-explorer/ui/file-category-details"

import { treeRowId } from "./tree-row-id"

const countFormatter = new Intl.NumberFormat("en")

export type TreeRowProps = {
  row: Row
  /** Positioning from the virtualizer; the row sets its own `height`. */
  style?: CSSProperties
  className?: string
  /** Called when the row is clicked (the container sets it active and acts on it). */
  onActivate?: (row: Row) => void
}

type RowShellProps = TreeRowProps & {
  height: number
  isActive: boolean
  "aria-expanded"?: boolean
  "aria-selected"?: boolean
  children: ReactNode
}

function isExpandedIn(state: ExplorerState, id: string): boolean {
  const expanded = isFiltering(state)
    ? state.filterExpanded[currentQueryKey(state)]
    : state.expanded

  return expanded?.has(id) ?? false
}

/** One segment per ancestor level; stacked rows join them into continuous guides. */
function IndentGuides({ depth }: { depth: number }) {
  return Array.from({ length: depth }, (_, level) => (
    <span
      key={level}
      aria-hidden="true"
      className="relative w-6 shrink-0 before:absolute before:inset-y-0 before:left-4 before:border-l before:border-border"
    />
  ))
}

/**
 * The `treeitem` element every row shares: id, ARIA position, exact height,
 * indentation and the active ring (the tree container owns real focus, so
 * rows aren't focusable).
 */
function RowShell({
  row,
  height,
  isActive,
  style,
  className,
  onActivate,
  children,
  ...aria
}: RowShellProps) {
  return (
    <div
      id={treeRowId(row.key)}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-posinset={row.kind === "node" ? row.posinset : undefined}
      aria-setsize={row.kind === "node" ? row.setsize : undefined}
      {...aria}
      data-active={isActive || undefined}
      style={{ ...style, height }}
      className={cn("group/tree-row flex min-w-0 px-1", className)}
      onClick={onActivate ? () => onActivate(row) : undefined}
    >
      <IndentGuides depth={row.depth} />
      <div
        className={cn(
          "my-px flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 select-none group-aria-expanded/tree-row:bg-muted/50 group-aria-selected/tree-row:bg-accent group-aria-selected/tree-row:text-accent-foreground group-aria-selected/tree-row:ring-1 group-aria-selected/tree-row:ring-ring group-data-active/tree-row:in-focus-visible:outline-2 group-data-active/tree-row:in-focus-visible:-outline-offset-2 group-data-active/tree-row:in-focus-visible:outline-ring",
          row.kind === "node" && "transition-colors hover:bg-muted"
        )}
      >
        {children}
      </div>
    </div>
  )
}

function NodeTreeRow({ row, ...props }: TreeRowProps & { row: NodeRow }) {
  const state = useExplorer((explorer) => {
    const node = explorer.nodesById.get(row.id)

    if (!node) {
      throw new Error(`Row node ${row.id} is missing from nodesById`)
    }

    return {
      node,
      isExpanded: node.type === "folder" && isExpandedIn(explorer, row.id),
      isSelected: explorer.selectedId === row.id,
      isActive: explorer.activeId === row.key,
      isFiltering: isFiltering(explorer),
    }
  })
  const { node, isExpanded, isSelected, isActive } = state

  return node.type === "folder" ? (
    <RowShell
      row={row}
      height={ROW_HEIGHT.folder}
      isActive={isActive}
      aria-expanded={node.childCount > 0 ? isExpanded : undefined}
      {...props}
    >
      <FolderContent
        node={node}
        isExpanded={isExpanded}
        isFiltering={state.isFiltering}
      />
    </RowShell>
  ) : (
    <RowShell
      row={row}
      height={ROW_HEIGHT.file}
      isActive={isActive}
      aria-selected={isSelected}
      {...props}
    >
      <FileContent node={node} />
    </RowShell>
  )
}

function FolderContent({
  node,
  isExpanded,
  isFiltering,
}: {
  node: FolderSummary
  isExpanded: boolean
  isFiltering: boolean
}) {
  const FolderStateIcon = isExpanded ? FolderOpenIcon : FolderIcon
  // `matchCount` belongs to the applied query; without it there's no count to show.
  const count = isFiltering ? node.matchCount : node.fileCount
  const countLabel = isFiltering ? "matching file" : "file"

  return (
    <>
      <ChevronRightIcon
        aria-hidden="true"
        className={
          node.childCount > 0
            ? "size-3.5 shrink-0 text-muted-foreground transition-transform group-aria-expanded/tree-row:rotate-90 motion-reduce:transition-none"
            : "invisible size-3.5 shrink-0"
        }
      />
      <FolderStateIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span
        className="min-w-0 flex-1 truncate text-sm font-medium"
        title={node.name}
      >
        {node.name}
      </span>
      {count === undefined ? null : (
        <>
          <span
            aria-hidden="true"
            className="shrink-0 text-xs text-muted-foreground tabular-nums"
          >
            {countFormatter.format(count)}
          </span>{" "}
          <span className="sr-only">
            {`(${countFormatter.format(count)} ${countLabel}${count === 1 ? "" : "s"})`}
          </span>
        </>
      )}
    </>
  )
}

function FileContent({ node }: { node: FileSummary }) {
  const category = fileCategoryDetails[node.category]
  const CategoryIcon = category.icon

  return (
    <>
      <CategoryIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={node.name}>
          {node.name}
        </span>{" "}
        <span className="block text-xs text-muted-foreground">
          {formatFileSize(node.sizeInBytes)}
        </span>
      </span>{" "}
      <CheckIcon
        aria-hidden="true"
        className="hidden size-3.5 shrink-0 group-aria-selected/tree-row:block"
      />
      <Badge className="shrink-0" variant="outline">
        {category.label}
      </Badge>
    </>
  )
}

function useIsActive(key: string): boolean {
  return useExplorer((state) => state.activeId === key)
}

function Spinner() {
  return (
    <LoaderCircleIcon
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
    />
  )
}

function LoadingTreeRow({ row, ...props }: TreeRowProps & { row: LoadingRow }) {
  const isActive = useIsActive(row.key)

  return (
    <RowShell
      row={row}
      height={ROW_HEIGHT.status}
      isActive={isActive}
      {...props}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner />
        Loading…
      </span>
    </RowShell>
  )
}

/**
 * Requests the next page whenever the row enters the rendered range, and
 * again after each page lands while it stays there; the loader dedupes.
 */
function LoadMoreTreeRow({
  row,
  ...props
}: TreeRowProps & { row: LoadMoreRow }) {
  const isActive = useIsActive(row.key)
  const loader = useLoader()
  const { folderId, loaded, total } = row

  useEffect(() => {
    void loader.loadMore(folderId)
  }, [loader, folderId, loaded])

  return (
    <RowShell
      row={row}
      height={ROW_HEIGHT.status}
      isActive={isActive}
      {...props}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
        <Spinner />
        {`Loading more… ${countFormatter.format(loaded)} of ${countFormatter.format(total)}`}
      </span>
    </RowShell>
  )
}

function keepContainerFocus(event: MouseEvent) {
  event.preventDefault()
}

function ErrorTreeRow({ row, ...props }: TreeRowProps & { row: ErrorRow }) {
  const isActive = useIsActive(row.key)
  const loader = useLoader()
  const { folderId } = row
  const folderName = useExplorer((state) =>
    folderId === null ? null : (state.nodesById.get(folderId)?.name ?? null)
  )
  const label =
    folderId === null
      ? "Couldn't load project files"
      : `Couldn't load ${folderName ?? "this folder"}`

  return (
    <RowShell
      row={row}
      height={ROW_HEIGHT.status}
      isActive={isActive}
      {...props}
    >
      <TriangleAlertIcon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-destructive"
      />
      <span
        className="min-w-0 flex-1 truncate text-xs text-destructive"
        title={row.message}
      >
        {label}
      </span>{" "}
      {/* Not a tab stop: the tree owns focus and Enter on this row retries. */}
      <Button
        type="button"
        variant="outline"
        size="xs"
        tabIndex={-1}
        onMouseDown={keepContainerFocus}
        onClick={() => void loader.retry(folderId)}
      >
        Retry
      </Button>
    </RowShell>
  )
}

function TreeRowView({ row, ...props }: TreeRowProps) {
  switch (row.kind) {
    case "node":
      return <NodeTreeRow row={row} {...props} />
    case "loading":
      return <LoadingTreeRow row={row} {...props} />
    case "load-more":
      return <LoadMoreTreeRow row={row} {...props} />
    case "error":
      return <ErrorTreeRow row={row} {...props} />
  }
}

/**
 * `flattenVisibleRows` builds new row objects on each run, and the
 * virtualizer builds a new `style` per render, so both compare by value.
 */
function arePropsEqual(prev: TreeRowProps, next: TreeRowProps): boolean {
  return (
    shallow(prev.row, next.row) &&
    shallow(prev.style, next.style) &&
    prev.className === next.className &&
    prev.onActivate === next.onActivate
  )
}

/**
 * One row of the flat tree: a folder, a file, or a listing's status row.
 * Each row subscribes to its own expanded, selected and active state.
 */
export const TreeRow = memo(TreeRowView, arePropsEqual)
