import { normalisePath } from "./normalise.js"
import { isExternalUrl } from "./urls.js"

/**
 * The three shapes the same path is written in, and the source of a whole
 * class of bugs.
 *
 * One codebase stores `avatars/uk.png`, another writes `/avatars/uk.png`, a
 * third emits `./avatars/uk.png`. Each is "the path" to whoever wrote it. A
 * lookup table keyed on one form misses the other two, and the miss is silent:
 * the value passes through unresolved and 404s at runtime, or resolves against
 * the wrong base on a nested route.
 *
 * `bare` is canonical. The other two are presentations of it, applied at the
 * boundary that needs them (a `<img src>` wants `absolute`; a config consumed
 * relative to its own directory wants `dot-relative`). Keys, comparisons, and
 * storage use `bare` so they cannot disagree.
 */
export type PathForm = "bare" | "absolute" | "dot-relative"

const PREFIX: Record<PathForm, string> = {
  bare: "",
  absolute: "/",
  "dot-relative": "./",
}

/**
 * Rewrite a path into the given form, normalising it first.
 *
 * External and inline values (`http(s):`, protocol-relative `//`, `data:`,
 * `blob:`) pass through untouched: prefixing `https://cdn/x.png` with `./`
 * produces a path to nowhere, and this is where that mistake gets made.
 *
 * An empty path stays empty rather than becoming a bare `/` or `./`.
 *
 * `formatPath("/a/b.png", "bare")` -> `"a/b.png"`
 * `formatPath("a/b.png", "absolute")` -> `"/a/b.png"`
 * `formatPath("a/b.png", "dot-relative")` -> `"./a/b.png"`
 */
export function formatPath(path: string, form: PathForm): string {
  if (path === "" || isExternalUrl(path)) return path
  const bare = normalisePath(path)
  if (bare === "") return ""
  return PREFIX[form] + bare
}

/** Canonical storage and lookup-key form: no leading `/` or `./`. */
export function toBare(path: string): string {
  return formatPath(path, "bare")
}

/** Root-absolute form, for URLs that must resolve from the site root at any route depth. */
export function toAbsolute(path: string): string {
  return formatPath(path, "absolute")
}

/** Explicitly-relative form, for configs resolved against their own directory. */
export function toDotRelative(path: string): string {
  return formatPath(path, "dot-relative")
}

/**
 * True when the path is already in the given form. Defined as a fixed point of
 * `formatPath`, so it cannot drift from it (see `clean.ts`).
 */
export function isPathForm(path: string, form: PathForm): boolean {
  return path !== "" && formatPath(path, form) === path
}

/**
 * Strip a build or deploy root that is present in stored paths but absent from
 * the served tree. A file committed at `frontend/public/img/a.png` is served at
 * `img/a.png`; a config that kept the prefix points at nothing.
 *
 * Prefixes are matched against the normalised path, longest first, so
 * `frontend/public/` wins over `public/` regardless of argument order. Only one
 * prefix is stripped. Matching is case-sensitive: object stores are.
 *
 * `stripPathPrefixes("./frontend/public/img/a.png", ["public/", "frontend/public/"])`
 *   -> `"img/a.png"`
 */
export function stripPathPrefixes(path: string, prefixes: readonly string[]): string {
  if (path === "" || isExternalUrl(path)) return path
  const bare = normalisePath(path)
  const ordered = [...prefixes]
    .map((p) => normalisePath(p))
    .filter((p) => p !== "")
    .sort((a, b) => b.length - a.length)
  for (const prefix of ordered) {
    const withSlash = prefix.endsWith("/") ? prefix : `${prefix}/`
    if (bare.startsWith(withSlash)) return bare.slice(withSlash.length)
  }
  return bare
}
