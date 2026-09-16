import { useMemo, useState } from "react"

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
import type { ProjectNode } from "~/types/project-node"

import { countFiles } from "./file-tree-utils"
import { TreeBranch } from "./tree-node"

type FileTreeProps = {
  nodes: ProjectNode[]
  expandedFolderIds: ReadonlySet<string>
  onFolderToggle: (folderId: string) => void
}

function collectVisibleNodeIds(
  nodes: ProjectNode[],
  expandedFolderIds: ReadonlySet<string>
): string[] {
  const visibleNodeIds: string[] = []

  for (const node of nodes) {
    visibleNodeIds.push(node.id)

    if (node.type === "folder" && expandedFolderIds.has(node.id)) {
      visibleNodeIds.push(
        ...collectVisibleNodeIds(node.children, expandedFolderIds)
      )
    }
  }

  return visibleNodeIds
}

export function FileTree({
  nodes,
  expandedFolderIds,
  onFolderToggle,
}: FileTreeProps) {
  const [activeNodeId, setActiveNodeId] = useState(() => nodes[0]?.id ?? "")
  const visibleNodeIds = useMemo(
    () => collectVisibleNodeIds(nodes, expandedFolderIds),
    [nodes, expandedFolderIds]
  )
  const visibleActiveNodeId = visibleNodeIds.includes(activeNodeId)
    ? activeNodeId
    : (visibleNodeIds[0] ?? "")

  return (
    <Card className="h-[32rem] min-w-0 md:h-full md:min-h-[30rem]">
      <CardHeader className="border-b">
        <CardTitle>Project files</CardTitle>
        <CardDescription>
          Use arrow keys to move through folders and files
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">{countFiles(nodes)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <div role="tree" aria-label="Project files" className="p-2">
            <TreeBranch
              nodes={nodes}
              level={1}
              expandedFolderIds={expandedFolderIds}
              activeNodeId={visibleActiveNodeId}
              onActiveNodeChange={setActiveNodeId}
              onFolderToggle={onFolderToggle}
            />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
