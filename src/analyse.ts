import type {
  AnalyseOptions,
  ArchivePlan,
  EntryInput,
  PlannedEntry,
  RejectedEntry,
  SkippedEntry,
} from "./types.js"
import { caseCollisions } from "./segments.js"
import { hasTraversal, isDirectoryMarker, normalisePath } from "./normalise.js"
import { isJunkPath } from "./junk.js"
import { sanitisePath } from "./sanitise.js"
import { collectWarnings } from "./hazards.js"

/**
 * Turn a raw entry list from any archive or upload into a cleaning plan.
 *
 * Pure and read-only: nothing is extracted or renamed here. The caller maps
 * `plan.entries` (`from` → `to`) over its own zip reader or file list, and
 * decides its own policy for `plan.rejected` (typically: refuse the archive).
 */
export function analyseEntries(entries: EntryInput[], options: AnalyseOptions = {}): ArchivePlan {
  const {
    stripCommonRoot = true,
    filterJunk = true,
    sanitise = false,
    onCollision = "reject",
  } = options

  const skipped: SkippedEntry[] = []
  const rejected: RejectedEntry[] = []
  const files: PlannedEntry[] = []

  for (const entry of entries) {
    const normalised = normalisePath(entry.path)
    if (entry.path.trim() === "" || normalised === "") {
      skipped.push({ path: entry.path, reason: "empty" })
      continue
    }
    if (filterJunk && isJunkPath(entry.path)) {
      skipped.push({ path: entry.path, reason: "junk" })
      continue
    }
    if (isDirectoryMarker(entry.path, entry.isDirectory)) {
      skipped.push({ path: entry.path, reason: "directory" })
      continue
    }
    if (hasTraversal(entry.path)) {
      rejected.push({ path: entry.path, reason: "traversal" })
      continue
    }
    if (entry.isSymlink) {
      rejected.push({ path: entry.path, reason: "symlink" })
      continue
    }
    files.push({ from: entry.path, to: normalised })
  }

  let commonRoot: string | null = null
  if (stripCommonRoot) {
    const strippedSegments: string[] = []
    // Unwrap repeatedly: a Storyline export often nests everything under
    // `my-export/`, and sometimes under `my-export/html5/` too.
    for (;;) {
      const root = sharedFirstSegment(files.map((f) => f.to))
      if (root === null) break
      strippedSegments.push(root)
      for (const f of files) f.to = f.to.slice(root.length + 1)
    }
    if (strippedSegments.length > 0) commonRoot = strippedSegments.join("/")
  }

  if (sanitise) {
    const sanitiseOptions = sanitise === true ? {} : sanitise
    for (const f of files) f.to = sanitisePath(f.to, sanitiseOptions)
  }

  const taken = new Map<string, PlannedEntry>()
  const planned: PlannedEntry[] = []
  for (const f of files) {
    const existing = taken.get(f.to)
    if (!existing) {
      taken.set(f.to, f)
      planned.push(f)
      continue
    }
    if (onCollision === "first-wins") {
      skipped.push({ path: f.from, reason: "duplicate" })
      continue
    }
    if (onCollision === "last-wins") {
      planned[planned.indexOf(existing)] = f
      taken.set(f.to, f)
      continue
    }
    rejected.push({ path: f.from, reason: "collision", collidesWith: existing.from })
  }

  const collisions = caseCollisions(planned.map((f) => f.to))
  const warnings = collectWarnings(planned.map((f) => f.to))

  return { entries: planned, skipped, rejected, commonRoot, caseCollisions: collisions, warnings }
}

/**
 * The first path segment shared by every path, or null when there is none.
 * Never strips a bare filename: every path must still contain a `/`.
 */
function sharedFirstSegment(paths: string[]): string | null {
  if (paths.length === 0) return null
  let root: string | null = null
  for (const p of paths) {
    const slash = p.indexOf("/")
    if (slash === -1) return null
    const first = p.slice(0, slash)
    if (root === null) root = first
    else if (root !== first) return null
  }
  return root
}
