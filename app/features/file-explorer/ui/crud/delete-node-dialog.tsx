import type { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { FieldError } from "~/components/ui/field"
import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type { NodeSummary } from "~/features/file-explorer/domain/types"

const countFormatter = new Intl.NumberFormat("en")

/** What goes with the node: nothing for a file, its descendant files for a folder. */
function deleteDescription(node: NodeSummary): string {
  if (node.type === "file") {
    return `Deletes ${node.name}. This can't be undone.`
  }

  if (node.fileCount === 0) {
    return `Deletes ${node.name}, which has no files. This can't be undone.`
  }

  const files = `${countFormatter.format(node.fileCount)} ${node.fileCount === 1 ? "file" : "files"}`

  return `Deletes ${node.name} and the ${files} in it. This can't be undone.`
}

type DeleteNodeConfirmProps = {
  node: NodeSummary
  onDelete: (node: NodeSummary) => Promise<void>
}

/**
 * The dialog's body, mounted only while it's open, so every opening starts
 * without a pending request or an error.
 */
function DeleteNodeConfirm({ node, onDelete }: DeleteNodeConfirmProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function confirm() {
    if (isPending) return

    setError(null)
    setIsPending(true)

    try {
      await onDelete(node)
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error.message
          : `Couldn't delete ${node.name}. Try again.`
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {node.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          {deleteDescription(node)}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error ? <FieldError>{error}</FieldError> : null}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          aria-disabled={isPending || undefined}
          onClick={confirm}
        >
          {isPending ? "Deleting…" : "Delete"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

export type DeleteNodeDialogProps = DeleteNodeConfirmProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where focus goes on close; defaults to the element that opened it. */
  finalFocus?: AlertDialogPrimitive.Popup.Props["finalFocus"]
}

/**
 * Confirms deleting `node` and, for a folder, the files in it. `onDelete`
 * runs the deletion; a rejection shows its message and keeps the dialog
 * open, and the owner closes it on success.
 */
export function DeleteNodeDialog({
  open,
  onOpenChange,
  finalFocus,
  ...confirmProps
}: DeleteNodeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent finalFocus={finalFocus}>
        <DeleteNodeConfirm {...confirmProps} />
      </AlertDialogContent>
    </AlertDialog>
  )
}
