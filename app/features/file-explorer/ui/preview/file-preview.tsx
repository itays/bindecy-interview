import type { ReactNode } from "react"
import {
  CircleAlertIcon,
  FileSearchIcon,
  LoaderCircleIcon,
  RotateCwIcon,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Separator } from "~/components/ui/separator"
import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import { formatFileSize } from "~/features/file-explorer/domain/format"
import type { FileDetail } from "~/features/file-explorer/domain/types"
import { useExplorer } from "~/features/file-explorer/state/explorer-provider"
import { fileCategoryDetails } from "~/features/file-explorer/ui/file-category-details"

import { OpenFileButton } from "./preview-fallback"
import { PreviewMedia } from "./preview-media"
import { getHttpPreviewUrl } from "./preview-url"
import { useNodeDetail } from "./use-node-detail"

/** Shown for a failed detail request that isn't an `ApiError` (which carries its own message). */
export const GENERIC_DETAIL_ERROR = "Something went wrong. Try again."

const DEFAULT_DESCRIPTION = "Inspect a file without leaving the project"

function PreviewCard({
  path,
  badge,
  selected,
  children,
}: {
  /** The file's path, top-level folder first; `null` shows the default description. */
  path: string | null
  badge: string
  selected: boolean
  children: ReactNode
}) {
  return (
    <Card className="h-[32rem] min-w-0 md:h-full md:min-h-[30rem]">
      <CardHeader className="border-b">
        <CardTitle>Preview</CardTitle>
        <CardDescription className="min-w-0 truncate" title={path ?? undefined}>
          {path ?? DEFAULT_DESCRIPTION}
        </CardDescription>
        <CardAction>
          <Badge variant={selected ? "secondary" : "outline"}>{badge}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">{children}</ScrollArea>
      </CardContent>
    </Card>
  )
}

function EmptyPreview() {
  return (
    <div className="flex min-h-[26rem] p-4">
      <Empty className="border bg-muted/30">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileSearchIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Select a file to preview</EmptyTitle>
          <EmptyDescription>
            Choose an image, recording, video, or document from the project
            tree.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

function DetailLoading() {
  return (
    <div className="flex min-h-[26rem] p-4">
      <Empty role="status" className="border bg-muted/30">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LoaderCircleIcon
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          </EmptyMedia>
          <EmptyTitle>Loading file details…</EmptyTitle>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

function DetailError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-[26rem] p-4">
      <Empty role="alert" className="border bg-muted/30">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Couldn't load file details</EmptyTitle>
          <EmptyDescription>
            {error instanceof ApiError ? error.message : GENERIC_DETAIL_ERROR}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}

/** The file fields the preview shows; a `FileDetail` has them all. */
export type PreviewedFile = Pick<
  FileDetail,
  "id" | "name" | "category" | "sizeInBytes" | "previewUrl"
>

/**
 * The preview card for one file: its path, metadata and media. `path` runs
 * from the top-level folder down to the file name.
 */
export function SelectedFilePreview({
  file,
  path,
}: {
  file: PreviewedFile
  path: readonly string[]
}) {
  const category = fileCategoryDetails[file.category]
  const CategoryIcon = category.icon
  const safeUrl = getHttpPreviewUrl(file.previewUrl)

  return (
    <PreviewCard path={path.join(" / ")} badge={category.label} selected>
      <div className="space-y-4 p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <CategoryIcon aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-medium" title={file.name}>
                {file.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{category.label}</span>
                <span aria-hidden="true">·</span>
                <span>{formatFileSize(file.sizeInBytes)}</span>
              </div>
            </div>
          </div>
          {safeUrl && file.category !== "doc" ? (
            <OpenFileButton url={safeUrl} />
          ) : null}
        </div>
        <Separator />
        <PreviewMedia key={`${file.id}:${file.previewUrl}`} file={file} />
      </div>
    </PreviewCard>
  )
}

/** The preview card for a loaded file detail; the path comes from its ancestors. */
export function FileDetailPreview({ detail }: { detail: FileDetail }) {
  const path = [...detail.ancestors.map((folder) => folder.name), detail.name]
  return <SelectedFilePreview file={detail} path={path} />
}

/** The preview card with nothing selected. */
export function NoSelectionPreview() {
  return (
    <PreviewCard path={null} badge="No selection" selected={false}>
      <EmptyPreview />
    </PreviewCard>
  )
}

/** Previews the selected file, loading its detail (path and URL) on selection. */
export function FilePreview() {
  const selectedId = useExplorer((state) => state.selectedId)
  const result = useNodeDetail(selectedId)

  switch (result.status) {
    case "loading":
      return (
        <PreviewCard path={null} badge="Loading" selected>
          <DetailLoading />
        </PreviewCard>
      )
    case "error":
      return (
        <PreviewCard path={null} badge="Unavailable" selected>
          <DetailError error={result.error} onRetry={result.retry} />
        </PreviewCard>
      )
    case "success":
      if (result.detail.type === "file") {
        return <FileDetailPreview detail={result.detail} />
      }
      break
  }

  return <NoSelectionPreview />
}
