import type { AnalyseOptions, ArchivePlan, EntryInput, SanitiseOptions } from "./types.js"
import { analyseEntries } from "./analyse.js"
import { normalisePath } from "./normalise.js"
import { sanitiseFilename, sanitisePath } from "./sanitise.js"
import { encodePathForUrl, isExternalUrl, stripQueryAndHash } from "./urls.js"
import { formatPath, stripPathPrefixes, toBare, type PathForm } from "./forms.js"
import { folderSlug, type FolderSlugOptions } from "./slug.js"
import { caseCollisions, resolveWithin } from "./segments.js"
import type { EmittedRef, PathKey } from "./brand.js"

export interface WasherConfig {
  /**
   * How to treat values that are not plain relative paths (`http(s)://`,
   * `//`, `data:`, `blob:`):
   * - "reject" (default): `clean` throws, `isClean` is false. For stores
   *   where every reference must be a path you own.
   * - "allow": passed through untouched by `clean`, accepted by `isClean`.
   *   For configs that legitimately mix hosted paths with external URLs.
   */
  externalUrls?: "reject" | "allow"
  /**
   * Extra hosts to treat as external even without a scheme. A backend that
   * hands out `abc-123.storage.example.com/img/a.png` looks exactly like a
   * relative path; normalising one hyphenates the host and destroys it.
   */
  hosts?: readonly string[]
  /**
   * Values this washer must not touch, decided by you.
   *
   * A field often carries something that is not a path at all — a CSS colour, a
   * sentinel, a proxy route with a signed query. The library cannot know what
   * those look like in your system, and should not learn: tell it here, once,
   * and every method respects it. `clean` returns them verbatim, `isClean` is
   * true, `key` and `emit` pass them through.
   */
  passthrough?: (value: string) => boolean
  /** Strip `?query` and `#hash` before cleaning paths. Default false. */
  stripQueryAndHash?: boolean
  /**
   * Build or deploy roots present in stored paths but absent from the served
   * tree (`frontend/public/`, `dist/`). Stripped by `clean`, longest first.
   */
  stripPrefixes?: readonly string[]
  /**
   * The shape `emit` produces: `"bare"` (default), `"absolute"`, or
   * `"dot-relative"`. Keys are always bare, whatever this is set to — that is
   * the point of having both.
   */
  form?: PathForm
  /**
   * Sanitise filenames to URL-safe form, not just normalise separators.
   * Pass `SanitiseOptions` to configure. Default true: a washer exists to
   * define a canonical form, and normalisation alone rarely is one.
   */
  sanitise?: boolean | SanitiseOptions
  /** Policy for `folderName`. Default: lowercase, dots collapsed. */
  folder?: FolderSlugOptions
  /** Defaults for `analyse`, merged under any per-call options. */
  analyse?: AnalyseOptions
}

export interface Washer {
  /** The resolved config, for introspection and tests. */
  readonly config: Required<
    Pick<WasherConfig, "externalUrls" | "stripQueryAndHash" | "sanitise" | "form">
  > & {
    hosts: readonly string[]
    stripPrefixes: readonly string[]
    folder: FolderSlugOptions
    analyse: AnalyseOptions
  }
  /** Canonicalise a path (or external URL, per policy). Throws on rejected external URLs. */
  clean(value: string): string
  /** True iff the value is already exactly what `clean` would return. */
  isClean(value: string): boolean
  /** Throw unless the value is already canonical, naming the canonical form. */
  assertClean(value: string): void
  /** Canonicalise a single filename (no directory part). */
  cleanFilename(name: string): string
  /**
   * The canonical lookup key: cleaned and bare, whatever `form` is.
   *
   * Two spellings of one path must land on one key, or a table keyed on one
   * misses the others and the miss is silent. Use on BOTH sides of a lookup;
   * never to name a file.
   */
  key(value: string): PathKey
  /**
   * The value to write out: cleaned, then rendered in the configured `form`.
   *
   * Emitting `absolute` is what lets a consumer resolve a reference from any
   * route depth without carrying its own normaliser.
   */
  emit(value: string): EmittedRef
  /** Canonicalise, then percent-encode for use in a URL. Passthrough values and external URLs (when allowed) pass through. */
  toUrl(value: string): string
  /** Name a directory from an authored title, per this washer's `folder` policy. */
  folderName(title: string): string
  /** Join an entry onto a root, or null when it would escape (zip-slip). */
  within(root: string, relative: string): string | null
  /** Groups of these paths that differ only by letter case. */
  caseCollisions(paths: readonly string[]): string[][]
  /** True when this washer must not touch the value (passthrough, or an allowed external URL). */
  isPassthrough(value: string): boolean
  /** Analyse archive entries with this washer's defaults (per-call options win). */
  analyse(entries: EntryInput[], options?: AnalyseOptions): ArchivePlan
}

/**
 * Build a preconfigured cleaning pipeline: policy is decided once, where the
 * washer is defined, and every boundary imports the instance instead of
 * re-passing (and eventually diverging on) options.
 *
 * The whole library is reachable from a washer, so a codebase needs exactly one
 * import and one place to change its mind. What the washer cannot know — which
 * hosts are yours, which values are not paths at all — you inject once, rather
 * than teaching the library your domain.
 *
 * ```ts
 * // conventions.ts: the single place policy lives
 * export const assetPaths = createWasher({
 *   externalUrls: "allow",
 *   hosts: ["storage.example.com"],   // scheme-less backend host
 *   passthrough: isCssColour,         // this field sometimes holds "#ff0000"
 *   stripPrefixes: ["frontend/public/", "public/"],
 *   form: "absolute",                 // emitted refs resolve from any route depth
 * })
 *
 * // upload boundary
 * const stored = assetPaths.clean(file.name)
 * // building a lookup table, and looking up in it
 * refs.set(assetPaths.key(ref.name), ref)
 * refs.get(assetPaths.key(config.image))
 * // writing the config a runtime will load
 * config.image = assetPaths.emit(ref.name)
 * // extracting an archive
 * const target = assetPaths.within("uploads", entry.path) ?? reject(entry)
 * ```
 *
 * The fixed-point contract holds per washer: `isClean(x)` is defined as
 * `clean(x) === x`, so a washer's validator can never drift from its
 * normaliser, whatever it was configured with.
 */
export function createWasher(config: WasherConfig = {}): Washer {
  const externalUrls = config.externalUrls ?? "reject"
  const hosts = config.hosts ?? []
  const strip = config.stripQueryAndHash ?? false
  const stripPrefixes = config.stripPrefixes ?? []
  const form = config.form ?? "bare"
  const sanitise = config.sanitise ?? true
  const folder: FolderSlugOptions = config.folder ?? { lowercase: true, dots: "collapse" }
  const sanitiseOptions: SanitiseOptions | null =
    sanitise === false ? null : sanitise === true ? {} : sanitise
  const analyseDefaults: AnalyseOptions = {
    ...(sanitiseOptions ? { sanitise: sanitiseOptions } : {}),
    ...config.analyse,
  }

  const isExternal = (value: string): boolean => isExternalUrl(value, { hosts })
  const isOptedOut = (value: string): boolean => config.passthrough?.(value) === true

  function isPassthrough(value: string): boolean {
    if (isOptedOut(value)) return true
    return isExternal(value) && externalUrls === "allow"
  }

  function clean(value: string): string {
    if (isOptedOut(value)) return value
    if (isExternal(value)) {
      if (externalUrls === "allow") return value
      throw new Error(`External URL not allowed here: ${JSON.stringify(value)}`)
    }
    const stripped = strip ? stripQueryAndHash(value) : value
    const rooted = stripPrefixes.length > 0 ? stripPathPrefixes(stripped, stripPrefixes) : stripped
    return sanitiseOptions ? sanitisePath(rooted, sanitiseOptions) : normalisePath(rooted)
  }

  function isClean(value: string): boolean {
    if (value === "") return false
    if (isOptedOut(value)) return true
    if (isExternal(value)) return externalUrls === "allow"
    return clean(value) === value
  }

  return {
    config: {
      externalUrls,
      hosts,
      stripQueryAndHash: strip,
      stripPrefixes,
      form,
      sanitise,
      folder,
      analyse: analyseDefaults,
    },
    clean,
    isClean,
    isPassthrough,
    assertClean(value) {
      if (!isClean(value)) {
        const expected = isExternal(value) ? "(external URLs rejected)" : JSON.stringify(clean(value))
        throw new Error(
          `Value is not in canonical form: ${JSON.stringify(value)} (expected ${expected}). ` +
            "Clean at the boundary that receives it; downstream code only validates.",
        )
      }
    },
    cleanFilename(name) {
      return sanitiseOptions ? sanitiseFilename(name, sanitiseOptions) : normalisePath(name)
    },
    key(value) {
      const out = isPassthrough(value) ? value : toBare(clean(value))
      return out as PathKey
    },
    emit(value) {
      const out = isPassthrough(value) ? value : formatPath(clean(value), form)
      return out as EmittedRef
    },
    toUrl(value) {
      if (isOptedOut(value)) return value
      const cleaned = clean(value)
      if (isExternal(cleaned)) return cleaned
      return encodePathForUrl(formatPath(cleaned, form))
    },
    folderName(title) {
      return folderSlug(title, folder)
    },
    within(root, relative) {
      return resolveWithin(root, relative)
    },
    caseCollisions(paths) {
      return caseCollisions(paths)
    },
    analyse(entries, options) {
      return analyseEntries(entries, { ...analyseDefaults, ...options })
    },
  }
}
