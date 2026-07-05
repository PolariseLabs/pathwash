import type { PlanWarning, WarningCode } from "./types.js"

/**
 * Windows reserved device names. A file named `con.txt` (any case, any
 * extension) cannot be created on Windows; extraction fails or hangs.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\.|$)/i

export function isWindowsReservedName(segment: string): boolean {
  return WINDOWS_RESERVED.test(segment)
}

/** Windows silently strips trailing dots and spaces on extract, changing the path. */
export function hasTrailingDotOrSpace(segment: string): boolean {
  return /[. ]$/.test(segment)
}

const MAX_PATH_LENGTH = 260
const MAX_SEGMENT_LENGTH = 255

/** Portability hazards in an already-normalised output path. */
export function findPathHazards(path: string): WarningCode[] {
  const codes = new Set<WarningCode>()
  for (const segment of path.split("/")) {
    if (isWindowsReservedName(segment)) codes.add("windows-reserved-name")
    if (hasTrailingDotOrSpace(segment)) codes.add("trailing-dot-or-space")
    if (segment.length > MAX_SEGMENT_LENGTH) codes.add("long-path")
  }
  if (path.length > MAX_PATH_LENGTH) codes.add("long-path")
  return [...codes]
}

export function collectWarnings(paths: string[]): PlanWarning[] {
  const warnings: PlanWarning[] = []
  for (const path of paths) {
    for (const code of findPathHazards(path)) warnings.push({ path, code })
  }
  return warnings
}
