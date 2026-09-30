import { ApiError } from "~/features/file-explorer/api/file-explorer-api"
import type { FileExplorerApi } from "~/features/file-explorer/api/file-explorer-api"
import { isQueryActive } from "~/features/file-explorer/domain/filters"

import { generateTree, mulberry32 } from "./generate-tree"
import { DEFAULT_MOCK_CONFIG } from "./mock-config"
import type { MockConfig } from "./mock-config"
import { createMockDb } from "./mock-db"
import { createMockMutations } from "./mock-mutations"
import { createQueryIndex } from "./mock-query-index"

/**
 * `FileExplorerApi` over the in-memory mock DB, query index and mutations.
 *
 * Every call waits a jittered `latency` first and only then touches the DB,
 * so a response reflects every mutation that finished while it was in
 * flight. The DB, index and mutations already return fresh objects, so
 * results are handed out without another copy.
 *
 * Failures are decided when a read's delay ends, so aborted reads consume
 * no `failFirst` budget. Mutations take no signal and never fail at random.
 */
export function createMockFileExplorerApi(
  config: Partial<MockConfig> = {}
): FileExplorerApi {
  const { seed, nodes, latency, failRate, failFirst } = {
    ...DEFAULT_MOCK_CONFIG,
    ...config,
  }
  const db = createMockDb(generateTree({ seed, nodes }))
  const index = createQueryIndex(db)
  const mutations = createMockMutations(db)
  // Separate streams (and not the tree's own) keep each sequence independent.
  const jitter = mulberry32(seed ^ 0x5bd1e995)
  const failureRoll = mulberry32(seed ^ 0x27d4eb2f)
  let listFailuresLeft = failFirst

  /** Waits `latency` ±50%; rejects with an `AbortError` if `signal` aborts first. */
  function delay(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError())
    if (latency === 0) return Promise.resolve()

    const ms = latency * (0.5 + jitter())
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(abortError())
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort)
        resolve()
      }, ms)
      signal?.addEventListener("abort", onAbort, { once: true })
    })
  }

  /** Throws the configured network failures for a read that finished waiting. */
  function failRead(isListChildren = false) {
    if (isListChildren && listFailuresLeft > 0) {
      listFailuresLeft--
      throw new ApiError("network", "Simulated network failure (failFirst)")
    }
    if (failureRoll() < failRate) {
      throw new ApiError("network", "Simulated network failure (failRate)")
    }
  }

  return {
    async listChildren({ folderId, query, cursor, limit }, signal) {
      await delay(signal)
      failRead(true)
      return query && isQueryActive(query)
        ? index.listChildren(folderId, query, { cursor, limit })
        : db.listChildren(folderId, { cursor, limit })
    },
    async getNode(id, signal) {
      await delay(signal)
      failRead()
      return db.getNode(id)
    },
    async search({ query, cursor, limit }, signal) {
      await delay(signal)
      failRead()
      return index.search(query, { cursor, limit })
    },
    async getStats({ query }, signal) {
      await delay(signal)
      failRead()
      return query && isQueryActive(query) ? index.stats(query) : db.stats()
    },
    async createFolder(input) {
      await delay()
      return mutations.createFolder(input)
    },
    async createFile(input) {
      await delay()
      return mutations.createFile(input)
    },
    async deleteNode(id) {
      await delay()
      return mutations.deleteNode(id)
    },
  }
}

function abortError(): DOMException {
  return new DOMException("The request was aborted.", "AbortError")
}
