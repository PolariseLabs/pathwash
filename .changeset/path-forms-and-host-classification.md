---
"@polarise/pathwash": minor
---

Add path forms, prefix stripping, and extensible URL classification.

`formatPath(path, form)` converts a path between the three shapes the same
path gets written in (`bare`, `absolute`, `dot-relative`), with `toBare`,
`toAbsolute`, and `toDotRelative` as shorthands. `bare` is canonical: keys and
comparisons use it, so a table keyed on one spelling cannot miss the other two.
`isPathForm` validates as a fixed point of `formatPath`. External and inline
values (`http(s):`, `//`, `data:`, `blob:`) pass through untouched.

`stripPathPrefixes(path, prefixes)` removes a build or deploy root
(`frontend/public/`, `public/`) that is present in stored paths but absent from
the served tree, matching the longest prefix first.

`isRemoteUrl` and `isExternalUrl` take an optional `hosts` list, so a
scheme-less backend host (`abc-123.convex.cloud/img/a.png`) is classified as
remote instead of being mistaken for a relative path and normalised into
nothing. `isSignedUrl` detects expiring credentials in a query
(`X-Amz-*`, `token`, `signature`, `expires`); `isTransientUrl` covers `blob:`
and signed URLs, the values that must never be persisted as asset references.

`folderSlug` takes `lowercase` (default false, preserving the existing
case-preserving behaviour). `sanitiseFilename` takes `fallback`, returned when
a name of only disallowed characters would otherwise sanitise to an empty
string.
