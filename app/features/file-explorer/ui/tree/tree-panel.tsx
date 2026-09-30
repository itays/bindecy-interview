import { SearchXIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { useExplorer } from "~/features/file-explorer/state/explorer-provider"
import {
  currentQueryKey,
  folderKey,
  isFiltering,
} from "~/features/file-explorer/state/explorer-store"

import { VirtualTree } from "./virtual-tree"

const countFormatter = new Intl.NumberFormat("en")

export type TreePanelProps = {
  /** Header actions shown before the file count (the CRUD buttons). */
  actions?: ReactNode
}

/**
 * The "Project files" card: the file count for the applied query, the
 * virtual tree, or an empty state once the top level loads with no items.
 */
export function TreePanel({ actions }: TreePanelProps) {
  const { filtering, fileCount, isEmpty } = useExplorer((state) => {
    const root = state.listings[currentQueryKey(state)]?.[folderKey(null)]
    const filtering = isFiltering(state)

    return {
      filtering,
      fileCount: filtering ? state.stats.filtered : state.stats.total,
      isEmpty: root?.status === "idle" && root.total === 0,
    }
  })
  const countLabel = `${filtering ? "matching " : ""}${fileCount === 1 ? "file" : "files"}`

  return (
    <Card className="h-[32rem] min-w-0 md:h-full md:min-h-[30rem]">
      <CardHeader className="border-b">
        <CardTitle>Project files</CardTitle>
        <CardDescription>
          {isEmpty && filtering
            ? "Adjust or reset the filters to see project files"
            : "Use arrow keys to move through folders and files"}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          {actions}
          {fileCount === null ? null : (
            <Badge variant="secondary" className="tabular-nums">
              {countFormatter.format(fileCount)}
              <span className="sr-only"> {countLabel}</span>
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      {/* Size containment keeps the rows out of the card's content height:
          otherwise the page grid's auto-sized row grows with the tree, the
          viewport never scrolls and every loaded row renders. */}
      <CardContent className="min-h-0 flex-1 p-0 contain-size">
        {isEmpty ? (
          <Empty className="min-h-72">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {filtering ? "No matching files" : "No project files"}
              </EmptyTitle>
              <EmptyDescription>
                {filtering
                  ? "Try a different name, size range, or file type."
                  : "This project doesn't have any folders or files yet."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <VirtualTree />
        )}
      </CardContent>
    </Card>
  )
}
