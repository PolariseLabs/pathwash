export interface SlugOptions {
  /** Hard cap on the result length. Applied after cleaning, then re-trimmed. */
  maxLength?: number
  /** Returned when the input reduces to an empty string. Default "". */
  fallback?: string
}

export interface FolderSlugOptions extends SlugOptions {
  /**
   * Lowercase the result. Default false: folder names are shown back to users
   * and casing carries meaning.
   *
   * Set true only where the slug is a lookup key or a deployed directory name.
   * Changing this on an existing system renames directories, so already-deployed
   * trees stop matching: `"My-Game"` and `"my-game"` are different paths on any
   * case-sensitive object store.
   */
  lowercase?: boolean
  /**
   * What to do with a `.` inside the name. Default "keep".
   *
   * A directory is not a file, and a dot in one buys nothing: no host needs it,
   * and some tooling treats a dotted path segment as a file, an extension, or
   * (leading) a hidden entry. "collapse" turns each run into one `-`, so a
   * directory name can never be mistaken for a filename.
   *
   * A leading dot is always trimmed regardless, under either setting: a
   * `.hidden/` directory is not served by most static hosts.
   */
  dots?: "keep" | "collapse"
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
 * `folderSlug("v1.2 Intro", { dots: "collapse" })` → `"v1-2-Intro"`
 *
 * Note `_` is preserved. A deployed directory named from an authored title has
 * to match whatever else references it — a config `src`, an iframe URL — and
 * those keep their underscores. Silently rewriting `my_level/` to `my-level/`
 * is how a level 404s at runtime with no warning.
 */
export function folderSlug(name: string, options: FolderSlugOptions = {}): string {
  const { maxLength, fallback = "", lowercase = false, dots = "keep" } = options
  let s = name
    .normalize("NFC")
    .replace(/[^a-zA-Z0-9\-_. ]+/g, "")
    .replace(/\s+/g, "-")
  if (dots === "collapse") s = s.replace(/\.+/g, "-")
  s = s.replace(/-{2,}/g, "-").replace(/^[-_.]+|[-_.]+$/g, "")
  if (lowercase) s = s.toLowerCase()
  if (maxLength !== undefined) s = s.slice(0, maxLength).replace(/[-_.]+$/, "")
  return s === "" ? fallback : s
}
