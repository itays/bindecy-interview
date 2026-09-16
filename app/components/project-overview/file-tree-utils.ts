import type { ProjectNode } from "~/types/project-node"

const byteFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
})

export function formatFileSize(sizeInBytes: number) {
  if (sizeInBytes < 1_024) {
    return `${sizeInBytes} B`
  }

  if (sizeInBytes < 1_048_576) {
    return `${byteFormatter.format(sizeInBytes / 1_024)} KB`
  }

  return `${byteFormatter.format(sizeInBytes / 1_048_576)} MB`
}

export function countFiles(nodes: ProjectNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.type === "file" ? 1 : countFiles(node.children)),
    0
  )
}
