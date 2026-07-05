# pathwash

Clean dirty archive and upload paths before they reach your object store, CDN, or filesystem.

Zip files built on Windows use `\` as the path separator, so `html5\data\css\output.min.css` arrives as one literal filename and 404s on any POSIX host. macOS archives smuggle in `__MACOSX/`, `._*` sidecars and `.DS_Store`, and store filenames in NFD unicode that never matches an NFC reference. Windows tools emit zero-byte directory entries with no marker. Hostile archives carry `../` traversal and symlinks. Filenames with spaces, capitals, and parentheses break case-sensitive static hosts.

pathwash turns a raw entry list into a cleaning plan, in one pass, with zero dependencies. It works with any zip library (jszip, fflate, adm-zip) or plain file lists, in Node, Bun, and the browser, because it only ever looks at paths.

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
  // traversal, symlinks, or collisions: refuse the archive
  throw new Error(`Unsafe archive: ${plan.rejected.map((r) => `${r.path} (${r.reason})`).join(", ")}`)
}

for (const { from, to } of plan.entries) {
  const bytes = await zip.files[from].async("uint8array")
  await store.put(to, bytes) // to is clean: forward slashes, no wrapper folder, no junk
}
```

`analyseEntries` is pure and read-only. It never extracts or renames anything; it returns a plan and you apply it with whatever IO you already have.

## Configured washers

For a codebase, define your cleaning policies once and import the instances everywhere, instead of re-passing (and eventually diverging on) options at each call site:

```ts
// path-conventions.ts — the single place policy lives
import { createWasher } from "@polarise/pathwash"

// asset keys: strictly relative, lowercase URL-safe
export const assetPaths = createWasher({ externalUrls: "reject" })

// config references: external URLs are legitimate, queries are not
export const configRefs = createWasher({ externalUrls: "allow", stripQueryAndHash: true })
```

```ts
// upload boundary: canonicalise once
const key = assetPaths.clean(file.name)

// every downstream boundary: validate, never re-normalise
assetPaths.assertClean(key)

// archive imports inherit the same policy
const plan = assetPaths.analyse(zipEntries)
```

Each washer's `isClean(x)` is defined as `clean(x) === x`, so a washer's validator can never drift from its normaliser, whatever it was configured with. `WasherConfig`: `externalUrls` (`"reject"` default / `"allow"`), `stripQueryAndHash`, `sanitise` (`true` default, `false`, or `SanitiseOptions`), and `analyse` defaults.

## What it handles

| Failure mode | What pathwash does |
| --- | --- |
| Windows `\` separators in zip entries | Normalised to `/` before anything else |
| Zero-byte Windows directory markers (`html5\data\`) | Skipped as `directory` |
| `__MACOSX/`, `._*`, `.DS_Store`, `Thumbs.db`, `desktop.ini` | Skipped as `junk` |
| NFD unicode from macOS archives | Normalised to NFC |
| Wrapper folder around all content (`my-export/...`) | Stripped, reported as `commonRoot` |
| `../` traversal segments | Rejected as `traversal` |
| Symlink entries | Rejected as `symlink` |
| Two entries normalising to the same path | Rejected as `collision` (or `first-wins` / `last-wins`) |
| Paths differing only by case | Reported in `caseCollisions` |
| Windows reserved names (`CON`, `NUL`, `COM1`...), trailing dots/spaces, over-long paths | Reported in `warnings` (fixed when `sanitise` is on) |
| URL-unsafe filenames (`Hero Image (Final).PNG`) | Opt-in `sanitise` rewrites to `hero-image-final.png` |

## API

### `analyseEntries(entries, options?): ArchivePlan`

Takes `{ path, isDirectory?, isSymlink? }[]`, returns:

```ts
{
  entries: { from: string; to: string }[]      // files to keep, cleaned paths
  skipped: { path: string; reason: "junk" | "directory" | "empty" | "duplicate" }[]
  rejected: { path: string; reason: "traversal" | "symlink" | "collision"; collidesWith?: string }[]
  commonRoot: string | null                    // wrapper prefix stripped from every entry
  caseCollisions: string[][]                   // paths that collide on case-insensitive filesystems
  warnings: { path: string; code: "windows-reserved-name" | "trailing-dot-or-space" | "long-path" }[]
}
```

Options: `stripCommonRoot` (default `true`), `filterJunk` (default `true`), `sanitise` (default `false`, pass `true` or `SanitiseOptions`), `onCollision` (`"reject"` default, `"first-wins"`, `"last-wins"`).

If `rejected` is non-empty, the safe policy is to refuse the whole archive.

### `sanitiseFilename(name, options?): string`

Makes one filename safe to serve from a URL: lowercase (configurable), runs of characters outside `[a-z0-9._-]` become `-`, hyphens collapse and never touch a dot or an edge, no leading dots, trailing dots stripped, Windows reserved names defused (`con.txt` becomes `con_.txt`).

Static hosts are case-sensitive and byte-exact. Sanitising once at the upload boundary means the stored name and every later reference match by construction, instead of hoping a HEAD check catches the drift after deploy.

### Validation that cannot drift

The classic failure mode with normalisation is having the transform in one place and the check in another, updated on different schedules, until two boundaries disagree about what "clean" means. pathwash defines validation as a fixed point of normalisation: a value is clean if and only if normalising it changes nothing.

```ts
import { isCleanPath, assertCleanPath, sanitisePath } from "@polarise/pathwash"

// upload boundary: normalise once
const stored = sanitisePath(uploadedName)

// every downstream boundary: validate, never re-normalise
assertCleanPath(key) // throws naming the offending value and its canonical form
```

`isNormalisedPath`, `isCleanFilename`, `isCleanPath`, `assertCleanPath`. Because the validators are derived from the normalisers, updating a rule updates every check with it, atomically. Both `normalisePath` and `sanitisePath` are idempotent (tested), which is what makes the fixed-point definition sound.

### `checkArchiveLimits(entries, limits?)`

Zip-bomb and resource-exhaustion guards from entry metadata alone, before any bytes are decompressed: entry count, total and per-entry uncompressed size, and per-entry compression ratio. Pass `bytes`/`compressedBytes` from your zip reader's headers; returns `{ ok, violations }` with typed codes.

### `slugify(name, options?)` and `folderSlug(name, options?)`

Two slug rules that projects usually hand-roll several diverging copies of: `slugify` is the lowercase URL slug (`"My Project: Final (v2)"` → `"my-project-final-v2"`); `folderSlug` preserves case, dots, and underscores for user-visible folder names. Both take `maxLength` and `fallback`.

### URL classification

`isRemoteUrl`, `isDataUrl`, `isBlobUrl`, `isExternalUrl`, `stripQueryAndHash` — the "is this a path I own, or something external/ephemeral I must not persist?" predicates that config-walking code re-derives at every call site otherwise.

### `dedupeName(name, taken, options?)`

Finds an unused variant when a name is taken: `file.png` → `file-1.png` → `file-2.png`, counter before the extension. `taken` is an iterable of names or a predicate. Dedupe after cleaning, not before: two different originals can sanitise to the same name, and the collision that matters is the one in storage.

### `encodePathForUrl(path)` and `washer.toUrl(value)`

Per-segment percent-encoding that keeps `/` and never double-encodes (already-encoded input is decoded first, making it idempotent). `washer.toUrl` cleans by the washer's policy first, then encodes; allowed external URLs pass through.

### Building blocks

`normalisePath`, `sanitisePath`, `isJunkPath`, `isDirectoryMarker`, `hasTraversal`, `isWindowsReservedName`, `hasTrailingDotOrSpace`, `findPathHazards`, `getExtension`, `splitExtension` are all exported individually.

## Design notes

- **Plan, don't mutate.** The library never touches bytes or disk, so it cannot be the thing that corrupts your upload path, and it is trivially testable.
- **Reject, don't repair, the dangerous cases.** Traversal and symlinks are rejected rather than silently rewritten; a repaired hostile path is still a hostile archive.
- **`..` is never resolved.** Resolving it would turn a hostile path into a plausible one before the check runs.
- **Sanitisation is opt-in.** Path *normalisation* (separators, unicode, junk) is always safe; *renaming* files to URL-safe forms changes references, so you choose when to apply it.
- **One rule, everywhere.** Normalisers are idempotent and validators are their fixed points, so "the check over here" and "the transform over there" are the same code and cannot diverge.

## License

MIT
