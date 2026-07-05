/**
 * URL classification and cleanup for asset references.
 *
 * The recurring question when walking a config is "is this a path I own, or
 * something external/ephemeral I must not persist?" These predicates answer
 * it consistently instead of each call site re-deriving prefix checks.
 */

/** `http://`, `https://`, or protocol-relative `//`. */
export function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("//")
}

/** A `data:` URL (inline content, safe to persist but not a path). */
export function isDataUrl(value: string): boolean {
  return value.startsWith("data:")
}

/** A `blob:` URL. Only valid in the document that created it; never persist. */
export function isBlobUrl(value: string): boolean {
  return value.startsWith("blob:")
}

/**
 * Anything that is not a plain relative path: remote, protocol-relative,
 * `data:`, or `blob:`. When this is true, path normalisation does not apply.
 */
export function isExternalUrl(value: string): boolean {
  return isRemoteUrl(value) || isDataUrl(value) || isBlobUrl(value)
}

/** Remove the query string and fragment from a path or URL, keeping the rest. */
export function stripQueryAndHash(value: string): string {
  const cut = value.search(/[?#]/)
  return cut === -1 ? value : value.slice(0, cut)
}

/**
 * Percent-encode a relative path for use in a URL, one segment at a time
 * (`/` separators are kept). Already-encoded input is decoded first, so the
 * function is idempotent and never double-encodes: `a b.png` → `a%20b.png`,
 * and `a%20b.png` → `a%20b.png`. A segment that only looks encoded (a
 * literal `%` not followed by hex) is encoded as-is.
 */
export function encodePathForUrl(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      let decoded = segment
      try {
        decoded = decodeURIComponent(segment)
      } catch {
        // not valid percent-encoding: treat as a literal
      }
      return encodeURIComponent(decoded)
    })
    .join("/")
}
