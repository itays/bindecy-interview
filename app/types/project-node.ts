export type FileCategory = "audio" | "video" | "image" | "doc"

export type FolderNode = {
  id: string
  name: string
  type: "folder"
  children: ProjectNode[]
}

export type FileNode = {
  id: string
  name: string
  type: "file"
  category: FileCategory
  sizeInBytes: number
  previewUrl: string
}

export type ProjectNode = FolderNode | FileNode

export type FileFilters = {
  query: string
  minSizeMb: string
  maxSizeMb: string
  categories: Array<"audio" | "video" | "image">
}
