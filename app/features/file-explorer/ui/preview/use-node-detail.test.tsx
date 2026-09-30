import { act, renderHook } from "@testing-library/react"
import type { RenderHookResult } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"

import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import type { NodeDetail } from "~/features/file-explorer/domain/types"
import { ExplorerProvider } from "~/features/file-explorer/state/explorer-provider"

import { NODE_DETAIL_CACHE_SIZE, useNodeDetail } from "./use-node-detail"
import type { NodeDetailState } from "./use-node-detail"

type NodeDetailHook = RenderHookResult<NodeDetailState, { id: string | null }>

type GetNodeCall = {
  id: string
  signal: AbortSignal | undefined
  resolve: (detail: NodeDetail) => void
}

function createControlledApi() {
  const calls: GetNodeCall[] = []
  const api: FileExplorerApi = {
    ...createMockFileExplorerApi({ latency: 0 }),
    getNode: (id, signal) =>
      new Promise<NodeDetail>((resolve) => {
        calls.push({ id, signal, resolve })
      }),
  }
  return { api, calls }
}

function folderDetail(id: string): NodeDetail {
  return {
    id,
    name: id,
    parentId: null,
    type: "folder",
    childCount: 0,
    fileCount: 0,
    ancestors: [],
  }
}

function renderUseNodeDetail(
  api: FileExplorerApi,
  id: string | null
): NodeDetailHook {
  return renderHook(({ id }) => useNodeDetail(id), {
    initialProps: { id },
    wrapper: ({ children }: { children: ReactNode }) => (
      <ExplorerProvider api={api}>{children}</ExplorerProvider>
    ),
  })
}

/** Selects `id` and settles its pending request. */
async function load(hook: NodeDetailHook, calls: GetNodeCall[], id: string) {
  hook.rerender({ id })
  const call = calls.at(-1)
  if (call?.id !== id) throw new Error(`no pending request for ${id}`)
  await act(async () => call.resolve(folderDetail(id)))
}

describe("useNodeDetail", () => {
  it("is idle without a selection and sends no request", () => {
    const { api, calls } = createControlledApi()
    const { result } = renderUseNodeDetail(api, null)

    expect(result.current.status).toBe("idle")
    expect(calls).toHaveLength(0)
  })

  it("keeps the most recently used details and loads an evicted one again", async () => {
    const { api, calls } = createControlledApi()
    const hook = renderUseNodeDetail(api, null)
    const ids = Array.from(
      { length: NODE_DETAIL_CACHE_SIZE + 1 },
      (_, index) => `folder-${index}`
    )

    await load(hook, calls, ids[0])
    for (const id of ids.slice(2)) await load(hook, calls, id)
    // Using folder-0 again makes folder-2 the least recently used entry.
    hook.rerender({ id: ids[0] })
    await load(hook, calls, ids[1])
    const requests = calls.length

    hook.rerender({ id: ids[0] })
    expect(hook.result.current.status).toBe("success")
    hook.rerender({ id: ids[3] })
    expect(hook.result.current.status).toBe("success")
    expect(calls).toHaveLength(requests)

    hook.rerender({ id: ids[2] })
    expect(hook.result.current.status).toBe("loading")
    expect(calls.at(-1)?.id).toBe(ids[2])
  })

  it("aborts the pending request on unmount", () => {
    const { api, calls } = createControlledApi()
    const { unmount } = renderUseNodeDetail(api, "folder-a")

    unmount()

    expect(calls[0].signal?.aborted).toBe(true)
  })

  it("doesn't share cached details between API instances", async () => {
    const first = createControlledApi()
    await load(renderUseNodeDetail(first.api, null), first.calls, "folder-a")

    const second = createControlledApi()
    const { result } = renderUseNodeDetail(second.api, "folder-a")

    expect(result.current.status).toBe("loading")
    expect(second.calls.map((call) => call.id)).toEqual(["folder-a"])
  })
})
