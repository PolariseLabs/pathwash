---
"@polarise/pathwash": minor
---

Add a `dots` option to `folderSlug`.

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
