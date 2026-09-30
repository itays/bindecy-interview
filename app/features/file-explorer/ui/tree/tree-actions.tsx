import { FilePlusIcon, FolderPlusIcon } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "~/components/ui/button"
import type { NodeSummary } from "~/features/file-explorer/domain/types"
import {
  useExplorerStore,
  useVisibleRows,
} from "~/features/file-explorer/state/explorer-provider"
import type { ExplorerState } from "~/features/file-explorer/state/explorer-store"
import type { Row } from "~/features/file-explorer/state/visible-rows"

import { CreateNodeDialog } from "../crud/create-node-dialog"
import type { CreateNodeKind } from "../crud/create-node-dialog"
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
 * Scrolls the created node's row into view and returns the tree to focus.
 * The active row is always rendered; when the node isn't a visible row
 * (hidden by the filters, or past the loaded pages), focus goes back to
 * the button that opened the dialog.
 */
function revealCreatedRow(id: string): HTMLElement | true {
  const row = document.getElementById(treeRowId(id))

  row?.scrollIntoView({ block: "nearest" })

  return row?.closest<HTMLElement>('[role="tree"]') ?? true
}

/** "New folder" and "New file" in the tree panel header, acting on the active row. */
export function TreeActions() {
  const store = useExplorerStore()
  const rows = useVisibleRows()
  const [open, setOpen] = useState(false)
  // Kept after closing, so the closing dialog keeps its content.
  const [target, setTarget] = useState<{
    kind: CreateNodeKind
    parentId: string | null
  }>({ kind: "folder", parentId: null })
  const createdIdRef = useRef<string | null>(null)

  function openDialog(kind: CreateNodeKind) {
    createdIdRef.current = null
    setTarget({ kind, parentId: parentForNewNode(store.getState(), rows) })
    setOpen(true)
  }

  function handleCreated(node: NodeSummary) {
    createdIdRef.current = node.id
    setOpen(false)
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
      <CreateNodeDialog
        open={open}
        kind={target.kind}
        parentId={target.parentId}
        onOpenChange={setOpen}
        onCreated={handleCreated}
        finalFocus={() =>
          createdIdRef.current === null
            ? true
            : revealCreatedRow(createdIdRef.current)
        }
      />
    </>
  )
}
