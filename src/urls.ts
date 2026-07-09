/**
 * URL classification and cleanup for asset references.
 *
 * The recurring question when walking a config is "is this a path I own, or
 * something external/ephemeral I must not persist?" These predicates answer
 * it consistently instead of each call site re-deriving prefix checks.
 */

export interface UrlOptions {
  /**
   * Extra hosts to treat as remote even when the value carries no scheme.
   * Backends hand out bare host references (`abc-123.convex.cloud/img/a.png`)
   * that look exactly like a relative path. Normalising one lowercases and
   * hyphenates the host, and the reference is lost.
   *
   * A host matches itself and any subdomain: `"convex.cloud"` covers
   * `abc-123.convex.cloud`. Leading dots are accepted (`".convex.cloud"`).
   */
  hosts?: readonly string[]
}

/** Query keys that mean the URL carries a credential and will expire. */
const SIGNED_QUERY = /[?&](x-amz-[a-z-]+|token|signature|expires)=/i

const hostOf = (value: string): string =>
  value.split(/[/?#]/, 1)[0]!.toLowerCase()

const matchesHost = (value: string, hosts: readonly string[] = []): boolean => {
  if (hosts.length === 0) return false
  const host = hostOf(value)
  if (host === "") return false
  return hosts.some((entry) => {
    const h = entry.replace(/^\./, "").toLowerCase()
    return h !== "" && (host === h || host.endsWith(`.${h}`))
  })
}

/**
 * `http://`, `https://`, protocol-relative `//`, or a bare host listed in
 * `options.hosts`.
 */
export function isRemoteUrl(value: string, options: UrlOptions = {}): boolean {
  if (/^https?:\/\//i.test(value) || value.startsWith("//")) return true
  return matchesHost(value, options.hosts)
}

/**
 * True when the URL carries a short-lived credential in its query (`X-Amz-*`,
 * `token`, `signature`, `expires`).
 *
 * Persisting one of these into a config produces a reference that works in the
 * session that created it and 403s for everyone after it expires. Detect and
 * refuse them at the save boundary.
 */
export function isSignedUrl(value: string): boolean {
  return SIGNED_QUERY.test(value)
}

/**
 * True when the value must not be persisted as an asset reference: it is
 * either scoped to the current document (`blob:`) or carries an expiring
 * credential. `data:` URLs are inline content and are safe to persist.
 */
export function isTransientUrl(value: string): boolean {
  return isBlobUrl(value) || isSignedUrl(value)
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
 * `data:`, `blob:`, or a bare host from `options.hosts`. When this is true,
 * path normalisation does not apply.
 */
export function isExternalUrl(value: string, options: UrlOptions = {}): boolean {
  return isRemoteUrl(value, options) || isDataUrl(value) || isBlobUrl(value)
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
