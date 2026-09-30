import { useCallback, useEffect, useState } from "react"

import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import type { NodeDetail } from "~/features/file-explorer/domain/types"
import { useApi } from "~/features/file-explorer/state/explorer-provider"

/** Details kept per API instance; the least recently used one goes first. */
export const NODE_DETAIL_CACHE_SIZE = 20

export type NodeDetailState =
  | { status: "idle"; detail: null; error: null; retry: () => void }
  | { status: "loading"; detail: null; error: null; retry: () => void }
  | { status: "success"; detail: NodeDetail; error: null; retry: () => void }
  | { status: "error"; detail: null; error: Error; retry: () => void }

type Outcome =
  { status: "success"; detail: NodeDetail } | { status: "error"; error: Error }

/** The request for one selection: `attempt` goes up on each retry. */
type Request = { id: string | null; attempt: number; outcome: Outcome | null }

/** A small LRU of fetched details. Nodes are immutable and ids are never reused. */
class DetailCache {
  private readonly entries = new Map<string, NodeDetail>()

  peek(id: string): NodeDetail | undefined {
    return this.entries.get(id)
  }

  /** Marks `id` as recently used; returns whether it was cached. */
  touch(id: string): boolean {
    const detail = this.entries.get(id)
    if (detail === undefined) return false
    this.entries.delete(id)
    this.entries.set(id, detail)
    return true
  }

  set(id: string, detail: NodeDetail): void {
    this.entries.delete(id)
    this.entries.set(id, detail)
    if (this.entries.size > NODE_DETAIL_CACHE_SIZE) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
  }
}

/** One cache per API instance, so providers and tests never share details. */
const caches = new WeakMap<FileExplorerApi, DetailCache>()

function cacheFor(api: FileExplorerApi): DetailCache {
  let cache = caches.get(api)
  if (!cache) {
    cache = new DetailCache()
    caches.set(api, cache)
  }
  return cache
}

/**
 * Loads the detail of `selectedId` with `api.getNode`. A cached detail
 * shows at once; otherwise the request is aborted when the id changes or
 * the component unmounts, and an abort is never reported as an error.
 * `retry` re-sends a failed request.
 */
export function useNodeDetail(selectedId: string | null): NodeDetailState {
  const api = useApi()
  const cache = cacheFor(api)
  const [request, setRequest] = useState<Request>(() => ({
    id: selectedId,
    attempt: 0,
    outcome: null,
  }))

  // A new selection forgets the previous outcome, so re-selecting a node
  // that failed earlier loads it again instead of showing the old error.
  let current = request
  if (request.id !== selectedId) {
    current = { id: selectedId, attempt: 0, outcome: null }
    setRequest(current)
  }

  const { attempt } = current

  useEffect(() => {
    if (selectedId === null || cache.touch(selectedId)) return

    const controller = new AbortController()

    api.getNode(selectedId, controller.signal).then(
      (detail) => {
        cache.set(selectedId, detail)
        if (controller.signal.aborted) return
        setRequest((previous) =>
          previous.id === selectedId && previous.attempt === attempt
            ? { ...previous, outcome: { status: "success", detail } }
            : previous
        )
      },
      (error: unknown) => {
        const aborted =
          error instanceof DOMException && error.name === "AbortError"
        if (controller.signal.aborted || aborted) return
        const failure =
          error instanceof Error ? error : new Error(String(error))
        setRequest((previous) =>
          previous.id === selectedId && previous.attempt === attempt
            ? { ...previous, outcome: { status: "error", error: failure } }
            : previous
        )
      }
    )

    return () => controller.abort()
  }, [api, cache, selectedId, attempt])

  const retry = useCallback(() => {
    setRequest((previous) =>
      previous.outcome?.status === "error"
        ? { ...previous, attempt: previous.attempt + 1, outcome: null }
        : previous
    )
  }, [])

  if (selectedId === null) {
    return { status: "idle", detail: null, error: null, retry }
  }

  const cached = cache.peek(selectedId)
  if (cached) {
    return { status: "success", detail: cached, error: null, retry }
  }

  const { outcome } = current
  if (outcome?.status === "success") {
    return { status: "success", detail: outcome.detail, error: null, retry }
  }
  if (outcome?.status === "error") {
    return { status: "error", detail: null, error: outcome.error, retry }
  }

  return { status: "loading", detail: null, error: null, retry }
}
