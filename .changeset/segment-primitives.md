---
"@polarise/pathwash": minor
---

Add `joinPath`, `basename`, `dirname`, `stem`, and `resolveWithin`.

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
