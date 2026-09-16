import { FolderKanbanIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { projectFiles } from "~/data/project-files"

import { FilePreview } from "./file-preview"
import { FileTree } from "./file-tree"
import { countFiles } from "./file-tree-utils"
import { FilterToolbar } from "./filter-toolbar"

export function ProjectOverview() {
  const fileCount = countFiles(projectFiles)

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto grid min-h-dvh w-full max-w-[96rem] grid-rows-[auto_auto_1fr] gap-4 p-4 sm:p-6">
        <header className="flex min-w-0 flex-wrap items-end justify-between gap-3 px-1">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <FolderKanbanIcon aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Northstar campaign
              </p>
              <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
                Project overview
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Browse the working set and inspect campaign assets in one place.
              </p>
            </div>
          </div>
          <Badge variant="outline">Creative workspace</Badge>
        </header>

        <FilterToolbar fileCount={fileCount} />

        <div className="grid min-h-0 min-w-0 gap-4 md:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          <FileTree nodes={projectFiles} />
          <FilePreview />
        </div>
      </div>
    </main>
  )
}
