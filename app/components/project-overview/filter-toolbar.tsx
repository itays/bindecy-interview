import { memo, useState } from "react"
import {
  HeadphonesIcon,
  ImageIcon,
  RotateCcwIcon,
  VideoIcon,
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import type { FileFilters } from "~/types/project-node"

import type { FileFilterValidation } from "./file-tree-utils"

type FilterToolbarProps = {
  filters: FileFilters
  validation: FileFilterValidation
  resultCount: number
  totalFileCount: number
  hasActiveFilters: boolean
  onFiltersChange: (filters: FileFilters) => void
  onReset: () => void
}

type SizeField = "minSizeMb" | "maxSizeMb"

const sizePattern = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)"

function isFilterCategory(value: string): value is "audio" | "video" | "image" {
  return value === "audio" || value === "video" || value === "image"
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

const ResultAnnouncement = memo(
  function ResultAnnouncement({
    id,
    message,
  }: {
    id: number
    message: string
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
  (previous, next) => previous.id === next.id
)

export function FilterToolbar({
  filters,
  validation,
  resultCount,
  totalFileCount,
  hasActiveFilters,
  onFiltersChange,
  onReset,
}: FilterToolbarProps) {
  const [touchedSizeFields, setTouchedSizeFields] = useState<
    Record<SizeField, boolean>
  >({
    minSizeMb: false,
    maxSizeMb: false,
  })
  const showMinimumError =
    touchedSizeFields.minSizeMb && !!validation.minSizeError
  const showMaximumError =
    touchedSizeFields.maxSizeMb && !!validation.maxSizeError
  const statusMessage = !validation.isValid
    ? "Fix the size filters to update the file results."
    : hasActiveFilters && resultCount === 0
      ? `No matching files. Showing 0 of ${totalFileCount} files.`
      : hasActiveFilters
        ? `Showing ${resultCount} of ${totalFileCount} files.`
        : `Showing all ${totalFileCount} files.`
  const [announcementId, setAnnouncementId] = useState(0)

  function requestAnnouncement() {
    setAnnouncementId((currentId) => currentId + 1)
  }

  function updateFilter<Key extends keyof FileFilters>(
    key: Key,
    value: FileFilters[Key]
  ) {
    onFiltersChange({ ...filters, [key]: value })
  }

  function markSizeFieldTouched(field: SizeField) {
    setTouchedSizeFields((currentFields) =>
      validation.hasInvalidRange
        ? { minSizeMb: true, maxSizeMb: true }
        : { ...currentFields, [field]: true }
    )
    requestAnnouncement()
  }

  function commitFilterFeedback() {
    setTouchedSizeFields({ minSizeMb: true, maxSizeMb: true })
    requestAnnouncement()
  }

  function resetFilters() {
    setTouchedSizeFields({ minSizeMb: false, maxSizeMb: false })
    requestAnnouncement()
    onReset()
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
            {validation.isValid
              ? `${resultCount} of ${totalFileCount} files`
              : "Filters paused"}
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
              commitFilterFeedback()
            }
          }}
          onSubmit={(event) => {
            event.preventDefault()
            commitFilterFeedback()
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
                value={filters.query}
                onBlur={requestAnnouncement}
                onChange={(event) => updateFilter("query", event.target.value)}
              />
            </Field>

            <SizeFilterField
              id="minimum-size"
              label="Minimum size (MB)"
              value={filters.minSizeMb}
              error={showMinimumError ? validation.minSizeError : null}
              onBlur={() => markSizeFieldTouched("minSizeMb")}
              onChange={(value) => {
                setTouchedSizeFields({
                  minSizeMb: false,
                  maxSizeMb: false,
                })
                updateFilter("minSizeMb", value)
              }}
            />

            <SizeFilterField
              id="maximum-size"
              label="Maximum size (MB)"
              value={filters.maxSizeMb}
              error={showMaximumError ? validation.maxSizeError : null}
              onBlur={() => markSizeFieldTouched("maxSizeMb")}
              onChange={(value) => {
                setTouchedSizeFields({
                  minSizeMb: false,
                  maxSizeMb: false,
                })
                updateFilter("maxSizeMb", value)
              }}
            />

            <FieldSet className="gap-2 sm:col-span-2 lg:col-span-1">
              <FieldLegend variant="label">File type</FieldLegend>
              <ToggleGroup
                aria-label="Filter by file type"
                multiple
                size="sm"
                spacing={2}
                variant="outline"
                value={filters.categories}
                onValueChange={(categories) => {
                  updateFilter(
                    "categories",
                    categories.filter(isFilterCategory)
                  )
                  requestAnnouncement()
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
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
            <ResultAnnouncement id={announcementId} message={statusMessage} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasActiveFilters}
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
