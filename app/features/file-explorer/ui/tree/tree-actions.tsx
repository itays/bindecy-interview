import { FilePlusIcon, FolderPlusIcon, Trash2Icon } from "lucide-react"
import { useImperativeHandle, useRef, useState } from "react"
import type { Ref } from "react"

import { Button } from "~/components/ui/button"
import type { NodeSummary } from "~/features/file-explorer/domain/types"
import {
  useExplorer,
  useExplorerStore,
  useMutations,
  useVisibleRows,
} from "~/features/file-explorer/state/explorer-provider"
import type { ExplorerState } from "~/features/file-explorer/state/explorer-store"
import type { Row } from "~/features/file-explorer/state/visible-rows"

import { CreateNodeDialog } from "../crud/create-node-dialog"
import type { CreateNodeKind } from "../crud/create-node-dialog"
import { DeleteNodeDialog } from "../crud/delete-node-dialog"
import { treeRowId } from "./tree-row-id"

/**
 * Where a new node goes: into the active folder, next to the active file,
 * into the listing of an active status row, or at the top level. O(1) for
 * a node; a status row costs one scan of the visible rows.
 */
function parentForNewNode(
  { activeId, nodesById }: ExplorerState,
  rows: readonly Row[]
): string | null {
  if (activeId === null) return null

  const node = nodesById.get(activeId)

  if (node) {
    return node.type === "folder" ? node.id : node.parentId
  }

  return rows.find((row) => row.key === activeId)?.folderId ?? null
}

/**
 * The row that takes over from a deleted node: the first row after its
 * subtree, else the row before it; `null` when the node isn't a visible
 * row. O(rows).
 */
function rowAfterDelete(rows: readonly Row[], id: string): string | null {
  const index = rows.findIndex((row) => row.key === id)

  if (index === -1) return null

  // Rows are in pre-order, so the subtree is the deeper run that follows.
  let next = index + 1

  while (next < rows.length && rows[next].depth > rows[index].depth) {
    next += 1
  }

  return rows[next]?.key ?? rows[index - 1]?.key ?? null
}

/**
 * Scrolls the row into view and returns the tree to focus. The active row
 * is always rendered; when `key` isn't a visible row (hidden by the
 * filters, or past the loaded pages), focus goes back to the element that
 * opened the dialog.
 */
function revealRow(key: string): HTMLElement | true {
  const row = document.getElementById(treeRowId(key))

  row?.scrollIntoView({ block: "nearest" })

  return row?.closest<HTMLElement>('[role="tree"]') ?? true
}

/** Lets the tree's Delete key open the same confirmation as the button. */
export type TreeActionsHandle = {
  requestDelete: (id: string) => void
}

/**
 * "New folder", "New file" and "Delete" in the tree panel header, acting on
 * the active row.
 */
export function TreeActions({ ref }: { ref?: Ref<TreeActionsHandle> }) {
  const store = useExplorerStore()
  const mutations = useMutations()
  const rows = useVisibleRows()
  const canDelete = useExplorer(
    (state) => state.activeId !== null && state.nodesById.has(state.activeId)
  )
  const [open, setOpen] = useState(false)
  // Kept after closing, so the closing dialog keeps its content.
  const [target, setTarget] = useState<{
    kind: CreateNodeKind
    parentId: string | null
  }>({ kind: "folder", parentId: null })
  const createdIdRef = useRef<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<NodeSummary | null>(null)
  const nextActiveRef = useRef<string | null>(null)

  function openDialog(kind: CreateNodeKind) {
    createdIdRef.current = null
    setTarget({ kind, parentId: parentForNewNode(store.getState(), rows) })
    setOpen(true)
  }

  function handleCreated(node: NodeSummary) {
    createdIdRef.current = node.id
    setOpen(false)
  }

  function requestDelete(id: string) {
    const node = store.getState().nodesById.get(id)

    if (!node) return

    nextActiveRef.current = null
    setDeleteTarget(node)
    setDeleteOpen(true)
  }

  useImperativeHandle(ref, () => ({ requestDelete }))

  /** Picks the neighbouring row from the rows before the delete, then activates it. */
  async function deleteNode(node: NodeSummary) {
    const next = rowAfterDelete(rows, node.id)

    await mutations.deleteNode(node.id)
    store.getState().setActive(next)
    nextActiveRef.current = next
    setDeleteOpen(false)
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="New folder"
        title="New folder"
        onClick={() => openDialog("folder")}
      >
        <FolderPlusIcon aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="New file"
        title="New file"
        onClick={() => openDialog("file")}
      >
        <FilePlusIcon aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Delete"
        title="Delete"
        disabled={!canDelete}
        onClick={() => {
          const { activeId } = store.getState()

          if (activeId !== null) requestDelete(activeId)
        }}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
      <CreateNodeDialog
        open={open}
        kind={target.kind}
        parentId={target.parentId}
        onOpenChange={setOpen}
        onCreated={handleCreated}
        finalFocus={() =>
          createdIdRef.current === null ? true : revealRow(createdIdRef.current)
        }
      />
      {deleteTarget ? (
        <DeleteNodeDialog
          open={deleteOpen}
          node={deleteTarget}
          onOpenChange={setDeleteOpen}
          onDelete={deleteNode}
          finalFocus={() =>
            nextActiveRef.current === null
              ? true
              : revealRow(nextActiveRef.current)
          }
        />
      ) : null}
    </>
  )
}
