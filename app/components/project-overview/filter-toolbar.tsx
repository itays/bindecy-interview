import { HeadphonesIcon, ImageIcon } from "lucide-react"

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
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"

type FilterToolbarProps = {
  fileCount: number
}

export function FilterToolbar({ fileCount }: FilterToolbarProps) {
  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle>Filter files</CardTitle>
        <CardDescription>
          Narrow the project by filename, size, or media type.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">{fileCount} files</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form>
          <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1.5fr)_repeat(2,minmax(8rem,0.75fr))_auto] lg:items-end">
            <Field className="sm:col-span-2 lg:col-span-1">
              <FieldLabel htmlFor="file-name">Name</FieldLabel>
              <Input
                id="file-name"
                name="file-name"
                type="search"
                placeholder="Search project files"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="minimum-size">Minimum size (MB)</FieldLabel>
              <Input
                id="minimum-size"
                name="minimum-size"
                inputMode="decimal"
                min="0"
                placeholder="Any"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="maximum-size">Maximum size (MB)</FieldLabel>
              <Input
                id="maximum-size"
                name="maximum-size"
                inputMode="decimal"
                min="0"
                placeholder="Any"
              />
            </Field>

            <FieldSet className="gap-2 sm:col-span-2 lg:col-span-1">
              <FieldLegend variant="label">File type</FieldLegend>
              <ToggleGroup
                aria-label="Filter by file type"
                multiple
                size="sm"
                spacing={2}
                variant="outline"
              >
                <ToggleGroupItem value="audio" aria-label="Audio files">
                  <HeadphonesIcon data-icon="inline-start" />
                  Audio
                </ToggleGroupItem>
                <ToggleGroupItem value="image" aria-label="Image files">
                  <ImageIcon data-icon="inline-start" />
                  Image
                </ToggleGroupItem>
              </ToggleGroup>
            </FieldSet>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
