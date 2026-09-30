const BYTES_PER_KB = 1_024
const BYTES_PER_MB = 1_048_576

const byteFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
})

export function formatFileSize(sizeInBytes: number) {
  if (sizeInBytes < BYTES_PER_KB) {
    return `${sizeInBytes} B`
  }

  if (sizeInBytes < BYTES_PER_MB) {
    return `${byteFormatter.format(sizeInBytes / BYTES_PER_KB)} KB`
  }

  return `${byteFormatter.format(sizeInBytes / BYTES_PER_MB)} MB`
}
