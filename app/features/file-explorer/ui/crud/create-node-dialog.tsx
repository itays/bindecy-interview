import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { useId, useRef, useState } from "react"
import type { FormEvent, RefObject } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select"
import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import { PREVIEW_URLS } from "~/features/file-explorer/api/mock/curated-fixture"
import { parseSizeInMb } from "~/features/file-explorer/domain/filters"
import type {
  FileCategory,
  NodeSummary,
} from "~/features/file-explorer/domain/types"
import {
  useExplorer,
  useLoader,
  useMutations,
} from "~/features/file-explorer/state/explorer-provider"

import { fileCategoryDetails } from "../file-category-details"

export type CreateNodeKind = NodeSummary["type"]

type Draft = {
  name: string
  category: FileCategory
  sizeMb: string
  previewUrl: string
}

type DraftField = "name" | "sizeMb" | "previewUrl"

type FieldErrors = Partial<Record<DraftField, string>>

/** Fields in form order, so the first invalid one takes focus. */
const DRAFT_FIELDS: readonly DraftField[] = ["name", "sizeMb", "previewUrl"]

const EMPTY_DRAFT: Draft = {
  name: "",
  category: "doc",
  sizeMb: "",
  previewUrl: "",
}

const CATEGORIES = Object.keys(fileCategoryDetails) as FileCategory[]

type ParsedDraft = {
  errors: FieldErrors
  name: string
  sizeInBytes: number
  previewUrl: string
}

/** An absolute `http:` or `https:` URL; relative paths don't count. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

/** Whole bytes for the API, or the size field's error. */
function parseSize(value: string): { sizeInBytes: number; error?: string } {
  if (value.trim() === "") {
    return { sizeInBytes: 0, error: "Enter a size in megabytes." }
  }

  const parsed = parseSizeInMb(value)

  if (parsed.error !== null || parsed.sizeInBytes === null) {
    return { sizeInBytes: 0, error: parsed.error ?? undefined }
  }

  const sizeInBytes = Math.round(parsed.sizeInBytes)

  return Number.isSafeInteger(sizeInBytes)
    ? { sizeInBytes }
    : { sizeInBytes: 0, error: "Enter a smaller size." }
}

/**
 * The trimmed values the API receives, plus an error per invalid field. A
 * folder has only a name; a blank preview URL takes the category's sample.
 */
function parseDraft(kind: CreateNodeKind, draft: Draft): ParsedDraft {
  const errors: FieldErrors = {}
  const name = draft.name.trim()

  if (name === "") {
    errors.name = "Enter a name."
  }

  if (kind === "folder") {
    return { errors, name, sizeInBytes: 0, previewUrl: "" }
  }

  const size = parseSize(draft.sizeMb)
  const previewUrl = draft.previewUrl.trim()

  if (size.error) {
    errors.sizeMb = size.error
  }

  if (previewUrl !== "" && !isHttpUrl(previewUrl)) {
    errors.previewUrl = "Enter a URL that starts with http:// or https://."
  }

  return {
    errors,
    name,
    sizeInBytes: size.sizeInBytes,
    previewUrl: previewUrl || PREVIEW_URLS[draft.category][0],
  }
}

function DraftTextField({
  id,
  label,
  value,
  error,
  hint,
  inputRef,
  inputMode,
  onChange,
}: {
  id: string
  label: string
  value: string
  error: string | undefined
  hint?: string
  inputRef: RefObject<HTMLInputElement | null>
  inputMode?: "decimal" | "url"
  onChange: (value: string) => void
}) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        ref={inputRef}
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={value}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && !error ? (
        <FieldDescription id={hintId}>{hint}</FieldDescription>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  )
}

type CreateNodeFormProps = {
  kind: CreateNodeKind
  parentId: string | null
  onCreated: (node: NodeSummary) => void
}

/**
 * The dialog's body, mounted only while it's open, so every opening starts
 * from an empty draft.
 */
function CreateNodeForm({ kind, parentId, onCreated }: CreateNodeFormProps) {
  const loader = useLoader()
  const mutations = useMutations()
  const parentName = useExplorer((state) =>
    parentId === null ? null : (state.nodesById.get(parentId)?.name ?? null)
  )
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const sizeRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<HTMLInputElement>(null)
  const fieldRefs: Record<DraftField, RefObject<HTMLInputElement | null>> = {
    name: nameRef,
    sizeMb: sizeRef,
    previewUrl: previewUrlRef,
  }
  const idPrefix = useId()
  const fieldId = (field: DraftField | "category") => `${idPrefix}-${field}`

  function change(field: DraftField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors(({ [field]: _cleared, ...rest }) => rest)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isPending) return

    const parsed = parseDraft(kind, draft)
    const invalidField = DRAFT_FIELDS.find((field) => parsed.errors[field])

    setErrors(parsed.errors)
    setFormError(null)

    if (invalidField) {
      fieldRefs[invalidField].current?.focus()
      return
    }

    setIsPending(true)

    try {
      // With the parent's first page loaded, the store lists the new node
      // at once, so its row exists when focus returns to the tree.
      await loader.ensureChildren(parentId)
      onCreated(
        kind === "folder"
          ? await mutations.createFolder({ parentId, name: parsed.name })
          : await mutations.createFile({
              parentId,
              name: parsed.name,
              category: draft.category,
              sizeInBytes: parsed.sizeInBytes,
              previewUrl: parsed.previewUrl,
            })
      )
    } catch (error) {
      if (error instanceof ApiError && error.code === "conflict") {
        setErrors({ name: error.message })
        fieldRefs.name.current?.focus()
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
            : `Couldn't create the ${kind}. Try again.`
        )
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form noValidate className="grid gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>
          {kind === "folder" ? "New folder" : "New file"}
        </DialogTitle>
        <DialogDescription>
          {parentId === null
            ? `Adds a ${kind} at the top level.`
            : `Adds a ${kind} to ${parentName ?? "the selected folder"}.`}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <DraftTextField
          id={fieldId("name")}
          label="Name"
          value={draft.name}
          error={errors.name}
          inputRef={fieldRefs.name}
          onChange={(value) => change("name", value)}
        />
        {kind === "file" ? (
          <>
            <Field>
              <FieldLabel htmlFor={fieldId("category")}>Category</FieldLabel>
              <NativeSelect
                id={fieldId("category")}
                className="w-full"
                value={draft.category}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value as FileCategory,
                  }))
                }
              >
                {CATEGORIES.map((category) => (
                  <NativeSelectOption key={category} value={category}>
                    {fileCategoryDetails[category].label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <DraftTextField
              id={fieldId("sizeMb")}
              label="Size (MB)"
              value={draft.sizeMb}
              error={errors.sizeMb}
              inputRef={fieldRefs.sizeMb}
              inputMode="decimal"
              onChange={(value) => change("sizeMb", value)}
            />
            <DraftTextField
              id={fieldId("previewUrl")}
              label="Preview URL (optional)"
              value={draft.previewUrl}
              error={errors.previewUrl}
              hint={`Leave blank to use a sample ${fileCategoryDetails[draft.category].label.toLowerCase()} preview.`}
              inputRef={fieldRefs.previewUrl}
              inputMode="url"
              onChange={(value) => change("previewUrl", value)}
            />
          </>
        ) : null}
      </FieldGroup>
      {formError ? <FieldError>{formError}</FieldError> : null}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" aria-disabled={isPending || undefined}>
          {isPending ? "Creating…" : `Create ${kind}`}
        </Button>
      </DialogFooter>
    </form>
  )
}

export type CreateNodeDialogProps = CreateNodeFormProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where focus goes on close; defaults to the element that opened it. */
  finalFocus?: DialogPrimitive.Popup.Props["finalFocus"]
}

/**
 * Creates a folder or file in `parentId` (`null` = the top level). Fields
 * are checked on submit; a duplicate name from the API shows on the name
 * field, and other API errors below the fields. `onCreated` runs once the
 * store holds the new node, which is then active (and selected for a file).
 */
export function CreateNodeDialog({
  open,
  onOpenChange,
  finalFocus,
  ...formProps
}: CreateNodeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent finalFocus={finalFocus}>
        <CreateNodeForm {...formProps} />
      </DialogContent>
    </Dialog>
  )
}
