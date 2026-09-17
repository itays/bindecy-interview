import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

afterEach(() => {
  cleanup()
})

class ResizeObserverStub implements ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub)

Object.defineProperties(Element.prototype, {
  getAnimations: {
    configurable: true,
    value: vi.fn(() => []),
  },
  scrollIntoView: {
    configurable: true,
    value: vi.fn(),
  },
})
