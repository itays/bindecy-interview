import {
  AudioLinesIcon,
  FileTextIcon,
  FolderOpenIcon,
  ImageIcon,
  VideoIcon,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { ScrollArea } from "~/components/ui/scroll-area"
import { cn } from "~/lib/utils"
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

type FileTreeProps = {
  nodes: ProjectNode[]
}

function FileRow({ node }: { node: FileNode }) {
  const category = categoryDetails[node.category]
  const CategoryIcon = category.icon

  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5">
      <CategoryIcon
        aria-hidden="true"
        className="size-4 text-muted-foreground"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium" title={node.name}>
          {node.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatFileSize(node.sizeInBytes)}
        </div>
      </div>
      <Badge variant="outline">{category.label}</Badge>
    </div>
  )
}

function FolderRow({ node }: { node: FolderNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5">
      <FolderOpenIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="truncate text-sm font-medium" title={node.name}>
        {node.name}
      </span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
        {countFiles(node.children)}
      </span>
    </div>
  )
}

function TreeBranch({
  nodes,
  nested = false,
}: {
  nodes: ProjectNode[]
  nested?: boolean
}) {
  return (
    <ul
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        nested && "ml-4 border-l pl-2"
      )}
    >
      {nodes.map((node) => (
        <li key={node.id} className="min-w-0">
          {node.type === "folder" ? (
            <>
              <FolderRow node={node} />
              <TreeBranch nodes={node.children} nested />
            </>
          ) : (
            <FileRow node={node} />
          )}
        </li>
      ))}
    </ul>
  )
}

export function FileTree({ nodes }: FileTreeProps) {
  return (
    <Card className="h-[32rem] min-w-0 md:h-full md:min-h-[30rem]">
      <CardHeader className="border-b">
        <CardTitle>Project files</CardTitle>
        <CardDescription>Creative assets and project documents</CardDescription>
        <CardAction>
          <Badge variant="secondary">{countFiles(nodes)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <nav aria-label="Project files" className="p-2">
            <TreeBranch nodes={nodes} />
          </nav>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
