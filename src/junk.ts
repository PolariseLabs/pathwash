import { normalisePath } from "./normalise.js"

/**
 * OS metadata that archive tools bundle in but no deploy target wants:
 *
 * - `__MACOSX/`: resource-fork shadow tree written by macOS Archive Utility
 * - `._*`: AppleDouble sidecar files (any directory level)
 * - `.DS_Store`: Finder view state
 * - `Thumbs.db`, `desktop.ini`: Windows Explorer metadata
 */
export function isJunkPath(path: string): boolean {
  const p = normalisePath(path)
  if (p === "") return false
  const segments = p.split("/").filter(Boolean)
  return segments.some(
    (s) =>
      s === "__MACOSX" ||
      s.startsWith("._") ||
      s === ".DS_Store" ||
      s.toLowerCase() === "thumbs.db" ||
      s.toLowerCase() === "desktop.ini",
  )
}
