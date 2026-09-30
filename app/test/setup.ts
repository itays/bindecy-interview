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

/**
 * jsdom has no layout, so every `offset*` size is 0 and
 * `@tanstack/react-virtual` would render no rows. An element reports its
 * inline `style` size (the virtualizer sets one on its rows and spacer), or
 * a desktop viewport size otherwise.
 */
const JSDOM_ELEMENT_SIZE = { width: 1024, height: 768 }

function inlineSize(element: HTMLElement, dimension: "width" | "height") {
  const size = Number.parseFloat(element.style[dimension])
  return Number.isFinite(size) ? size : JSDOM_ELEMENT_SIZE[dimension]
}

Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: {
    configurable: true,
    get(this: HTMLElement) {
      return inlineSize(this, "width")
    },
  },
  offsetHeight: {
    configurable: true,
    get(this: HTMLElement) {
      return inlineSize(this, "height")
    },
  },
})
