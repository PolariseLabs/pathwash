/**
 * Find an unused variant of a filename: `file.png`, `file-1.png`,
 * `file-2.png`... The counter goes before the extension so the file type
 * survives.
 *
 * Dedupe AFTER cleaning: two different originals can sanitise to the same
 * name (`Hero Image.PNG` and `hero image.png` both become
 * `hero-image.png`), so checking uniqueness on the raw name misses the
 * collision that actually happens in storage.
 */
export function dedupeName(
  name: string,
  taken: Iterable<string> | ((candidate: string) => boolean),
  options: { separator?: string } = {},
): string {
  const { separator = "-" } = options
  const isTaken =
    typeof taken === "function" ? taken : (set => (c: string) => set.has(c))(new Set(taken))
  if (!isTaken(name)) return name
  const dot = name.lastIndexOf(".")
  const hasExt = dot > 0 && dot < name.length - 1
  const base = hasExt ? name.slice(0, dot) : name
  const ext = hasExt ? name.slice(dot) : ""
  for (let i = 1; ; i++) {
    const candidate = `${base}${separator}${i}${ext}`
    if (!isTaken(candidate)) return candidate
  }
}
