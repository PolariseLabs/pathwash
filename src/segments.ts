import { normalisePath } from "./normalise.js"
import { splitExtension } from "./extension.js"

/**
 * The path's non-empty segments, normalised.
 *
 * Callers reach for `path.split("/")` and then filter empties, drop `.`, and
 * handle `\` themselves — or forget to. Splitting is also how you answer
 * "what folder is this under?" without the library needing to know what your
 * folders mean: `segments("levels/intro/a.png")[1]` is `"intro"`.
 *
 * `..` is preserved, so a hostile path stays visible to `hasTraversal`.
 */
export function segments(path: string): string[] {
  return normalisePath(path).split("/").filter(Boolean)
}

/**
 * Groups of paths that differ only by letter case.
 *
 * S3 and Linux are case-sensitive; macOS and Windows are not. An archive
 * carrying both `Logo.png` and `logo.png` extracts to one file locally and two
 * objects in the bucket, so the local build passes and production serves the
 * wrong bytes for one of them. Returns one group per collision, empty when
 * there are none.
 */
export function caseCollisions(paths: readonly string[]): string[][] {
  const byLowercase = new Map<string, string[]>()
  for (const path of paths) {
    const key = path.toLowerCase()
    const group = byLowercase.get(key)
    if (group) group.push(path)
    else byLowercase.set(key, [path])
  }
  return [...byLowercase.values()].filter((group) => group.length > 1)
}

/**
 * Last segment of a path. `node:path` is not available in a browser or edge
 * bundle, so this gets re-implemented as `p.split("/").pop()` everywhere, and
 * every re-implementation rediscovers the same three surprises: a trailing
 * slash yields `""`, a `..` segment is returned as a filename, and a Windows
 * separator is treated as part of the name.
 *
 * `basename("a/b/c.png")` → `"c.png"`
 * `basename("a/b/")` → `"b"`
 * `basename("a\\b\\c.png")` → `"c.png"`
 *
 * Query strings and fragments are NOT stripped: a path is not a URL. Run
 * `stripQueryAndHash` first if the input might carry one.
 */
export function basename(path: string): string {
  const segments = normalisePath(path).split("/").filter(Boolean)
  return segments.at(-1) ?? ""
}

/**
 * Everything before the last segment. `"."` when the path has no directory
 * part, matching POSIX `dirname`, so the result is always a usable path.
 *
 * `dirname("a/b/c.png")` → `"a/b"`
 * `dirname("c.png")` → `"."`
 */
export function dirname(path: string): string {
  const segments = normalisePath(path).split("/").filter(Boolean)
  return segments.length > 1 ? segments.slice(0, -1).join("/") : "."
}

/**
 * Last segment with its extension removed. The name you want when deriving a
 * title, a slug, or a sibling filename.
 *
 * `stem("a/b/hero.final.png")` → `"hero.final"`
 * `stem("a/b/.gitignore")` → `".gitignore"` (a leading dot is not an extension)
 */
export function stem(path: string): string {
  return splitExtension(basename(path)).base
}

/**
 * Join path segments with exactly one `/` between them.
 *
 * Template-literal joins (`` `${base}/${rel}` ``) produce `cdn//a.png` when the
 * base already ends in a slash, or `cdna.png` when neither side has one. Both
 * are 404s on a strict object store, and which one you get depends on data.
 *
 * Purely lexical: `..` is preserved rather than resolved (resolving it would
 * silently turn a hostile path into a plausible one — see `normalisePath`), and
 * a leading `/` on a later segment does not reset to the root the way
 * `new URL()` would. If you want URL resolution semantics, use `URL`.
 *
 * The first segment keeps its shape, so a scheme survives:
 * `joinPath("https://cdn.example.com/", "/a/", "b.png")` → `"https://cdn.example.com/a/b.png"`
 * `joinPath("", "a.png")` → `"a.png"`
 */
export function joinPath(base: string, ...segments: string[]): string {
  const head = base === "/" ? "/" : base.replace(/\/+$/, "")
  const tail = segments
    .map((s) => s.replace(/^\/+/, "").replace(/\/+$/, ""))
    .filter((s) => s !== "")
  if (head === "") return tail.join("/")
  if (head === "/") return "/" + tail.join("/")
  return tail.length === 0 ? head : `${head}/${tail.join("/")}`
}

/**
 * Join `relative` onto `root`, or return null when it would escape.
 *
 * The zip-slip footgun: an archive entry named `../../etc/passwd`, extracted
 * relative to your upload directory, lands outside it. Absolute paths, Windows
 * drive letters, and backslash separators are the same attack wearing a hat —
 * `normalisePath` folds them all into the one form this can check.
 *
 * Returns null (never throws, never silently rewrites) so the caller must
 * decide: skip the entry, or reject the archive.
 *
 * `resolveWithin("uploads", "a/b.png")` → `"uploads/a/b.png"`
 * `resolveWithin("uploads", "../../etc/passwd")` → `null`
 * `resolveWithin("uploads", "/etc/passwd")` → `"uploads/etc/passwd"` (rooted, not escaped)
 */
export function resolveWithin(root: string, relative: string): string | null {
  const rel = normalisePath(relative)
  if (rel === "") return null

  // Walk the segments, tracking depth. Depth below zero at any point means the
  // path left the root, even if a later segment would bring it back.
  let depth = 0
  const kept: string[] = []
  for (const segment of rel.split("/")) {
    if (segment === "..") {
      if (depth === 0) return null
      depth--
      kept.pop()
      continue
    }
    depth++
    kept.push(segment)
  }
  if (kept.length === 0) return null
  return joinPath(root, kept.join("/"))
}
