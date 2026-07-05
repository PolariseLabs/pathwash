# pathwash

[![npm](https://img.shields.io/npm/v/%40polarise%2Fpathwash)](https://www.npmjs.com/package/@polarise/pathwash)
[![CI](https://github.com/PolariseLabs/pathwash/actions/workflows/ci.yml/badge.svg)](https://github.com/PolariseLabs/pathwash/actions/workflows/ci.yml)

Cleans archive and upload paths before they reach your object store, CDN, or filesystem.

Uploaded zips are dirtier than they look. Windows tools write entries as `html5\data\output.css`, which becomes one literal filename that 404s on a POSIX host. macOS adds `__MACOSX/`, `._*` sidecars and `.DS_Store`, and stores accented filenames in NFD form that will never match an NFC reference. Some archives contain `../` traversal or symlinks. pathwash catches all of it in one pass, with zero dependencies, in Node, Bun, and the browser. It never reads file contents, so it works with any zip library or a plain file list.

## Install

```sh
npm install @polarise/pathwash
```

## Usage

```ts
import { analyseEntries } from "@polarise/pathwash"
import JSZip from "jszip"

const zip = await JSZip.loadAsync(bytes)
const plan = analyseEntries(
  Object.values(zip.files).map((f) => ({ path: f.name, isDirectory: f.dir })),
)

if (plan.rejected.length > 0) {
  throw new Error(`Unsafe archive: ${plan.rejected.map((r) => r.path).join(", ")}`)
}

for (const { from, to } of plan.entries) {
  await store.put(to, await zip.files[from].async("uint8array"))
}
```

`analyseEntries` is pure. Nothing is extracted or renamed; you get a plan (`from` and `to` for each file) and apply it with your own IO.

## What it handles

| Failure mode | Result |
| --- | --- |
| Windows `\` separators in zip entries | Normalised to `/` before anything else |
| Zero-byte Windows directory markers (`html5\data\`) | Skipped as `directory` |
| `__MACOSX/`, `._*`, `.DS_Store`, `Thumbs.db`, `desktop.ini` | Skipped as `junk` |
| NFD unicode from macOS archives | Normalised to NFC |
| Wrapper folder around all content (`my-export/...`) | Stripped, reported as `commonRoot` |
| `../` traversal segments | Rejected as `traversal` |
| Symlink entries | Rejected as `symlink` |
| Two entries normalising to the same path | Rejected as `collision`, or `first-wins` / `last-wins` |
| Paths differing only by case | Reported in `caseCollisions` |
| Windows reserved names (`CON`, `NUL`, `COM1`), trailing dots and spaces, over-long paths | Reported in `warnings`; fixed when `sanitise` is on |
| URL-unsafe filenames (`Hero Image (Final).PNG`) | Opt-in `sanitise` rewrites to `hero-image-final.png` |

## Configured washers

Options passed at every call site drift; two callers end up cleaning differently and stored names stop matching references. Define the policy once and import the instance instead:

```ts
// path-conventions.ts
import { createWasher } from "@polarise/pathwash"

export const assetPaths = createWasher({ externalUrls: "reject" })
export const configRefs = createWasher({ externalUrls: "allow", stripQueryAndHash: true })
```

```ts
const key = assetPaths.clean(file.name)   // upload boundary: canonicalise once
assetPaths.assertClean(key)               // downstream: validate, never re-clean
const plan = assetPaths.analyse(zipEntries)
```

`WasherConfig`: `externalUrls` (`"reject"` default, or `"allow"`), `stripQueryAndHash`, `sanitise` (`true` default, `false`, or `SanitiseOptions`), and `analyse` defaults.

A washer's `isClean(x)` is defined as `clean(x) === x`. The validator and the normaliser are the same function, so they cannot disagree, whatever the washer was configured with.

## API

### `analyseEntries(entries, options?): ArchivePlan`

Takes `{ path, isDirectory?, isSymlink? }[]` and returns:

```ts
{
  entries: { from: string; to: string }[]
  skipped: { path: string; reason: "junk" | "directory" | "empty" | "duplicate" }[]
  rejected: { path: string; reason: "traversal" | "symlink" | "collision"; collidesWith?: string }[]
  commonRoot: string | null
  caseCollisions: string[][]
  warnings: { path: string; code: "windows-reserved-name" | "trailing-dot-or-space" | "long-path" }[]
}
```

Options: `stripCommonRoot` (default true), `filterJunk` (default true), `sanitise` (default false; pass true or `SanitiseOptions`), `onCollision` (`"reject"` default, `"first-wins"`, `"last-wins"`). If `rejected` is non-empty, refuse the archive.

### `sanitiseFilename(name, options?): string`

Makes one filename safe to serve from a URL: lowercase (configurable), runs outside `[a-z0-9._-]` become `-`, hyphens collapse and never touch a dot or an edge, no leading or trailing dots, Windows reserved names defused (`con.txt` becomes `con_.txt`), optional `maxLength` that truncates the base and keeps the extension. Static hosts are case-sensitive and byte-exact; sanitising once at the upload boundary means the stored name and every later reference match by construction.

### Validation

`isNormalisedPath`, `isCleanFilename`, `isCleanPath`, `assertCleanPath`. Each is a fixed-point check: a value is clean if and only if cleaning it changes nothing. `normalisePath` and `sanitisePath` are idempotent (tested), which is what makes that definition sound. The intended shape: sanitise once at the upload boundary, assert everywhere downstream. A failed assertion names the offending value and its canonical form, so the boundary that let it through is obvious.

### `checkArchiveLimits(entries, limits?)`

Zip-bomb guards from entry metadata, before any bytes are decompressed: entry count, total and per-entry uncompressed size, per-entry compression ratio. Pass `bytes` and `compressedBytes` from your zip reader's headers. Returns `{ ok, violations }` with typed codes.

### `slugify(name, options?)` / `folderSlug(name, options?)`

`slugify("My Project: Final (v2)")` gives `my-project-final-v2`. `folderSlug` keeps case, dots, and underscores for user-visible folder names. Both take `maxLength` and `fallback`.

### `dedupeName(name, taken, options?)`

`file.png`, `file-1.png`, `file-2.png`; the counter goes before the extension. `taken` is an iterable of names or a predicate. Dedupe after cleaning: two different originals can sanitise to the same name, and the collision that matters is the one in storage.

### URLs

`isRemoteUrl`, `isDataUrl`, `isBlobUrl`, `isExternalUrl`, `stripQueryAndHash`, `encodePathForUrl` (per-segment percent-encoding, idempotent, never double-encodes), and `washer.toUrl` (clean by policy, then encode).

### Building blocks

`normalisePath`, `sanitisePath`, `isJunkPath`, `isDirectoryMarker`, `hasTraversal`, `isWindowsReservedName`, `hasTrailingDotOrSpace`, `findPathHazards`, `getExtension`, `splitExtension`.

## Design notes

- Nothing here touches bytes or disk. You keep your own IO and error handling; pathwash only decides names.
- Traversal and symlinks are rejected rather than repaired. A repaired hostile path is still a hostile archive, and `..` is never resolved because resolving it would turn a hostile path into a plausible one before the check runs.
- Normalisation (separators, unicode, junk) is always safe and always on. Sanitisation renames files, which changes references, so it stays opt-in.

## License

MIT
