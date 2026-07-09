import type { SanitiseOptions } from "./types.js"
import { hasTraversal, normalisePath } from "./normalise.js"
import { sanitiseFilename, sanitisePath } from "./sanitise.js"

/**
 * Validation as a fixed point of normalisation.
 *
 * The classic failure mode with scattered normalisation is drift: a check in
 * one place, a transform in another, each updated on its own schedule, until
 * two boundaries disagree about what "clean" means and stored names stop
 * matching references.
 *
 * These predicates cannot drift because they are defined AS the normaliser:
 * a value is clean if and only if normalising it changes nothing. Update the
 * normaliser and every validator updates with it, atomically.
 *
 * The pattern they enable: sanitise once at the upload boundary, then
 * `assertCleanPath` everywhere downstream (publish, key construction,
 * config rewriting). Downstream code never re-normalises; it refuses
 * anything that is not already canonical, which surfaces the offending
 * boundary immediately instead of papering over it.
 */

/** True when the path is already in canonical normalised form. */
export function isNormalisedPath(path: string): boolean {
  return path !== "" && normalisePath(path) === path
}

/** True when the filename is already fully sanitised under the given options. */
export function isCleanFilename(name: string, options: SanitiseOptions = {}): boolean {
  return name !== "" && sanitiseFilename(name, options) === name
}

/** True when every segment of the path is already fully sanitised. */
export function isCleanPath(path: string, options: SanitiseOptions = {}): boolean {
  return path !== "" && sanitisePath(path, options) === path
}

/**
 * Throw unless the path is already canonical AND free of traversal. For
 * downstream boundaries that must never normalise.
 *
 * Traversal is checked separately because `sanitisePath` deliberately preserves
 * `..` rather than deleting it, so a hostile path is canonical-but-unsafe. This
 * is the boundary that refuses it.
 */
export function assertCleanPath(path: string, options: SanitiseOptions = {}): void {
  if (hasTraversal(path)) {
    throw new Error(
      `Path contains a traversal segment: ${JSON.stringify(path)}. ` +
        "Reject it; do not normalise it away.",
    )
  }
  if (!isCleanPath(path, options)) {
    throw new Error(
      `Path is not in canonical form: ${JSON.stringify(path)} (expected ${JSON.stringify(sanitisePath(path, options))}). ` +
        "Sanitise at the upload boundary; downstream code only validates.",
    )
  }
}
