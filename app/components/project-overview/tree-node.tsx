import type { KeyboardEvent } from "react"
import {
  AudioLinesIcon,
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
  VideoIcon,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import type {
  FileCategory,
  FileNode,
  FolderNode,
  ProjectNode,
} from "~/types/project-node"

import { countFiles, formatFileSize } from "./file-tree-utils"

const categoryDetails: Record<
  FileCategory,
  { label: string; icon: typeof ImageIcon }
> = {
  audio: { label: "Audio", icon: AudioLinesIcon },
  video: { label: "Video", icon: VideoIcon },
  image: { label: "Image", icon: ImageIcon },
  doc: { label: "Document", icon: FileTextIcon },
}

type TreeNodeProps = {
  node: ProjectNode
  level: number
  parentId?: string
  expandedFolderIds: ReadonlySet<string>
  activeNodeId: string
  onActiveNodeChange: (nodeId: string) => void
  onFolderToggle: (folderId: string) => void
}

type TreeBranchProps = Omit<TreeNodeProps, "node" | "parentId"> & {
  nodes: ProjectNode[]
  parentId?: string
  nested?: boolean
}

function getVisibleTreeItems(target: HTMLElement) {
  const tree = target.closest('[role="tree"]')

  if (!tree) {
    return []
  }

  return Array.from(
    tree.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')
  )
}

function focusTreeItem(
  item: HTMLButtonElement | undefined,
  onActiveNodeChange: (nodeId: string) => void
) {
  if (!item) {
    return
  }

  const nodeId = item.dataset.nodeId

  if (nodeId) {
    onActiveNodeChange(nodeId)
  }

  item.focus()
}

function handleTreeItemKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  node: ProjectNode,
  expanded: boolean,
  onActiveNodeChange: (nodeId: string) => void,
  onFolderToggle: (folderId: string) => void
) {
  const items = getVisibleTreeItems(event.currentTarget)
  const currentIndex = items.indexOf(event.currentTarget)
  let nextItem: HTMLButtonElement | undefined

  switch (event.key) {
    case "ArrowDown":
      nextItem = items[currentIndex + 1]
      break
    case "ArrowUp":
      nextItem = items[currentIndex - 1]
      break
    case "Home":
      nextItem = items[0]
      break
    case "End":
      nextItem = items.at(-1)
      break
    case "ArrowRight":
      event.preventDefault()

      if (node.type !== "folder") {
        return
      }

      if (node.children.length === 0) {
        return
      }

      if (!expanded) {
        onFolderToggle(node.id)
        return
      }

      nextItem = items[currentIndex + 1]
      break
    case "ArrowLeft": {
      if (node.type === "folder" && expanded) {
        event.preventDefault()
        onFolderToggle(node.id)
        return
      }

      const parentId = event.currentTarget.dataset.parentId
      nextItem = items.find((item) => item.dataset.nodeId === parentId)
      break
    }
    default:
      return
  }

  event.preventDefault()
  focusTreeItem(nextItem, onActiveNodeChange)
}

function FileRow({
  node,
  level,
  parentId,
  activeNodeId,
  onActiveNodeChange,
  onFolderToggle,
}: Pick<
  TreeNodeProps,
  | "level"
  | "parentId"
  | "activeNodeId"
  | "onActiveNodeChange"
  | "onFolderToggle"
> & { node: FileNode }) {
  const category = categoryDetails[node.category]
  const CategoryIcon = category.icon

  return (
    <Button
      type="button"
      role="treeitem"
      aria-level={level}
      aria-selected="false"
      tabIndex={activeNodeId === node.id ? 0 : -1}
      data-node-id={node.id}
      data-parent-id={parentId}
      variant="ghost"
      className="group/file-row h-auto w-full min-w-0 justify-start gap-2 px-2 py-1.5 text-left whitespace-normal aria-selected:bg-accent aria-selected:text-accent-foreground aria-selected:ring-1 aria-selected:ring-ring"
      onFocus={() => onActiveNodeChange(node.id)}
      onKeyDown={(event) =>
        handleTreeItemKeyDown(
          event,
          node,
          false,
          onActiveNodeChange,
          onFolderToggle
        )
      }
    >
      <CategoryIcon
        aria-hidden="true"
        className="size-4 text-muted-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={node.name}>
          {node.name}
        </span>
        <span className="block text-xs text-muted-foreground">
          {formatFileSize(node.sizeInBytes)}
        </span>
      </span>
      <CheckIcon
        aria-hidden="true"
        className="hidden size-3.5 group-aria-selected/file-row:block"
      />
      <Badge className="shrink-0" variant="outline">
        {category.label}
      </Badge>
    </Button>
  )
}

function FolderRow({
  node,
  level,
  parentId,
  expanded,
  activeNodeId,
  onActiveNodeChange,
  onFolderToggle,
}: Pick<
  TreeNodeProps,
  | "level"
  | "parentId"
  | "activeNodeId"
  | "onActiveNodeChange"
  | "onFolderToggle"
> & {
  node: FolderNode
  expanded: boolean
}) {
  const hasChildren = node.children.length > 0
  const FolderStateIcon = expanded ? FolderOpenIcon : FolderIcon

  return (
    <Button
      type="button"
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-level={level}
      tabIndex={activeNodeId === node.id ? 0 : -1}
      data-node-id={node.id}
      data-parent-id={parentId}
      variant="ghost"
      className="group/tree-row h-auto w-full min-w-0 justify-start gap-2 px-2 py-1.5 text-left whitespace-normal aria-expanded:bg-muted/50"
      onClick={hasChildren ? () => onFolderToggle(node.id) : undefined}
      onFocus={() => onActiveNodeChange(node.id)}
      onKeyDown={(event) =>
        handleTreeItemKeyDown(
          event,
          node,
          expanded,
          onActiveNodeChange,
          onFolderToggle
        )
      }
    >
      <ChevronRightIcon
        aria-hidden="true"
        className={
          hasChildren
            ? "size-3.5 text-muted-foreground transition-transform group-aria-expanded/tree-row:rotate-90 motion-reduce:transition-none"
            : "invisible size-3.5"
        }
      />
      <FolderStateIcon
        aria-hidden="true"
        className="size-4 text-muted-foreground"
      />
      <span
        className="min-w-0 flex-1 truncate text-sm font-medium"
        title={node.name}
      >
        {node.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {countFiles(node.children)}
      </span>
    </Button>
  )
}

export function TreeNode({
  node,
  level,
  parentId,
  expandedFolderIds,
  activeNodeId,
  onActiveNodeChange,
  onFolderToggle,
}: TreeNodeProps) {
  if (node.type === "file") {
    return (
      <li role="none" className="min-w-0">
        <FileRow
          node={node}
          level={level}
          parentId={parentId}
          activeNodeId={activeNodeId}
          onActiveNodeChange={onActiveNodeChange}
          onFolderToggle={onFolderToggle}
        />
      </li>
    )
  }

  const expanded = node.children.length > 0 && expandedFolderIds.has(node.id)

  return (
    <li role="none" className="min-w-0">
      <FolderRow
        node={node}
        level={level}
        parentId={parentId}
        expanded={expanded}
        activeNodeId={activeNodeId}
        onActiveNodeChange={onActiveNodeChange}
        onFolderToggle={onFolderToggle}
      />
      {expanded ? (
        <TreeBranch
          nodes={node.children}
          level={level + 1}
          parentId={node.id}
          nested
          expandedFolderIds={expandedFolderIds}
          activeNodeId={activeNodeId}
          onActiveNodeChange={onActiveNodeChange}
          onFolderToggle={onFolderToggle}
        />
      ) : null}
    </li>
  )
}

export function TreeBranch({
  nodes,
  level,
  parentId,
  nested = false,
  expandedFolderIds,
  activeNodeId,
  onActiveNodeChange,
  onFolderToggle,
}: TreeBranchProps) {
  return (
    <ul
      role={nested ? "group" : "none"}
      className={
        nested
          ? "ml-4 flex min-w-0 flex-col gap-0.5 border-l pl-2"
          : "flex min-w-0 flex-col gap-0.5"
      }
    >
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          level={level}
          parentId={parentId}
          expandedFolderIds={expandedFolderIds}
          activeNodeId={activeNodeId}
          onActiveNodeChange={onActiveNodeChange}
          onFolderToggle={onFolderToggle}
        />
      ))}
    </ul>
  )
}
