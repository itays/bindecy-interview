import type { LucideIcon } from "lucide-react"
import {
  AudioLinesIcon,
  FileTextIcon,
  ImageIcon,
  VideoIcon,
} from "lucide-react"

import type { FileCategory } from "~/types/project-node"

export const fileCategoryDetails: Record<
  FileCategory,
  { label: string; icon: LucideIcon }
> = {
  audio: { label: "Audio", icon: AudioLinesIcon },
  video: { label: "Video", icon: VideoIcon },
  image: { label: "Image", icon: ImageIcon },
  doc: { label: "Document", icon: FileTextIcon },
}
