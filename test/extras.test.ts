import { describe, expect, test } from "bun:test"
import {
  assertCleanPath,
  checkArchiveLimits,
  folderSlug,
  getExtension,
  isCleanFilename,
  isCleanPath,
  isExternalUrl,
  isNormalisedPath,
  normalisePath,
  sanitiseFilename,
  sanitisePath,
  slugify,
  splitExtension,
  stripQueryAndHash,
} from "../src/index.js"

describe("slugify", () => {
  test("lowercase url slug", () => {
    expect(slugify("My Project: Final (v2)")).toBe("my-project-final-v2")
  })

  test("maxLength truncates without a trailing hyphen", () => {
    expect(slugify("alpha beta gamma", { maxLength: 11 })).toBe("alpha-beta")
  })

  test("fallback when input reduces to nothing", () => {
    expect(slugify("!!!", { fallback: "project-export" })).toBe("project-export")
  })
})

describe("folderSlug", () => {
  test("case-preserving folder slug", () => {
    expect(folderSlug("Level 2: The Bridge!")).toBe("Level-2-The-Bridge")
  })

  test("keeps dots and underscores mid-string, trims them at edges", () => {
    expect(folderSlug("_v1.2 draft_")).toBe("v1.2-draft")
  })
})

describe("urls", () => {
  test("classifies external urls", () => {
    expect(isExternalUrl("https://cdn.example.com/a.png")).toBe(true)
    expect(isExternalUrl("//cdn.example.com/a.png")).toBe(true)
    expect(isExternalUrl("data:image/png;base64,xxxx")).toBe(true)
    expect(isExternalUrl("blob:https://app/uuid")).toBe(true)
    expect(isExternalUrl("img/hero.png")).toBe(false)
    expect(isExternalUrl("./img/hero.png")).toBe(false)
  })

  test("stripQueryAndHash", () => {
    expect(stripQueryAndHash("a/b.png?v=2#frag")).toBe("a/b.png")
    expect(stripQueryAndHash("a/b.png#frag")).toBe("a/b.png")
    expect(stripQueryAndHash("a/b.png")).toBe("a/b.png")
  })
})

describe("extension", () => {
  test("lowercase extension, none for dotfiles and trailing dots", () => {
    expect(getExtension("a/b/Hero.PNG")).toBe("png")
    expect(getExtension("a/.gitignore")).toBe("")
    expect(getExtension("a/name.")).toBe("")
    expect(getExtension("archive.tar.gz")).toBe("gz")
  })

  test("splitExtension keeps the directory part in base", () => {
    expect(splitExtension("a/b/Hero.PNG")).toEqual({ base: "a/b/Hero", extension: "png" })
  })
})

describe("checkArchiveLimits", () => {
  test("passes a normal archive", () => {
    const result = checkArchiveLimits([
      { path: "a.png", bytes: 1000, compressedBytes: 900 },
      { path: "b.css", bytes: 5000, compressedBytes: 2000 },
    ])
    expect(result.ok).toBe(true)
  })

  test("flags entry count, entry size, total size, and compression ratio", () => {
    const many = Array.from({ length: 3 }, (_, i) => ({ path: `f${i}` }))
    expect(checkArchiveLimits(many, { maxEntries: 2 }).violations).toEqual([
      { code: "too-many-entries", path: null, value: 3, limit: 2 },
    ])
    expect(
      checkArchiveLimits([{ path: "big", bytes: 100 }], { maxEntryBytes: 50 }).violations,
    ).toEqual([{ code: "entry-too-large", path: "big", value: 100, limit: 50 }])
    expect(
      checkArchiveLimits(
        [
          { path: "a", bytes: 60 },
          { path: "b", bytes: 60 },
        ],
        { maxTotalBytes: 100 },
      ).violations,
    ).toEqual([{ code: "total-too-large", path: null, value: 120, limit: 100 }])
    expect(
      checkArchiveLimits([{ path: "bomb", bytes: 10_000_000, compressedBytes: 10_000 }], {
        maxCompressionRatio: 500,
      }).violations,
    ).toEqual([{ code: "compression-ratio", path: "bomb", value: 1000, limit: 500 }])
  })

  test("ratio check skips tiny compressed sizes and unknown sizes", () => {
    expect(checkArchiveLimits([{ path: "tiny", bytes: 500_000, compressedBytes: 100 }]).ok).toBe(true)
    expect(checkArchiveLimits([{ path: "unknown" }]).ok).toBe(true)
  })
})

describe("sanitise maxLength", () => {
  test("truncates the base, keeps the extension", () => {
    expect(sanitiseFilename("a-very-long-asset-name.png", { maxLength: 12 })).toBe("a-very-l.png")
  })
})

describe("fixed-point validation", () => {
  test("clean values validate, dirty values do not", () => {
    expect(isNormalisedPath("a/b/c.png")).toBe(true)
    expect(isNormalisedPath("a\\b\\c.png")).toBe(false)
    expect(isNormalisedPath("./a/b.png")).toBe(false)
    expect(isCleanFilename("hero-image.png")).toBe(true)
    expect(isCleanFilename("Hero Image.PNG")).toBe(false)
    expect(isCleanPath("img/hero-image.png")).toBe(true)
    expect(isCleanPath("img/Hero Image.PNG")).toBe(false)
  })

  test("assertCleanPath throws with the canonical form in the message", () => {
    expect(() => assertCleanPath("img/Hero.PNG")).toThrow(/img\/hero\.png/)
    expect(() => assertCleanPath("img/hero.png")).not.toThrow()
  })

  test("normalisation and sanitisation are idempotent (drift is impossible)", () => {
    const inputs = [
      "story content\\html5\\data\\css\\output.min.css",
      "./a//b\\c/Hero Image (Final).PNG",
      "café.png",
      "__MACOSX/._x",
      "CON.txt",
      "a-very-long-name-with-dots...and--runs.tar.gz",
    ]
    for (const input of inputs) {
      const n = normalisePath(input)
      expect(normalisePath(n)).toBe(n)
      const s = sanitisePath(input)
      expect(sanitisePath(s)).toBe(s)
      expect(isCleanPath(s)).toBe(s !== "")
      const f = sanitiseFilename(input.split(/[\\/]/).pop() ?? input)
      expect(sanitiseFilename(f)).toBe(f)
    }
  })
})
