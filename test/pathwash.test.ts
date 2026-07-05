import { describe, expect, test } from "bun:test"
import {
  analyseEntries,
  findPathHazards,
  hasTraversal,
  isDirectoryMarker,
  isJunkPath,
  isWindowsReservedName,
  normalisePath,
  sanitiseFilename,
  sanitisePath,
} from "../src/index.js"

describe("normalisePath", () => {
  test("converts Windows backslash separators (Storyline zips)", () => {
    expect(normalisePath("html5\\data\\css\\output.min.css")).toBe("html5/data/css/output.min.css")
  })

  test("mixed separators and duplicate slashes", () => {
    expect(normalisePath("a\\b//c\\\\d.txt")).toBe("a/b/c/d.txt")
  })

  test("strips leading ./ and / and drive letters", () => {
    expect(normalisePath("./a/b.txt")).toBe("a/b.txt")
    expect(normalisePath("/a/b.txt")).toBe("a/b.txt")
    expect(normalisePath("C:\\a\\b.txt")).toBe("a/b.txt")
  })

  test("removes interior . segments, keeps ..", () => {
    expect(normalisePath("a/./b.txt")).toBe("a/b.txt")
    expect(normalisePath("a/../b.txt")).toBe("a/../b.txt")
  })

  test("preserves a trailing slash so directory markers survive", () => {
    expect(normalisePath("html5\\data\\")).toBe("html5/data/")
  })

  test("normalises NFD (macOS) unicode to NFC", () => {
    const nfd = "café.png" // "café.png" as macOS Archive Utility stores it
    const nfc = "café.png"
    expect(normalisePath(nfd)).toBe(nfc)
  })
})

describe("hasTraversal", () => {
  test("flags .. segments in either separator style", () => {
    expect(hasTraversal("../etc/passwd")).toBe(true)
    expect(hasTraversal("a\\..\\b.txt")).toBe(true)
    expect(hasTraversal("a/b..c.txt")).toBe(false)
    expect(hasTraversal("a/..name/file")).toBe(false)
  })
})

describe("isDirectoryMarker", () => {
  test("trailing slash, backslash, explicit flag", () => {
    expect(isDirectoryMarker("a/b/")).toBe(true)
    expect(isDirectoryMarker("html5\\data\\")).toBe(true)
    expect(isDirectoryMarker("a/b", true)).toBe(true)
    expect(isDirectoryMarker("a/b")).toBe(false)
  })

  test("empty path is not a directory", () => {
    expect(isDirectoryMarker("")).toBe(false)
  })
})

describe("isJunkPath", () => {
  test("macOS metadata", () => {
    expect(isJunkPath("__MACOSX/story.html")).toBe(true)
    expect(isJunkPath("a/__MACOSX/b.txt")).toBe(true)
    expect(isJunkPath("a/._story.html")).toBe(true)
    expect(isJunkPath(".DS_Store")).toBe(true)
    expect(isJunkPath("a/b/.DS_Store")).toBe(true)
  })

  test("Windows metadata", () => {
    expect(isJunkPath("Thumbs.db")).toBe(true)
    expect(isJunkPath("a/thumbs.db")).toBe(true)
    expect(isJunkPath("a/desktop.ini")).toBe(true)
  })

  test("legitimate files pass", () => {
    expect(isJunkPath("a/story.html")).toBe(false)
    expect(isJunkPath("a/_notes.txt")).toBe(false)
    expect(isJunkPath("a/.gitignore")).toBe(false)
  })
})

describe("sanitiseFilename", () => {
  test("lowercases and replaces unsafe runs", () => {
    expect(sanitiseFilename("Hero Image (Final).PNG")).toBe("hero-image-final.png")
  })

  test("collapses replacement runs and trims around dots and edges", () => {
    expect(sanitiseFilename("--a  b--.txt")).toBe("a-b.txt")
    expect(sanitiseFilename("a..b.txt")).toBe("a.b.txt")
  })

  test("never produces a leading dot", () => {
    expect(sanitiseFilename(".env")).toBe("env")
    expect(sanitiseFilename("...a")).toBe("a")
  })

  test("case-preserving mode", () => {
    expect(sanitiseFilename("Hero Image.PNG", { lowercase: false })).toBe("Hero-Image.PNG")
  })

  test("strips trailing dots and defuses Windows reserved names", () => {
    expect(sanitiseFilename("report.")).toBe("report")
    expect(sanitiseFilename("con.txt")).toBe("con_.txt")
    expect(sanitiseFilename("NUL")).toBe("nul_")
    expect(sanitiseFilename("console.txt")).toBe("console.txt")
  })
})

describe("hazards", () => {
  test("windows reserved names, any case and extension", () => {
    expect(isWindowsReservedName("CON")).toBe(true)
    expect(isWindowsReservedName("con.txt")).toBe(true)
    expect(isWindowsReservedName("com1.log")).toBe(true)
    expect(isWindowsReservedName("console")).toBe(false)
  })

  test("findPathHazards flags reserved names, trailing dots/spaces, long paths", () => {
    expect(findPathHazards("a/nul.txt")).toEqual(["windows-reserved-name"])
    expect(findPathHazards("a/file. ")).toEqual(["trailing-dot-or-space"])
    expect(findPathHazards(`a/${"x".repeat(256)}.txt`)).toEqual(["long-path"])
    expect(findPathHazards("a/ok.txt")).toEqual([])
  })
})

describe("sanitisePath", () => {
  test("sanitises each segment, keeps structure", () => {
    expect(sanitisePath("My Assets\\Hero Image.PNG")).toBe("my-assets/hero-image.png")
  })
})

describe("analyseEntries", () => {
  test("a realistic Storyline/Windows zip end to end", () => {
    const plan = analyseEntries([
      { path: "story content\\" },
      { path: "story content\\html5\\data\\css\\output.min.css" },
      { path: "story content\\story.html" },
      { path: "__MACOSX/._story.html" },
      { path: "story content\\.DS_Store" },
    ])
    expect(plan.entries).toEqual([
      { from: "story content\\html5\\data\\css\\output.min.css", to: "html5/data/css/output.min.css" },
      { from: "story content\\story.html", to: "story.html" },
    ])
    expect(plan.commonRoot).toBe("story content")
    expect(plan.rejected).toEqual([])
    expect(plan.skipped).toEqual([
      { path: "story content\\", reason: "directory" },
      { path: "__MACOSX/._story.html", reason: "junk" },
      { path: "story content\\.DS_Store", reason: "junk" },
    ])
  })

  test("strips nested wrapper folders repeatedly", () => {
    const plan = analyseEntries([
      { path: "export/html5/index.html" },
      { path: "export/html5/app.js" },
    ])
    expect(plan.commonRoot).toBe("export/html5")
    expect(plan.entries.map((e) => e.to)).toEqual(["index.html", "app.js"])
  })

  test("does not strip when a file sits at the root", () => {
    const plan = analyseEntries([{ path: "export/index.html" }, { path: "readme.txt" }])
    expect(plan.commonRoot).toBeNull()
  })

  test("never strips a bare filename", () => {
    const plan = analyseEntries([{ path: "report.pdf" }])
    expect(plan.commonRoot).toBeNull()
    expect(plan.entries).toEqual([{ from: "report.pdf", to: "report.pdf" }])
  })

  test("rejects symlink entries", () => {
    const plan = analyseEntries([{ path: "link", isSymlink: true }, { path: "ok.txt" }])
    expect(plan.rejected).toEqual([{ path: "link", reason: "symlink" }])
  })

  test("surfaces warnings without blocking", () => {
    const plan = analyseEntries([{ path: "w/nul.txt" }, { path: "w/ok.txt" }])
    expect(plan.rejected).toEqual([])
    expect(plan.warnings).toEqual([{ path: "nul.txt", code: "windows-reserved-name" }])
  })

  test("rejects traversal", () => {
    const plan = analyseEntries([{ path: "..\\..\\etc\\passwd" }, { path: "ok.txt" }])
    expect(plan.rejected).toEqual([{ path: "..\\..\\etc\\passwd", reason: "traversal" }])
    expect(plan.entries.map((e) => e.to)).toEqual(["ok.txt"])
  })

  test("collision after normalisation: reject by default", () => {
    const plan = analyseEntries([{ path: "a\\b.txt" }, { path: "a/b.txt" }], {
      stripCommonRoot: false,
    })
    expect(plan.entries).toEqual([{ from: "a\\b.txt", to: "a/b.txt" }])
    expect(plan.rejected).toEqual([
      { path: "a/b.txt", reason: "collision", collidesWith: "a\\b.txt" },
    ])
  })

  test("collision policies: first-wins and last-wins", () => {
    const entries = [{ path: "a\\b.txt" }, { path: "a/b.txt" }]
    const first = analyseEntries(entries, { onCollision: "first-wins" })
    expect(first.entries.map((e) => e.from)).toEqual(["a\\b.txt"])
    expect(first.skipped).toEqual([{ path: "a/b.txt", reason: "duplicate" }])
    const last = analyseEntries(entries, { onCollision: "last-wins" })
    expect(last.entries.map((e) => e.from)).toEqual(["a/b.txt"])
  })

  test("sanitise option rewrites output paths", () => {
    const plan = analyseEntries(
      [{ path: "wrap/My Folder/Hero Image.PNG" }, { path: "wrap/Story.html" }],
      { sanitise: true },
    )
    expect(plan.commonRoot).toBe("wrap")
    expect(plan.entries).toEqual([
      { from: "wrap/My Folder/Hero Image.PNG", to: "my-folder/hero-image.png" },
      { from: "wrap/Story.html", to: "story.html" },
    ])
  })

  test("a single-file archive unwraps to its basename", () => {
    const plan = analyseEntries([{ path: "wrap/inner/report.pdf" }])
    expect(plan.commonRoot).toBe("wrap/inner")
    expect(plan.entries).toEqual([{ from: "wrap/inner/report.pdf", to: "report.pdf" }])
  })

  test("reports case collisions without rejecting", () => {
    const plan = analyseEntries([{ path: "w/README.md" }, { path: "w/readme.md" }])
    expect(plan.rejected).toEqual([])
    expect(plan.caseCollisions).toEqual([["README.md", "readme.md"]])
  })

  test("empty and root-only paths are skipped as empty", () => {
    const plan = analyseEntries([{ path: "" }, { path: "a.txt" }])
    expect(plan.skipped).toEqual([{ path: "", reason: "empty" }])
  })

  test("filterJunk: false keeps junk files", () => {
    const plan = analyseEntries([{ path: "a/.DS_Store" }], { filterJunk: false })
    expect(plan.entries).toEqual([{ from: "a/.DS_Store", to: ".DS_Store" }])
  })

  test("stripCommonRoot: false leaves wrappers alone", () => {
    const plan = analyseEntries([{ path: "wrap/a.txt" }, { path: "wrap/b.txt" }], {
      stripCommonRoot: false,
    })
    expect(plan.commonRoot).toBeNull()
    expect(plan.entries.map((e) => e.to)).toEqual(["wrap/a.txt", "wrap/b.txt"])
  })
})
