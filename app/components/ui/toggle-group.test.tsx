import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"

const { renders } = vi.hoisted(() => ({ renders: vi.fn() }))

vi.mock("@base-ui/react/toggle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@base-ui/react/toggle")>()
  return {
    ...actual,
    Toggle: (props: React.ComponentProps<typeof actual.Toggle>) => {
      renders()
      return <actual.Toggle {...props} />
    },
  }
})

import { ToggleGroup, ToggleGroupItem } from "./toggle-group"

it("preserves item renders on unrelated updates but propagates style changes", () => {
  const items = <ToggleGroupItem value="audio">Audio</ToggleGroupItem>
  const { rerender } = render(<ToggleGroup>{items}</ToggleGroup>)
  renders.mockClear()
  for (let index = 0; index < 20; index++) {
    rerender(<ToggleGroup className={`sample-${index}`}>{items}</ToggleGroup>)
  }
  expect(renders).not.toHaveBeenCalled()
  renders.mockClear()
  rerender(
    <ToggleGroup size="sm" variant="outline">
      {items}
    </ToggleGroup>
  )
  expect(renders).toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "Audio" })).toHaveAttribute(
    "data-size",
    "sm"
  )
  expect(screen.getByRole("button", { name: "Audio" })).toHaveAttribute(
    "data-variant",
    "outline"
  )
})
