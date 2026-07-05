/** A file entry from any archive or upload source, before cleaning. */
export interface EntryInput {
  /** Entry path exactly as the source reported it (may use `\`, `./`, etc.). */
  path: string
  /**
   * True when the source knows this is a directory. Optional because many
   * zip readers only mark directories via a trailing slash, and Windows
   * tools emit zero-byte directory entries with no marker at all.
   */
  isDirectory?: boolean
  /**
   * True when the source knows this entry is a symbolic link (zip external
   * attributes). Symlinks can point outside the extraction root, so they are
   * rejected like traversal.
   */
  isSymlink?: boolean
  /** Declared uncompressed size, when the source knows it. Used by `checkArchiveLimits`. */
  bytes?: number
  /** Declared compressed size, when the source knows it. Used by `checkArchiveLimits`. */
  compressedBytes?: number
}

/** Why an entry was harmlessly omitted from the plan. */
export type SkipReason =
  /** `__MACOSX/`, `._*` AppleDouble sidecars, `.DS_Store`, `Thumbs.db`, `desktop.ini`. */
  | "junk"
  /** A directory entry (explicit, trailing slash, or a zero-byte Windows marker). */
  | "directory"
  /** The path was empty (or empty once normalised). */
  | "empty"
  /** With `onCollision: "first-wins"`: a later entry whose output path was already taken. */
  | "duplicate"

/** Why an entry was refused as unsafe or unusable. */
export type RejectReason =
  /** Contains a `..` segment: extracting or keying it could escape the target root. */
  | "traversal"
  /** A symbolic link entry: its target can escape the extraction root. */
  | "symlink"
  /** Normalises to the same output path as an earlier entry. */
  | "collision"

/** A portability hazard that does not block the plan. */
export type WarningCode =
  /** A segment's base name is a Windows reserved device name (`CON`, `NUL`, `COM1`…): unextractable on Windows. */
  | "windows-reserved-name"
  /** A segment ends with a dot or space: Windows strips these on extract, so the path silently changes. */
  | "trailing-dot-or-space"
  /** The path exceeds 260 characters or a segment exceeds 255: breaks on common filesystem limits. */
  | "long-path"

export interface PlanWarning {
  /** The planned output path the warning applies to. */
  path: string
  code: WarningCode
}

export interface PlannedEntry {
  /** Original path, exactly as supplied. */
  from: string
  /** Cleaned output path: forward slashes, no leading `./` or `/`, root stripped, sanitised if enabled. */
  to: string
}

export interface SkippedEntry {
  path: string
  reason: SkipReason
}

export interface RejectedEntry {
  path: string
  reason: RejectReason
  /** For `collision`: the output path that was already taken. */
  collidesWith?: string
}

export interface ArchivePlan {
  /** Files to materialise, in input order. */
  entries: PlannedEntry[]
  /** Harmless omissions (junk, directories, empties). */
  skipped: SkippedEntry[]
  /** Unsafe or conflicting entries. If non-empty, callers choosing a strict policy should refuse the whole archive. */
  rejected: RejectedEntry[]
  /** The wrapper prefix stripped from every entry (e.g. `my-export` or `my-export/html5`), or null when none. */
  commonRoot: string | null
  /** Output paths that differ only by letter case; they will collide on case-insensitive filesystems. */
  caseCollisions: string[][]
  /** Non-blocking portability hazards in the planned output paths. */
  warnings: PlanWarning[]
}

export interface AnalyseOptions {
  /**
   * Strip a wrapper folder shared by every file (repeatedly, so `export/html5/...`
   * unwraps fully when everything lives under it). Default true.
   */
  stripCommonRoot?: boolean
  /** Skip junk entries (macOS/Windows metadata). Default true; set false to keep them. */
  filterJunk?: boolean
  /** Also run every path segment through `sanitisePath`. Default false: paths are normalised but names are left alone. */
  sanitise?: boolean | SanitiseOptions
  /**
   * What to do when two entries normalise to the same output path.
   * "reject" (default) reports the later entry; "first-wins" silently keeps
   * the first and skips the rest; "last-wins" keeps the last.
   */
  onCollision?: "reject" | "first-wins" | "last-wins"
}

export interface SanitiseOptions {
  /** Lowercase the result. Default true; set false for a case-preserving clean. */
  lowercase?: boolean
  /** Replacement for runs of disallowed characters. Default "-". */
  replacement?: string
  /** Cap the result length, truncating the base name while keeping the extension. */
  maxLength?: number
}
