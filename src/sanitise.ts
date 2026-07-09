import type { SanitiseOptions } from "./types.js"
import { normalisePath } from "./normalise.js"
import { isWindowsReservedName } from "./hazards.js"

/**
 * Make a single filename or path segment safe to serve from a URL.
 *
 * Static hosts and object stores are case-sensitive and byte-exact: a file
 * deployed as `Hero Image (Final).PNG` and referenced as
 * `hero-image-final.png` is a 404. Sanitising once at the upload boundary
 * keeps the stored name and every later reference identical by construction.
 *
 * Rules (with `lowercase: true`, the default):
 * - lowercase
 * - any run of characters outside `[a-z0-9._-]` becomes one `replacement` ("-")
 * - replacement runs collapse; replacements touching a dot or the ends are trimmed
 * - dots collapse and never lead (so no hidden or double-extension surprises)
 *
 * `sanitiseFilename("Hero Image (Final).PNG")` → `"hero-image-final.png"`
 */
export function sanitiseFilename(name: string, options: SanitiseOptions = {}): string {
  const { lowercase = true, replacement = "-", fallback = "" } = options
  let s = name.trim()
  if (lowercase) s = s.toLowerCase()
  const allowed = lowercase ? /[^a-z0-9._-]+/g : /[^a-zA-Z0-9._-]+/g
  s = s.replace(allowed, replacement)
  if (replacement !== "") {
    const r = escapeRegExp(replacement)
    s = s.replace(new RegExp(`${r}{2,}`, "g"), replacement)
    s = s.replace(new RegExp(`${r}+\\.`, "g"), ".")
    s = s.replace(new RegExp(`\\.${r}+`, "g"), ".")
    s = s.replace(new RegExp(`^${r}+|${r}+$`, "g"), "")
  }
  s = s.replace(/\.{2,}/g, ".")
  s = s.replace(/^\.+/, "")
  // Windows portability: trailing dots/spaces are silently stripped by
  // Windows (space runs were already replaced above), and reserved device
  // names (CON, NUL, COM1...) are unextractable. `_` is allowed and never
  // trimmed, so suffixing keeps the result stable.
  s = s.replace(/\.+$/, "")
  if (isWindowsReservedName(s)) {
    const dot = s.indexOf(".")
    s = dot === -1 ? `${s}_` : `${s.slice(0, dot)}_${s.slice(dot)}`
  }
  if (options.maxLength !== undefined && s.length > options.maxLength) {
    const dot = s.lastIndexOf(".")
    const ext = dot > 0 ? s.slice(dot) : ""
    const base = dot > 0 ? s.slice(0, dot) : s
    const keep = Math.max(1, options.maxLength - ext.length)
    s = base.slice(0, keep).replace(/[-_.]+$/, "") + ext
  }
  // The fallback must itself be clean, or `isCleanFilename` stops being a fixed
  // point of this function.
  return s === "" ? fallback : s
}

/**
 * Apply `sanitiseFilename` to every segment of a path, preserving structure.
 *
 * `..` segments pass through verbatim. Sanitising one would delete it (a lone
 * `..` reduces to an empty segment), silently rewriting `../../etc/passwd` into
 * the plausible-looking `etc/passwd` and making `hasTraversal` return false on
 * the result. Sanitising is not a safety check: run `hasTraversal` or
 * `assertCleanPath` to reject the path.
 */
export function sanitisePath(path: string, options: SanitiseOptions = {}): string {
  return normalisePath(path)
    .split("/")
    .map((segment) => (segment === ".." ? segment : sanitiseFilename(segment, options)))
    .filter((segment) => segment !== "")
    .join("/")
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
