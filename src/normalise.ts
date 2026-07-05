/**
 * Normalise a path from any archive or upload source to a canonical
 * forward-slash relative form.
 *
 * - `\` becomes `/` (Windows tools like Articulate Storyline write zip
 *   entries as `html5\data\css\output.min.css`; treated literally, that is
 *   one filename that 404s on any POSIX host)
 * - runs of separators collapse to one
 * - `.` segments and a leading `./` are removed
 * - a leading `/` and Windows drive prefixes (`C:`) are stripped
 * - a trailing `/` is preserved, so directory markers stay recognisable
 *
 * `..` segments are NOT resolved; they are kept verbatim so `hasTraversal`
 * can flag them. Resolving them here would silently turn a hostile path into
 * a plausible one.
 */
export function normalisePath(path: string): string {
  // macOS Archive Utility stores names in NFD; a config authored on any
  // other OS references the NFC form, and the two are different byte
  // sequences on every object store and CDN.
  let p = path.normalize("NFC").replace(/\\/g, "/")
  p = p.replace(/^[a-zA-Z]:/, "")
  p = p.replace(/\/{2,}/g, "/")
  p = p.replace(/^\//, "")
  const hadTrailingSlash = p.endsWith("/")
  const segments = p.split("/").filter((s) => s !== "" && s !== ".")
  return segments.join("/") + (hadTrailingSlash && segments.length > 0 ? "/" : "")
}

/** True when the path contains a `..` segment (checked on the normalised form). */
export function hasTraversal(path: string): boolean {
  return normalisePath(path)
    .split("/")
    .some((s) => s === "..")
}

/**
 * True when the entry is a directory rather than a file.
 *
 * Catches all three shapes seen in the wild:
 * - the source says so (`isDirectory`)
 * - the name ends in `/` (or `\` before normalisation), the zip convention
 * - a zero-byte Windows marker like `html5\data\` whose normalised form has
 *   no basename left
 */
export function isDirectoryMarker(path: string, isDirectory?: boolean): boolean {
  if (isDirectory) return true
  const p = normalisePath(path)
  return p.endsWith("/") || p === ""
    ? path.trim() !== "" // an entirely empty path is "empty", not a directory
    : false
}
