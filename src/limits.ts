import type { EntryInput } from "./types.js"

/**
 * Resource-exhaustion guards for archives ("zip bombs"). A hostile zip can
 * declare a handful of kilobytes compressed and expand to gigabytes, or list
 * millions of entries. These checks run on entry metadata alone, before any
 * bytes are decompressed, so they belong immediately after listing entries
 * and before extraction.
 */
export interface ArchiveLimits {
  /** Maximum number of entries. Default 10,000. */
  maxEntries?: number
  /** Maximum total uncompressed bytes across all entries. Default 2 GiB. */
  maxTotalBytes?: number
  /** Maximum uncompressed bytes for a single entry. Default 1 GiB. */
  maxEntryBytes?: number
  /**
   * Maximum uncompressed/compressed ratio for a single entry (only checked
   * when both sizes are known and compressed size is above 1 KiB, so tiny
   * highly-compressible files do not false-positive). Default 200.
   */
  maxCompressionRatio?: number
}

export const DEFAULT_ARCHIVE_LIMITS: Required<ArchiveLimits> = {
  maxEntries: 10_000,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  maxEntryBytes: 1024 * 1024 * 1024,
  maxCompressionRatio: 200,
}

export type LimitViolationCode =
  | "too-many-entries"
  | "total-too-large"
  | "entry-too-large"
  | "compression-ratio"

export interface LimitViolation {
  code: LimitViolationCode
  /** The offending entry path, or null for archive-wide violations. */
  path: string | null
  /** The measured value that exceeded the limit. */
  value: number
  limit: number
}

/**
 * Check declared entry sizes against limits. Pure metadata arithmetic:
 * pass `bytes` (uncompressed) and `compressedBytes` from your zip reader's
 * entry headers. Entries without size metadata are skipped by the size
 * checks (only the entry count still applies), so results are only as
 * trustworthy as the metadata you can supply.
 */
export function checkArchiveLimits(
  entries: Pick<EntryInput, "path" | "bytes" | "compressedBytes">[],
  limits: ArchiveLimits = {},
): { ok: boolean; violations: LimitViolation[] } {
  const l = { ...DEFAULT_ARCHIVE_LIMITS, ...limits }
  const violations: LimitViolation[] = []

  if (entries.length > l.maxEntries) {
    violations.push({ code: "too-many-entries", path: null, value: entries.length, limit: l.maxEntries })
  }

  let total = 0
  for (const entry of entries) {
    if (entry.bytes === undefined) continue
    total += entry.bytes
    if (entry.bytes > l.maxEntryBytes) {
      violations.push({ code: "entry-too-large", path: entry.path, value: entry.bytes, limit: l.maxEntryBytes })
    }
    if (entry.compressedBytes !== undefined && entry.compressedBytes > 1024) {
      const ratio = entry.bytes / entry.compressedBytes
      if (ratio > l.maxCompressionRatio) {
        violations.push({ code: "compression-ratio", path: entry.path, value: Math.round(ratio), limit: l.maxCompressionRatio })
      }
    }
  }
  if (total > l.maxTotalBytes) {
    violations.push({ code: "total-too-large", path: null, value: total, limit: l.maxTotalBytes })
  }

  return { ok: violations.length === 0, violations }
}
