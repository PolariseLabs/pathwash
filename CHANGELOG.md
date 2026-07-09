# @polarise/pathwash

## 1.2.0

### Minor Changes

- ddfc618: Add branded `PathKey` and `EmittedRef` types.

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

- ddfc618: Add a `dots` option to `folderSlug`.

  A directory is not a file, and a dot inside one buys nothing: no host needs it,
  some tooling reads a dotted path segment as a filename or an extension, and a
  leading dot makes the entry hidden on most static hosts. `dots: "collapse"`
  turns each run of dots into one `-`, so a directory name can never be mistaken
  for a filename. The default stays `"keep"`.

  A leading `.`, `_` or `-` is trimmed under either setting, so `folderSlug` still
  cannot emit a hidden directory, a traversal segment, or an empty one.

  Documented alongside it: `folderSlug` preserves `_` on purpose. A deployed
  directory named from an authored title has to match whatever else references it
  — a config `src`, an iframe URL — and those keep their underscores. Silently
  rewriting `my_level/` to `my-level/` is how a level 404s at runtime with no
  warning. Use `slugify` when you want `_` gone.

- ddfc618: Add `joinPath`, `basename`, `dirname`, `stem`, and `resolveWithin`.

  `joinPath(base, ...segments)` joins with exactly one `/` at each joint.
  `` `${base}/${rel}` `` yields `cdn//a.png` when the base already ends in a slash
  and `cdna.png` when neither side has one — both 404 on a strict object store,
  and which one you get depends on the data. Purely lexical: `..` is preserved
  rather than resolved, and a leading `/` on a later segment does not reset to the
  root the way `new URL()` would.

  `basename`, `dirname` and `stem` are the browser- and edge-safe versions of the
  `node:path` functions. Every `p.split("/").pop()` rediscovers the same three
  surprises: a trailing slash yields `""`, a `..` segment comes back as a
  filename, and a Windows separator ends up inside the name.

  `resolveWithin(root, relative)` joins an archive entry onto a root, or returns
  null when it would escape it. This is zip-slip: an entry named
  `../../etc/passwd` extracted relative to your upload directory lands outside it.
  Absolute paths, Windows drive letters and backslash separators are the same
  attack in a different hat. Returns null rather than throwing or silently
  rewriting, so the caller decides whether to skip the entry or reject the
  archive.

- ddfc618: Make the washer the whole policy, and add `segments` / `caseCollisions`.

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

## 1.1.0

### Minor Changes

- b48c5d8: Add path forms, prefix stripping, and extensible URL classification.

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

### Patch Changes

- ae56868: Fix `sanitisePath` silently resolving traversal segments.

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
