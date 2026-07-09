---
"@polarise/pathwash": minor
---

Make the washer the whole policy, and add `segments` / `caseCollisions`.

Every option added to this library so far — path forms, `hosts`, prefix
stripping, folder-slug rules — lived outside `createWasher`, so each call site
re-passed them and eventually diverged. That is the exact drift the washer
exists to prevent, and the library was committing it.

`WasherConfig` now carries the lot: `hosts`, `stripPrefixes`, `form`, `folder`,
and `passthrough`. `Washer` gains `key` (the canonical bare lookup key,
whatever `form` is), `emit` (the value to write out, in `form`), `folderName`,
`within` (zip-slip-safe join), `caseCollisions`, and `isPassthrough`. Configure
once; every boundary imports the instance.

`passthrough` is the important one. A field often holds something that is not a
path at all — a CSS colour, a sentinel, a proxy route. The library cannot know
what those look like in your system and should not learn: you inject the
predicate once, and every method respects it. Without it, `emit("#ff0000")`
yields `/#ff0000`, a broken image. This is how a general library absorbs a
domain requirement without absorbing the domain.

Also exported: `segments(path)` (normalised, non-empty, `..` preserved — so
"the folder after `levels/`" is `segments(p)[1]`, a caller's concept the library
never needs to learn) and `caseCollisions(paths)` (paths differing only by
case, previously computed inside `analyseEntries` and unreachable on its own —
S3 is case-sensitive, macOS is not, so a local build passes and production
serves the wrong bytes).

All defaults are unchanged; existing washers behave exactly as before.
