import {
  NoSelectionPreview,
  SelectedFilePreview,
} from "~/features/file-explorer/ui/preview/file-preview"

import type { FileLocation } from "./file-tree-utils"

type FilePreviewProps = {
  location: FileLocation | null
}

/** Adapts the old tree's selection to the feature preview until the T25 cutover. */
export function FilePreview({ location }: FilePreviewProps) {
  return location ? (
    <SelectedFilePreview file={location.file} path={location.path} />
  ) : (
    <NoSelectionPreview />
  )
}
