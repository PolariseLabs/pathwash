---
"@polarise/pathwash": patch
---

Fix `sanitisePath` silently resolving traversal segments.

`sanitisePath` ran every segment through `sanitiseFilename`, which strips
leading dots. A `..` segment reduced to an empty string and was filtered out, so
`sanitisePath("../../etc/passwd")` returned `"etc/passwd"` and `hasTraversal`
reported false on the result. That is the laundering `normalisePath` explicitly
refuses to do: a hostile path became a plausible one, and any caller that
sanitised before checking got a false negative.

`sanitisePath` now passes `..` through verbatim, so traversal survives to be
detected. `assertCleanPath` rejects traversal outright, before its canonical-form
check, since a path can be canonical and still unsafe.

Callers who relied on `sanitisePath` to strip `..` were relying on a silent
rewrite of a hostile input and should reject the path instead.
