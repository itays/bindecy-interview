import { CURATED_RECORDS } from "./curated-fixture"

/** Knobs of the mock backend, settable from the URL (see `parseMockConfig`). */
export type MockConfig = {
  /** Seeds the generated tree, the latency jitter and the random failures. */
  seed: number
  /** Total records in the tree, curated fixture included. */
  nodes: number
  /** Base delay in ms of every call, jittered ±50%. */
  latency: number
  /** Probability in [0, 1] that a read rejects with `ApiError("network")`. */
  failRate: number
  /**
   * Number of initial `listChildren` calls that reject with
   * `ApiError("network")`, counted as their delays end.
   */
  failFirst: number
}

export const DEFAULT_MOCK_CONFIG: MockConfig = {
  seed: 1,
  nodes: 10_000,
  latency: 250,
  failRate: 0,
  failFirst: 0,
}

type Range = { min: number; max: number; integer: boolean }

const RANGES: Record<keyof MockConfig, Range> = {
  seed: { min: -Infinity, max: Infinity, integer: true },
  nodes: { min: CURATED_RECORDS.length, max: 200_000, integer: true },
  latency: { min: 0, max: 10_000, integer: false },
  failRate: { min: 0, max: 1, integer: false },
  failFirst: { min: 0, max: 1_000, integer: true },
}

/**
 * Reads the mock config from URL params such as `?nodes=100000&latency=0`.
 * A missing, empty or non-numeric value falls back to the default; numbers
 * are truncated where a whole number is needed, then clamped to `RANGES`.
 */
export function parseMockConfig(params: URLSearchParams): MockConfig {
  const read = (field: keyof MockConfig): number => {
    const raw = params.get(field)?.trim()
    const value = raw ? Number(raw) : NaN
    if (!Number.isFinite(value)) return DEFAULT_MOCK_CONFIG[field]
    const { min, max, integer } = RANGES[field]
    return Math.min(max, Math.max(min, integer ? Math.trunc(value) : value))
  }

  return {
    seed: read("seed"),
    nodes: read("nodes"),
    latency: read("latency"),
    failRate: read("failRate"),
    failFirst: read("failFirst"),
  }
}
