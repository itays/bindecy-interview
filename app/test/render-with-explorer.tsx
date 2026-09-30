import { render } from "@testing-library/react"
import type { RenderResult } from "@testing-library/react"
import type { ReactElement } from "react"

import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import { createMockFileExplorerApi } from "~/features/file-explorer/api/mock/mock-file-explorer-api"
import { ExplorerProvider } from "~/features/file-explorer/state/explorer-provider"

export type RenderWithExplorerOptions = {
  /** Defaults to the default-seed mock with zero latency. */
  api?: FileExplorerApi
}

/** Renders `ui` inside an `ExplorerProvider` and returns the API it uses. */
export function renderWithExplorer(
  ui: ReactElement,
  {
    api = createMockFileExplorerApi({ latency: 0 }),
  }: RenderWithExplorerOptions = {}
): RenderResult & { api: FileExplorerApi } {
  return {
    ...render(<ExplorerProvider api={api}>{ui}</ExplorerProvider>),
    api,
  }
}
