import { useState } from "react"
import {
  AudioLinesIcon,
  ExternalLinkIcon,
  FileQuestionIcon,
  FileSearchIcon,
  LoaderCircleIcon,
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
import type { FileNode } from "~/types/project-node"

import { fileCategoryDetails } from "./file-category-details"
import type { FileLocation } from "./file-tree-utils"
import { formatFileSize } from "./file-tree-utils"

type FilePreviewProps = {
  location: FileLocation | null
}

type PreviewStatus = "loading" | "ready" | "error"

function getHttpPreviewUrl(previewUrl: string) {
  const trimmedUrl = previewUrl.trim()

  if (!trimmedUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(trimmedUrl, "https://project-preview.invalid")

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null
    }

    return trimmedUrl
  } catch {
    return null
  }
}

function OpenFileButton({ url }: { url: string }) {
  return (
    <Button
      nativeButton={false}
      render={<a href={url} target="_blank" rel="noopener noreferrer" />}
    >
      <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
      Open file
    </Button>
  )
}

function LoadingPreview({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircleIcon
        aria-hidden="true"
        className="size-4 animate-spin motion-reduce:animate-none"
      />
      {label}
    </div>
  )
}

function PreviewFallback({
  title,
  description,
  url,
}: {
  title: string
  description: string
  url: string | null
}) {
  return (
    <Empty className="min-h-[18rem] border bg-muted/30 md:min-h-[24rem]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestionIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {url ? (
        <EmptyContent>
          <OpenFileButton url={url} />
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

function ImagePreview({ file, url }: { file: FileNode; url: string }) {
  const [status, setStatus] = useState<PreviewStatus>("loading")

  if (status === "error") {
    return (
      <PreviewFallback
        title="Image preview unavailable"
        description="The image could not be loaded here. You can still try opening the original file."
        url={url}
      />
    )
  }

  return (
    <div className="relative flex min-h-[18rem] items-center justify-center overflow-hidden rounded-xl border bg-muted/30 p-3 md:min-h-[24rem]">
      {status === "loading" ? <LoadingPreview label="Loading image…" /> : null}
      <img
        src={url}
        alt={`Preview of ${file.name}`}
        width={1600}
        height={900}
        decoding="async"
        className={`max-h-[30rem] w-full object-contain transition-opacity motion-reduce:transition-none ${status === "ready" ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
    </div>
  )
}

function AudioPreview({ file, url }: { file: FileNode; url: string }) {
  const [status, setStatus] = useState<PreviewStatus>("loading")

  if (status === "error") {
    return (
      <PreviewFallback
        title="Audio preview unavailable"
        description="The recording could not be loaded here. You can still try opening the original file."
        url={url}
      />
    )
  }

  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center gap-5 rounded-xl border bg-muted/30 p-6 md:min-h-[24rem]">
      <div className="flex size-16 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <AudioLinesIcon aria-hidden="true" className="size-7" />
      </div>
      <div className="text-center">
        <p className="font-medium">{file.name}</p>
        {status === "loading" ? (
          <p role="status" className="mt-1 text-sm text-muted-foreground">
            Loading audio controls…
          </p>
        ) : null}
      </div>
      <audio
        controls
        preload="metadata"
        aria-label={`Audio preview of ${file.name}`}
        className="w-full max-w-xl"
        onLoadedMetadata={() => setStatus("ready")}
        onError={() => setStatus("error")}
      >
        <source src={url} />
      </audio>
    </div>
  )
}

function VideoPreview({ file, url }: { file: FileNode; url: string }) {
  const [status, setStatus] = useState<PreviewStatus>("loading")

  if (status === "error") {
    return (
      <PreviewFallback
        title="Video preview unavailable"
        description="The video could not be loaded here. You can still try opening the original file."
        url={url}
      />
    )
  }

  return (
    <div className="relative flex min-h-[18rem] items-center justify-center overflow-hidden rounded-xl border bg-muted/30 md:min-h-[24rem]">
      {status === "loading" ? <LoadingPreview label="Loading video…" /> : null}
      <video
        controls
        preload="metadata"
        width={1280}
        height={720}
        aria-label={`Video preview of ${file.name}`}
        className={`max-h-[30rem] w-full object-contain transition-opacity motion-reduce:transition-none ${status === "ready" ? "opacity-100" : "opacity-0"}`}
        onLoadedMetadata={() => setStatus("ready")}
        onError={() => setStatus("error")}
      >
        <source src={url} />
      </video>
    </div>
  )
}

function DocumentPreview({ file, url }: { file: FileNode; url: string }) {
  const [status, setStatus] = useState<PreviewStatus>("loading")

  if (status === "error") {
    return (
      <PreviewFallback
        title="Document preview unavailable"
        description="This document could not be embedded. Open the original file in a new tab instead."
        url={url}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative min-h-[24rem] overflow-hidden rounded-xl border bg-muted/30">
        {status === "loading" ? (
          <LoadingPreview label="Loading document…" />
        ) : null}
        <iframe
          src={url}
          title={`Preview of ${file.name}`}
          loading="lazy"
          sandbox=""
          referrerPolicy="no-referrer"
          className={`h-[32rem] w-full bg-background transition-opacity motion-reduce:transition-none ${status === "ready" ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Can’t see the document? Open the original file in a new tab.
        </p>
        <OpenFileButton url={url} />
      </div>
    </div>
  )
}

function PreviewMedia({ file }: { file: FileNode }) {
  const safeUrl = getHttpPreviewUrl(file.previewUrl)

  if (!safeUrl) {
    return (
      <PreviewFallback
        title="Preview unavailable"
        description="This file does not have a supported HTTP preview URL, so it cannot be opened safely."
        url={null}
      />
    )
  }

  switch (file.category) {
    case "image":
      return <ImagePreview file={file} url={safeUrl} />
    case "audio":
      return <AudioPreview file={file} url={safeUrl} />
    case "video":
      return <VideoPreview file={file} url={safeUrl} />
    case "doc":
      return <DocumentPreview file={file} url={safeUrl} />
  }
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

export function FilePreview({ location }: FilePreviewProps) {
  const file = location?.file ?? null
  const category = file ? fileCategoryDetails[file.category] : null
  const CategoryIcon = category?.icon
  const safeUrl = file ? getHttpPreviewUrl(file.previewUrl) : null

  return (
    <Card className="h-[32rem] min-w-0 md:h-full md:min-h-[30rem]">
      <CardHeader className="border-b">
        <CardTitle>Preview</CardTitle>
        <CardDescription
          className="min-w-0 truncate"
          title={location?.path.join(" / ")}
        >
          {location
            ? location.path.join(" / ")
            : "Inspect a file without leaving the project"}
        </CardDescription>
        <CardAction>
          <Badge variant={file ? "secondary" : "outline"}>
            {category?.label ?? "No selection"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          {!file || !location || !category || !CategoryIcon ? (
            <EmptyPreview />
          ) : (
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
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
