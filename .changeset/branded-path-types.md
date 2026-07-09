---
"@polarise/pathwash": minor
---

Add branded `PathKey` and `EmittedRef` types.

A lookup key and an emitted reference are different strings for the same asset —
that is the whole reason for having both, and the whole reason they get mixed
up. `washer.key()` now returns `PathKey` and `washer.emit()` returns
`EmittedRef`, so a `Map<PathKey, T>` cannot be read with an emitted reference.
The mistake that silently 404s in production is now a compile error.

Both are `string` at runtime (the brand is a phantom property, erased by the
compiler) and both remain assignable **to** `string`, so nothing downstream
changes: pass them to `fetch`, write them to a column, compare them with `===`.
A plain `string` is not assignable **to** them — that is the point. When a value
enters your system already canonical, `asPathKey` / `asEmittedRef` are the
explicit, greppable escape hatches.

Verified from a consumer's position against the built `.d.ts`: passing an
`EmittedRef` where a `PathKey` is required, assigning a raw string to a
`PathKey`, a typo in a closed union (`form: "root"`), and a typo in an option
name (`striPrefixes`) are all compile errors, while correct usage type-checks.
