import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import type { Range } from "@tanstack/react-virtual"
import { useCallback, useMemo, useRef } from "react"
import type { KeyboardEvent } from "react"

import { ScrollArea } from "~/components/ui/scroll-area"
import {
  useExplorer,
  useExplorerStore,
  useLoader,
  useVisibleRows,
} from "~/features/file-explorer/state/explorer-provider"
import { rowHeight } from "~/features/file-explorer/state/visible-rows"
import type { Row } from "~/features/file-explorer/state/visible-rows"

import { resolveTreeKey } from "./tree-keyboard"
import { TreeRow } from "./tree-row"
import { treeRowId } from "./tree-row-id"

/** Rows rendered beyond each edge of the viewport. */
const OVERSCAN = 10

/** Space above the first row and below the last, in px. */
const TREE_PADDING = 8

/**
 * The project tree: a flat, virtualized `role="tree"` over the visible rows.
 * The container owns focus and points `aria-activedescendant` at the active
 * row, which is always rendered, so focus survives scrolling and rows
 * unmounting. Only the rows in range (plus overscan) are in the DOM.
 * Without `onDeleteRequest` the Delete key is left to the browser.
 */
export function VirtualTree({
  onDeleteRequest,
}: {
  /** The Delete key on a node row; the owner confirms before deleting. */
  onDeleteRequest?: (id: string) => void
}) {
  const store = useExplorerStore()
  const loader = useLoader()
  const rows = useVisibleRows()
  const activeId = useExplorer((state) => state.activeId)
  const viewportRef = useRef<HTMLDivElement>(null)

  // O(rows) only when the rows or the active row change, not on scroll.
  const activeIndex = useMemo(
    () =>
      activeId === null ? -1 : rows.findIndex((row) => row.key === activeId),
    [rows, activeId]
  )

  // New identities with each rows array make the virtualizer re-read sizes and keys.
  const estimateSize = useCallback(
    (index: number) => rowHeight(rows[index], store.getState()),
    [rows, store]
  )
  const getItemKey = useCallback((index: number) => rows[index].key, [rows])
  // Keeps the active row mounted so `aria-activedescendant` never dangles.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range)

      if (activeIndex < 0 || indexes.includes(activeIndex)) {
        return indexes
      }

      return activeIndex < indexes[0]
        ? [activeIndex, ...indexes]
        : [...indexes, activeIndex]
    },
    [activeIndex]
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize,
    getItemKey,
    rangeExtractor,
    overscan: OVERSCAN,
    paddingStart: TREE_PADDING,
    paddingEnd: TREE_PADDING,
  })

  /** Clicking a row makes it active, then toggles a folder or selects a file. */
  const activateRow = useCallback(
    (row: Row) => {
      const state = store.getState()

      state.setActive(row.key)

      if (row.kind !== "node") return

      if (state.nodesById.get(row.id)?.type === "folder") {
        state.toggleExpanded(row.id)
      } else {
        state.select(row.id)
      }
    },
    [store]
  )

  /** Runs the keyboard model's action, then brings the active row into view. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const state = store.getState()
    const action = resolveTreeKey(rows, activeIndex, event.key, state)

    if (action === null || (action.type === "delete" && !onDeleteRequest)) {
      return
    }

    event.preventDefault()

    switch (action.type) {
      case "move":
        state.setActive(rows[action.index].key)
        break
      case "toggle":
        state.toggleExpanded(action.id)
        break
      case "select":
        state.select(action.id)
        break
      case "load-more":
        void loader.loadMore(action.folderId)
        break
      case "retry":
        void loader.retry(action.folderId)
        break
      case "delete":
        onDeleteRequest?.(action.id)
        break
    }

    virtualizer.scrollToIndex(
      action.type === "move" ? action.index : activeIndex,
      { align: "auto" }
    )
  }

  // A focused tree always has an active row (the first one by default).
  function handleFocus() {
    if (activeIndex < 0 && rows.length > 0) {
      store.getState().setActive(rows[0].key)
    }
  }

  return (
    <ScrollArea className="h-full" viewportRef={viewportRef}>
      <div
        role="tree"
        aria-label="Project files"
        aria-activedescendant={
          activeIndex < 0 ? undefined : treeRowId(rows[activeIndex].key)
        }
        tabIndex={0}
        className="relative mx-1 outline-none"
        style={{ height: virtualizer.getTotalSize() }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <TreeRow
            key={item.key}
            row={rows[item.index]}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${item.start}px)`,
            }}
            onActivate={activateRow}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
