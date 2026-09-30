import { describe, expect, it } from "vitest"

import { formatFileSize } from "./format"

const KB = 1_024
const MB = 1_048_576

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [1_023, "1023 B"],
    [KB, "1 KB"],
    [1_536, "1.5 KB"],
    [1_100, "1.1 KB"],
    [MB - 1, "1,024 KB"],
    [MB, "1 MB"],
    [1.25 * MB, "1.3 MB"],
    [2.5 * MB, "2.5 MB"],
    [2_048 * MB, "2,048 MB"],
  ])("formats %d bytes as %s", (sizeInBytes, expected) => {
    expect(formatFileSize(sizeInBytes)).toBe(expected)
  })
})
