import { useState } from "react"
import { AudioLinesIcon } from "lucide-react"

import type { FileDetail } from "~/features/file-explorer/domain/types"
import { cn } from "~/lib/utils"

import {
  LoadingPreview,
  OpenFileButton,
  PreviewFallback,
} from "./preview-fallback"
import { getHttpPreviewUrl } from "./preview-url"

type PreviewStatus = "loading" | "ready" | "error"

/** The file fields the media previews read. */
type MediaFile = Pick<FileDetail, "name" | "category" | "previewUrl">

type MediaPreviewProps = { file: MediaFile; url: string }

function ImagePreview({ file, url }: MediaPreviewProps) {
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
        className={cn(
          "max-h-[30rem] w-full object-contain transition-opacity motion-reduce:transition-none",
          status === "ready" ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
    </div>
  )
}

function AudioPreview({ file, url }: MediaPreviewProps) {
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

function VideoPreview({ file, url }: MediaPreviewProps) {
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
        className={cn(
          "max-h-[30rem] w-full object-contain transition-opacity motion-reduce:transition-none",
          status === "ready" ? "opacity-100" : "opacity-0"
        )}
        onLoadedMetadata={() => setStatus("ready")}
        onError={() => setStatus("error")}
      >
        <source src={url} />
      </video>
    </div>
  )
}

function DocumentPreview({ file, url }: MediaPreviewProps) {
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
          className={cn(
            "h-[32rem] w-full bg-background transition-opacity motion-reduce:transition-none",
            status === "ready" ? "opacity-100" : "opacity-0"
          )}
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

/**
 * The preview element for the file's category. Key it by the file id and
 * URL so a different file starts from the loading state.
 */
export function PreviewMedia({ file }: { file: MediaFile }) {
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
