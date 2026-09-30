import { memo, useEffect, useState } from "react"
import {
  HeadphonesIcon,
  ImageIcon,
  RotateCcwIcon,
  VideoIcon,
} from "lucide-react"
import { useDebouncedCallback } from "use-debounce"

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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import {
  toFileQuery,
  validateFileFilters,
} from "~/features/file-explorer/domain/filters"
import type { FileFilters } from "~/features/file-explorer/domain/filters"
import type { FilterCategory } from "~/features/file-explorer/domain/types"
import {
  useExplorer,
  useExplorerStore,
  useLoader,
} from "~/features/file-explorer/state/explorer-provider"

/** Typing pauses this long before the draft is applied. */
const FILTER_DEBOUNCE_MS = 250

const INVALID_FILTERS_MESSAGE =
  "Fix the size filters to update the file results."

const EMPTY_FILTERS: FileFilters = {
  query: "",
  minSizeMb: "",
  maxSizeMb: "",
  categories: [],
}

type SizeField = "minSizeMb" | "maxSizeMb"

type ResultCounts = {
  isFiltering: boolean
  total: number | null
  filtered: number | null
}

const sizePattern = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)"
const countFormat = new Intl.NumberFormat("en-US")

function isFilterCategory(value: string): value is FilterCategory {
  return value === "audio" || value === "video" || value === "image"
}

type FilterStatus = {
  /** The visible status line. */
  line: string
  /** For the live region; `null` keeps its last announcement. */
  live: string | null
  badge: string
}

/**
 * Texts for the applied query's counts. An invalid draft is announced only
 * once its field errors show, and loading counts are never announced, so a
 * stale or transient count isn't read out.
 */
function filterStatus(
  { isFiltering, total, filtered }: ResultCounts,
  isValid: boolean,
  showsErrors: boolean
): FilterStatus {
  if (!isValid) {
    return {
      line: INVALID_FILTERS_MESSAGE,
      live: showsErrors ? INVALID_FILTERS_MESSAGE : null,
      badge: "Filters paused",
    }
  }

  const shown = isFiltering ? filtered : total

  if (total === null || shown === null) {
    return {
      line: isFiltering ? "Counting matching files…" : "Counting files…",
      live: null,
      badge: "Counting…",
    }
  }

  const totalText = countFormat.format(total)
  const shownText = countFormat.format(shown)
  const line = !isFiltering
    ? `Showing all ${totalText} files.`
    : shown === 0
      ? `No matching files. Showing 0 of ${totalText} files.`
      : `Showing ${shownText} of ${totalText} files.`

  return { line, live: line, badge: `${shownText} of ${totalText} files` }
}

function SizeFilterField({
  id,
  label,
  value,
  error,
  onBlur,
  onChange,
}: {
  id: string
  label: string
  value: string
  error: string | null
  onBlur: () => void
  onChange: (value: string) => void
}) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        min="0"
        pattern={sizePattern}
        placeholder="Any"
        value={value}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  )
}

/**
 * Polite region for the result line. A `null` message (counts loading, or
 * an invalid draft nobody has left yet) keeps the last announcement, so
 * transient states aren't read out; a new `id` repeats the same message.
 */
const ResultAnnouncement = memo(
  function ResultAnnouncement({
    id,
    message,
  }: {
    id: number
    message: string | null
  }) {
    return (
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span key={id}>{message}</span>
      </span>
    )
  },
  (previous, next) =>
    next.message === null ||
    (previous.id === next.id && previous.message === next.message)
)

/**
 * Polite region for D3: announces the store's `announcement` each time
 * applying filters clears the selection (the store does both in one update),
 * even when the same file is deselected twice.
 */
function DeselectionAnnouncement() {
  const store = useExplorerStore()
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(
    null
  )

  useEffect(
    () =>
      store.subscribe((state, previous) => {
        if (
          state.appliedQuery !== previous.appliedQuery &&
          previous.selectedId !== null &&
          state.selectedId === null
        ) {
          setNotice((current) => ({
            id: (current?.id ?? 0) + 1,
            message: state.announcement,
          }))
        }
      }),
    [store]
  )

  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {notice ? <span key={notice.id}>{notice.message}</span> : null}
    </span>
  )
}

/**
 * Name, size and file-type filters. The draft lives here and is validated
 * on every change; a valid draft reaches `loader.applyFilters` after
 * `FILTER_DEBOUNCE_MS` of quiet, at once on Enter or a file-type toggle.
 * Counts come from the store's `stats` for the applied query.
 */
export function FilterToolbar() {
  const loader = useLoader()
  const counts = useExplorer((state): ResultCounts => ({
    isFiltering: state.appliedQuery !== null,
    total: state.stats.total,
    filtered: state.stats.filtered,
  }))
  const [draft, setDraft] = useState<FileFilters>(EMPTY_FILTERS)
  const [touchedSizeFields, setTouchedSizeFields] = useState<
    Record<SizeField, boolean>
  >({
    minSizeMb: false,
    maxSizeMb: false,
  })
  const [announcementId, setAnnouncementId] = useState(0)
  // Pending calls are cancelled on unmount.
  const applyDraft = useDebouncedCallback((filters: FileFilters) => {
    const query = toFileQuery(filters)

    if (query) {
      void loader.applyFilters(query)
    }
  }, FILTER_DEBOUNCE_MS)

  const validation = validateFileFilters(draft)
  const showMinimumError =
    touchedSizeFields.minSizeMb && !!validation.minSizeError
  const showMaximumError =
    touchedSizeFields.maxSizeMb && !!validation.maxSizeError
  const status = filterStatus(
    counts,
    validation.isValid,
    showMinimumError || showMaximumError
  )
  const canReset =
    counts.isFiltering ||
    draft.query.trim() !== "" ||
    draft.minSizeMb.trim() !== "" ||
    draft.maxSizeMb.trim() !== "" ||
    draft.categories.length > 0

  function changeDraft(nextDraft: FileFilters) {
    setDraft(nextDraft)
    applyDraft(nextDraft)
  }

  function updateSize(field: SizeField, value: string) {
    setTouchedSizeFields({ minSizeMb: false, maxSizeMb: false })
    changeDraft({ ...draft, [field]: value })
  }

  function markSizeFieldTouched(field: SizeField) {
    setTouchedSizeFields((currentFields) =>
      validation.hasInvalidRange
        ? { minSizeMb: true, maxSizeMb: true }
        : { ...currentFields, [field]: true }
    )
  }

  function commitDraft() {
    setTouchedSizeFields({ minSizeMb: true, maxSizeMb: true })
    setAnnouncementId((currentId) => currentId + 1)
    applyDraft.flush()
  }

  function resetFilters() {
    applyDraft.cancel()
    setDraft(EMPTY_FILTERS)
    setTouchedSizeFields({ minSizeMb: false, maxSizeMb: false })
    setAnnouncementId((currentId) => currentId + 1)
    void loader.applyFilters(null)
  }

  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle>Filter files</CardTitle>
        <CardDescription>
          Narrow the project by filename, size, or media type.
        </CardDescription>
        <CardAction>
          <Badge variant={validation.isValid ? "secondary" : "outline"}>
            {status.badge}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form
          action="/"
          method="get"
          noValidate
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.nativeEvent.isComposing &&
              event.target instanceof HTMLInputElement
            ) {
              event.preventDefault()
              commitDraft()
            }
          }}
          onSubmit={(event) => {
            event.preventDefault()
            commitDraft()
          }}
        >
          <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1.5fr)_repeat(2,minmax(8rem,0.75fr))_auto] lg:items-start">
            <Field className="sm:col-span-2 lg:col-span-1">
              <FieldLabel htmlFor="file-name">Name</FieldLabel>
              <Input
                id="file-name"
                name="name"
                type="search"
                autoComplete="off"
                placeholder="Search project files"
                value={draft.query}
                onChange={(event) =>
                  changeDraft({ ...draft, query: event.target.value })
                }
              />
            </Field>

            <SizeFilterField
              id="minimum-size"
              label="Minimum size (MB)"
              value={draft.minSizeMb}
              error={showMinimumError ? validation.minSizeError : null}
              onBlur={() => markSizeFieldTouched("minSizeMb")}
              onChange={(value) => updateSize("minSizeMb", value)}
            />

            <SizeFilterField
              id="maximum-size"
              label="Maximum size (MB)"
              value={draft.maxSizeMb}
              error={showMaximumError ? validation.maxSizeError : null}
              onBlur={() => markSizeFieldTouched("maxSizeMb")}
              onChange={(value) => updateSize("maxSizeMb", value)}
            />

            <FieldSet className="gap-2 sm:col-span-2 lg:col-span-1">
              <FieldLegend variant="label">File type</FieldLegend>
              <ToggleGroup
                aria-label="Filter by file type"
                multiple
                size="sm"
                spacing={2}
                variant="outline"
                value={draft.categories}
                onValueChange={(categories) => {
                  // A toggle is a deliberate choice: apply it (and any
                  // pending typing) without waiting for the debounce.
                  changeDraft({
                    ...draft,
                    categories: categories.filter(isFilterCategory),
                  })
                  applyDraft.flush()
                }}
              >
                <ToggleGroupItem value="audio" aria-label="Audio files">
                  <HeadphonesIcon data-icon="inline-start" />
                  Audio
                </ToggleGroupItem>
                <ToggleGroupItem value="image" aria-label="Image files">
                  <ImageIcon data-icon="inline-start" />
                  Image
                </ToggleGroupItem>
                <ToggleGroupItem value="video" aria-label="Video files">
                  <VideoIcon data-icon="inline-start" />
                  Video
                </ToggleGroupItem>
              </ToggleGroup>
            </FieldSet>
          </FieldGroup>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">{status.line}</p>
            <ResultAnnouncement id={announcementId} message={status.live} />
            <DeselectionAnnouncement />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canReset}
              onClick={resetFilters}
            >
              <RotateCcwIcon data-icon="inline-start" />
              Reset filters
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
