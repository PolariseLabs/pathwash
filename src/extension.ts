/**
 * Split a path into its basename-without-extension and lowercase extension.
 * The extension excludes the dot; "" when there is none. Dotfiles
 * (`.gitignore`) and trailing dots do not count as extensions.
 */
export function splitExtension(path: string): { base: string; extension: string } {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  const name = path.slice(slash + 1)
  const dot = name.lastIndexOf(".")
  if (dot <= 0 || dot === name.length - 1) return { base: path, extension: "" }
  return { base: path.slice(0, slash + 1 + dot), extension: name.slice(dot + 1).toLowerCase() }
}

/** Lowercase extension without the dot, or "" when there is none. */
export function getExtension(path: string): string {
  return splitExtension(path).extension
}
