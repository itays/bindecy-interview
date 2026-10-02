import { createContext, use, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"

import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import { parseMockConfig } from "~/features/file-explorer/api/mock/mock-config"
import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import { createExplorerStore } from "./explorer-store"
import type {
  ExplorerState,
  ExplorerStore,
  ExplorerStoreApi,
} from "./explorer-store"
import { createLoader } from "./loader"
import type { Loader } from "./loader"
import { createMutations } from "./mutations"
import type { ExplorerMutations } from "./mutations"
import { flattenVisibleRows } from "./visible-rows"
import type { Row } from "./visible-rows"

type ExplorerServices = {
  api: FileExplorerApi
  store: ExplorerStoreApi
  loader: Loader
  mutations: ExplorerMutations
  selectVisibleRows: (state: ExplorerState) => Row[]
}

const ExplorerContext = createContext<ExplorerServices | null>(null)

/**
 * A `Loader` whose instance `dispose` ends and the next call replaces.
 * StrictMode runs the mount effect, its cleanup and the effect again; the
 * second run gets a fresh loader on the same store, which re-sends the
 * first page the disposed one left `loading`.
 */
function createRestartableLoader(
  api: FileExplorerApi,
  store: ExplorerStoreApi
): Loader {
  let current: Loader | null = null
  const instance = () => (current ??= createLoader(api, store))

  return {
    ensureChildren: (folderId) => instance().ensureChildren(folderId),
    loadMore: (folderId) => instance().loadMore(folderId),
    retry: (folderId) => instance().retry(folderId),
    applyFilters: (query) => instance().applyFilters(query),
    loadStats: () => instance().loadStats(),
    dispose: () => {
      current?.dispose()
      current = null
    },
  }
}

/** Mutations that refresh `stats` after each success; failures skip it and reach the caller. */
function withStatsRefresh(
  mutations: ExplorerMutations,
  loader: Loader
): ExplorerMutations {
  async function refreshAfter<T>(result: Promise<T>): Promise<T> {
    const value = await result
    void loader.loadStats()
    return value
  }

  return {
    createFolder: (input) => refreshAfter(mutations.createFolder(input)),
    createFile: (input) => refreshAfter(mutations.createFile(input)),
    deleteNode: (id) => refreshAfter(mutations.deleteNode(id)),
  }
}

/**
 * Selector for the visible rows that recomputes only when one of the
 * inputs of `flattenVisibleRows` changes, so selection, focus and stats
 * updates keep the same array.
 */
function createVisibleRowsSelector(): (state: ExplorerState) => Row[] {
  let last: { inputs: ExplorerState; rows: Row[] } | null = null

  return (state) => {
    if (
      last === null ||
      last.inputs.nodesById !== state.nodesById ||
      last.inputs.listings !== state.listings ||
      last.inputs.expanded !== state.expanded ||
      last.inputs.appliedQuery !== state.appliedQuery
    ) {
      last = { inputs: state, rows: flattenVisibleRows(state) }
    }

    return last.rows
  }
}

function createServices(api: FileExplorerApi): ExplorerServices {
  const store = createExplorerStore()
  const loader = createRestartableLoader(api, store)

  return {
    api,
    store,
    loader,
    mutations: withStatsRefresh(createMutations(api, store), loader),
    selectVisibleRows: createVisibleRowsSelector(),
  }
}

/** The mock backend configured by the page URL (`?seed=&nodes=&latency=&failRate=&failFirst=`). */
function createUrlConfiguredApi(): FileExplorerApi {
  return createMockFileExplorerApi(
    parseMockConfig(new URLSearchParams(window.location.search))
  )
}

export type ExplorerProviderProps = {
  /** Read once on mount; defaults to the mock backend configured by the URL. */
  api?: FileExplorerApi
  children: ReactNode
}

/**
 * Owns one explorer session: the API, store, loader and mutations are
 * created once. Mounting loads the root listing and the file counts;
 * unmounting aborts every request.
 */
export function ExplorerProvider({ api, children }: ExplorerProviderProps) {
  const [services] = useState(() =>
    createServices(api ?? createUrlConfiguredApi())
  )

  useEffect(() => {
    const { loader } = services
    void loader.ensureChildren(null)
    void loader.loadStats()
    return () => loader.dispose()
  }, [services])

  return <ExplorerContext value={services}>{children}</ExplorerContext>
}

function useServices(): ExplorerServices {
  const services = use(ExplorerContext)

  if (!services) {
    throw new Error("Explorer hooks must be used inside <ExplorerProvider>")
  }

  return services
}

/**
 * Subscribes to a slice of the store; re-renders only when the slice changes
 * shallowly. Select values, not `nodesById` or a set: shallow equality walks
 * the entries of a changed `Map` or `Set`.
 */
export function useExplorer<T>(selector: (state: ExplorerStore) => T): T {
  return useStore(useServices().store, useShallow(selector))
}

/** The rows `flattenVisibleRows` gives; the same array until one of its inputs changes. */
export function useVisibleRows(): Row[] {
  const { store, selectVisibleRows } = useServices()
  return useStore(store, selectVisibleRows)
}

/** The store itself, for reading the current state in event handlers. */
export function useExplorerStore(): ExplorerStoreApi {
  return useServices().store
}

export function useLoader(): Loader {
  return useServices().loader
}

export function useMutations(): ExplorerMutations {
  return useServices().mutations
}

export function useApi(): FileExplorerApi {
  return useServices().api
}
