export interface SlugOptions {
  /** Hard cap on the result length. Applied after cleaning, then re-trimmed. */
  maxLength?: number
  /** Returned when the input reduces to an empty string. Default "". */
  fallback?: string
}

/**
 * Lowercase URL slug: anything outside `[a-z0-9]` becomes one `-`, runs
 * collapse, edges trim. For file downloads, export names, and URL segments
 * derived from display names.
 *
 * `slugify("My Project: Final (v2)")` → `"my-project-final-v2"`
 */
export function slugify(name: string, options: SlugOptions = {}): string {
  const { maxLength, fallback = "" } = options
  let s = name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (maxLength !== undefined) s = s.slice(0, maxLength).replace(/-+$/, "")
  return s === "" ? fallback : s
}

/**
 * Case-preserving folder slug: keeps letters (either case), digits, `-`,
 * `_`, and `.`; whitespace becomes `-`; runs collapse; leading/trailing
 * `.`, `-`, `_` trim. For folder names shown back to users where casing
 * carries meaning.
 *
 * `folderSlug("Level 2: The Bridge!")` → `"Level-2-The-Bridge"`
 */
export function folderSlug(name: string, options: SlugOptions = {}): string {
  const { maxLength, fallback = "" } = options
  let s = name
    .normalize("NFC")
    .replace(/[^a-zA-Z0-9\-_. ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
  if (maxLength !== undefined) s = s.slice(0, maxLength).replace(/[-_.]+$/, "")
  return s === "" ? fallback : s
}
