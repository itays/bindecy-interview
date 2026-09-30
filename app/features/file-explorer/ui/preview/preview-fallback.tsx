import {
  ExternalLinkIcon,
  FileQuestionIcon,
  LoaderCircleIcon,
} from "lucide-react"

import { buttonVariants } from "~/components/ui/button-variants"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"

export function OpenFileButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants()}
    >
      <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
      Open file
    </a>
  )
}

/** A spinner over a media element that hasn't loaded yet. */
export function LoadingPreview({ label }: { label: string }) {
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

/** Shown instead of a media element that can't be displayed. */
export function PreviewFallback({
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
