import type { AnalyseOptions, ArchivePlan, EntryInput, SanitiseOptions } from "./types.js"
import { analyseEntries } from "./analyse.js"
import { normalisePath } from "./normalise.js"
import { sanitiseFilename, sanitisePath } from "./sanitise.js"
import { encodePathForUrl, isExternalUrl, stripQueryAndHash } from "./urls.js"

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
  /** Strip `?query` and `#hash` before cleaning paths. Default false. */
  stripQueryAndHash?: boolean
  /**
   * Sanitise filenames to URL-safe form, not just normalise separators.
   * Pass `SanitiseOptions` to configure. Default true: a washer exists to
   * define a canonical form, and normalisation alone rarely is one.
   */
  sanitise?: boolean | SanitiseOptions
  /** Defaults for `analyse`, merged under any per-call options. */
  analyse?: AnalyseOptions
}

export interface Washer {
  /** The resolved config, for introspection and tests. */
  readonly config: Required<Pick<WasherConfig, "externalUrls" | "stripQueryAndHash" | "sanitise">> & {
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
  /** Canonicalise, then percent-encode for use in a URL. External URLs (when allowed) pass through. */
  toUrl(value: string): string
  /** Analyse archive entries with this washer's defaults (per-call options win). */
  analyse(entries: EntryInput[], options?: AnalyseOptions): ArchivePlan
}

/**
 * Build a preconfigured cleaning pipeline: options are decided once, where
 * the washer is defined, and every boundary imports the instance instead of
 * re-passing (and eventually diverging on) options.
 *
 * ```ts
 * // conventions.ts — the single place policy lives
 * export const assetPaths = createWasher({ externalUrls: "reject" })
 * export const configRefs = createWasher({ externalUrls: "allow", stripQueryAndHash: true })
 *
 * // upload boundary
 * const key = assetPaths.clean(file.name)
 * // every downstream boundary
 * assetPaths.assertClean(key)
 * ```
 *
 * The fixed-point contract holds per washer: `isClean(x)` is defined as
 * `clean(x) === x`, so a washer's validator can never drift from its
 * normaliser, whatever it was configured with.
 */
export function createWasher(config: WasherConfig = {}): Washer {
  const externalUrls = config.externalUrls ?? "reject"
  const strip = config.stripQueryAndHash ?? false
  const sanitise = config.sanitise ?? true
  const sanitiseOptions: SanitiseOptions | null =
    sanitise === false ? null : sanitise === true ? {} : sanitise
  const analyseDefaults: AnalyseOptions = {
    ...(sanitiseOptions ? { sanitise: sanitiseOptions } : {}),
    ...config.analyse,
  }

  function clean(value: string): string {
    if (isExternalUrl(value)) {
      if (externalUrls === "allow") return value
      throw new Error(`External URL not allowed here: ${JSON.stringify(value)}`)
    }
    const stripped = strip ? stripQueryAndHash(value) : value
    return sanitiseOptions ? sanitisePath(stripped, sanitiseOptions) : normalisePath(stripped)
  }

  function isClean(value: string): boolean {
    if (value === "") return false
    if (isExternalUrl(value)) return externalUrls === "allow"
    return clean(value) === value
  }

  return {
    config: { externalUrls, stripQueryAndHash: strip, sanitise, analyse: analyseDefaults },
    clean,
    isClean,
    assertClean(value) {
      if (!isClean(value)) {
        const expected = isExternalUrl(value) ? "(external URLs rejected)" : JSON.stringify(clean(value))
        throw new Error(
          `Value is not in canonical form: ${JSON.stringify(value)} (expected ${expected}). ` +
            "Clean at the boundary that receives it; downstream code only validates.",
        )
      }
    },
    cleanFilename(name) {
      return sanitiseOptions ? sanitiseFilename(name, sanitiseOptions) : normalisePath(name)
    },
    toUrl(value) {
      const cleaned = clean(value)
      return isExternalUrl(cleaned) ? cleaned : encodePathForUrl(cleaned)
    },
    analyse(entries, options) {
      return analyseEntries(entries, { ...analyseDefaults, ...options })
    },
  }
}
