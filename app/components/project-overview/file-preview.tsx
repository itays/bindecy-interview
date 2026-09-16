import { FileSearchIcon } from "lucide-react"

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
import { ScrollArea } from "~/components/ui/scroll-area"

export function FilePreview() {
  return (
    <Card className="h-[32rem] min-w-0 md:h-full md:min-h-[30rem]">
      <CardHeader className="border-b">
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          Inspect a file without leaving the project
        </CardDescription>
        <CardAction>
          <Badge variant="outline">No selection</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="flex min-h-[26rem] p-4">
            <Empty className="border bg-muted/30">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSearchIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Select a file to preview</EmptyTitle>
                <EmptyDescription>
                  Choose an image, recording, video, or document from the
                  project tree.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
