import { useCallback, useEffect, useMemo, useState } from "react"
import { FolderKanbanIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { projectFiles } from "~/data/project-files"
import type { FileFilters } from "~/types/project-node"

import { FilePreview } from "./file-preview"
import { FileTree } from "./file-tree"
import {
  collectExpandableFolderIds,
  countFiles,
  filterProjectTree,
  findFileLocation,
} from "./file-tree-utils"
import { FilterToolbar } from "./filter-toolbar"

const emptyFilters: FileFilters = {
  query: "",
  minSizeMb: "",
  maxSizeMb: "",
  categories: [],
}

export function ProjectOverview() {
  const totalFileCount = countFiles(projectFiles)
  const [filters, setFilters] = useState<FileFilters>(emptyFilters)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [filterExpansionOverrides, setFilterExpansionOverrides] = useState<
    Map<string, boolean>
  >(() => new Map())
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () =>
      new Set(
        projectFiles
          .filter((node) => node.type === "folder")
          .map((folder) => folder.id)
      )
  )
  const filteredTree = useMemo(
    () => filterProjectTree(projectFiles, filters),
    [filters]
  )
  const isFiltering =
    filteredTree.hasActiveFilters && filteredTree.validation.isValid
  const selectedFileLocation = useMemo(
    () =>
      selectedFileId && filteredTree.visibleFileIds.has(selectedFileId)
        ? findFileLocation(projectFiles, selectedFileId)
        : null,
    [filteredTree.visibleFileIds, selectedFileId]
  )
  const visibleExpandedFolderIds = useMemo(() => {
    if (!isFiltering) {
      return expandedFolderIds
    }

    const visibleFolderIds = new Set([
      ...expandedFolderIds,
      ...filteredTree.ancestorFolderIds,
    ])

    for (const [folderId, expanded] of filterExpansionOverrides) {
      if (expanded) {
        visibleFolderIds.add(folderId)
      } else {
        visibleFolderIds.delete(folderId)
      }
    }

    return visibleFolderIds
  }, [
    expandedFolderIds,
    filteredTree.ancestorFolderIds,
    filterExpansionOverrides,
    isFiltering,
  ])
  const visibleExpandableFolderIds = useMemo(
    () => collectExpandableFolderIds(filteredTree.nodes),
    [filteredTree.nodes]
  )
  const areAllVisibleFoldersExpanded =
    visibleExpandableFolderIds.size > 0 &&
    [...visibleExpandableFolderIds].every((folderId) =>
      visibleExpandedFolderIds.has(folderId)
    )

  useEffect(() => {
    if (selectedFileId && !filteredTree.visibleFileIds.has(selectedFileId)) {
      setSelectedFileId(null)
    }
  }, [filteredTree.visibleFileIds, selectedFileId])

  const handleFiltersChange = useCallback((nextFilters: FileFilters) => {
    setFilterExpansionOverrides(new Map())
    setFilters(nextFilters)
  }, [])

  const handleResetFilters = useCallback(() => {
    setFilterExpansionOverrides(new Map())
    setFilters(emptyFilters)
  }, [])

  const handleFolderToggle = useCallback(
    (folderId: string) => {
      if (isFiltering) {
        setFilterExpansionOverrides((currentOverrides) => {
          const nextOverrides = new Map(currentOverrides)
          nextOverrides.set(folderId, !visibleExpandedFolderIds.has(folderId))
          return nextOverrides
        })
        return
      }

      setExpandedFolderIds((currentFolderIds) => {
        const nextFolderIds = new Set(currentFolderIds)

        if (!nextFolderIds.delete(folderId)) {
          nextFolderIds.add(folderId)
        }

        return nextFolderIds
      })
    },
    [isFiltering, visibleExpandedFolderIds]
  )

  const handleAllFoldersToggle = useCallback(() => {
    const shouldExpand = !areAllVisibleFoldersExpanded

    if (isFiltering) {
      setFilterExpansionOverrides((currentOverrides) => {
        const nextOverrides = new Map(currentOverrides)

        for (const folderId of visibleExpandableFolderIds) {
          nextOverrides.set(folderId, shouldExpand)
        }

        return nextOverrides
      })
      return
    }

    setExpandedFolderIds(
      shouldExpand ? new Set(visibleExpandableFolderIds) : new Set()
    )
  }, [areAllVisibleFoldersExpanded, isFiltering, visibleExpandableFolderIds])

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

        <FilterToolbar
          filters={filters}
          validation={filteredTree.validation}
          resultCount={filteredTree.fileCount}
          totalFileCount={totalFileCount}
          hasActiveFilters={filteredTree.hasActiveFilters}
          onFiltersChange={handleFiltersChange}
          onReset={handleResetFilters}
        />

        <div className="grid min-h-0 min-w-0 gap-4 md:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          <FileTree
            nodes={filteredTree.nodes}
            expandedFolderIds={visibleExpandedFolderIds}
            allFoldersExpanded={areAllVisibleFoldersExpanded}
            hasExpandableFolders={visibleExpandableFolderIds.size > 0}
            selectedFileId={selectedFileId}
            onFolderToggle={handleFolderToggle}
            onAllFoldersToggle={handleAllFoldersToggle}
            onFileSelect={setSelectedFileId}
          />
          <FilePreview location={selectedFileLocation} />
        </div>
      </div>
    </main>
  )
}
