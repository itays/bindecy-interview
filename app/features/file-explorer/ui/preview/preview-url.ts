/** The trimmed URL when it's an `http:` or `https:` URL, otherwise `null`. */
export function getHttpPreviewUrl(previewUrl: string): string | null {
  const trimmedUrl = previewUrl.trim()

  if (!trimmedUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(trimmedUrl, "https://project-preview.invalid")

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null
    }

    return trimmedUrl
  } catch {
    return null
  }
}
