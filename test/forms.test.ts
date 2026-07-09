import { describe, expect, test } from "bun:test"
import {
  formatPath,
  isPathForm,
  stripPathPrefixes,
  toAbsolute,
  toBare,
  toDotRelative,
  isExternalUrl,
  isRemoteUrl,
  isSignedUrl,
  isTransientUrl,
  folderSlug,
  sanitiseFilename,
  sanitisePath,
} from "../src/index.js"

describe("formatPath", () => {
  test("converts between all three forms", () => {
    for (const input of ["a/b.png", "/a/b.png", "./a/b.png"]) {
      expect(formatPath(input, "bare")).toBe("a/b.png")
      expect(formatPath(input, "absolute")).toBe("/a/b.png")
      expect(formatPath(input, "dot-relative")).toBe("./a/b.png")
    }
  })

  test("normalises while reforming", () => {
    expect(formatPath("html5\\data\\a.png", "absolute")).toBe("/html5/data/a.png")
    expect(formatPath("a//b/./c.png", "bare")).toBe("a/b/c.png")
    expect(formatPath("C:/a/b.png", "bare")).toBe("a/b.png")
  })

  test("passes external and inline values through untouched", () => {
    const external = [
      "https://cdn.example.com/a.png",
      "http://cdn.example.com/a.png",
      "//cdn.example.com/a.png",
      "data:image/png;base64,AAA",
      "blob:https://x/y",
    ]
    for (const value of external) {
      expect(formatPath(value, "absolute")).toBe(value)
      expect(formatPath(value, "dot-relative")).toBe(value)
      expect(formatPath(value, "bare")).toBe(value)
    }
  })

  test("empty stays empty rather than becoming a bare prefix", () => {
    expect(formatPath("", "absolute")).toBe("")
    expect(formatPath("/", "absolute")).toBe("")
    expect(formatPath("./", "dot-relative")).toBe("")
  })

  test("is idempotent in each form", () => {
    for (const form of ["bare", "absolute", "dot-relative"] as const) {
      const once = formatPath("/a/b.png", form)
      expect(formatPath(once, form)).toBe(once)
    }
  })

  test("helpers match formatPath", () => {
    expect(toBare("/a.png")).toBe("a.png")
    expect(toAbsolute("a.png")).toBe("/a.png")
    expect(toDotRelative("a.png")).toBe("./a.png")
  })

  // The bug this library exists to prevent: a config emitted relative, consumed
  // from a nested route, resolves against the wrong base and 404s.
  test("absolute form is stable regardless of route depth", () => {
    expect(toAbsolute("avatars/avatar-uk-10/uk.png")).toBe("/avatars/avatar-uk-10/uk.png")
  })

  // And the inverse: a lookup key must not depend on how the value was written.
  test("bare form collapses the three spellings to one lookup key", () => {
    const keys = new Set(
      ["avatars/uk.png", "/avatars/uk.png", "./avatars/uk.png"].map(toBare),
    )
    expect(keys.size).toBe(1)
  })
})

describe("isPathForm", () => {
  test("is a fixed point of formatPath", () => {
    expect(isPathForm("a/b.png", "bare")).toBe(true)
    expect(isPathForm("/a/b.png", "bare")).toBe(false)
    expect(isPathForm("/a/b.png", "absolute")).toBe(true)
    expect(isPathForm("./a/b.png", "dot-relative")).toBe(true)
    expect(isPathForm("a/b.png", "dot-relative")).toBe(false)
  })

  test("an unnormalised path is in no form", () => {
    expect(isPathForm("/a//b.png", "absolute")).toBe(false)
    expect(isPathForm("", "bare")).toBe(false)
  })
})

describe("stripPathPrefixes", () => {
  test("strips a deploy root and returns the bare remainder", () => {
    expect(stripPathPrefixes("public/img/a.png", ["public/"])).toBe("img/a.png")
    expect(stripPathPrefixes("./public/img/a.png", ["public/"])).toBe("img/a.png")
    expect(stripPathPrefixes("/public/img/a.png", ["public/"])).toBe("img/a.png")
  })

  test("prefers the longest matching prefix regardless of argument order", () => {
    const prefixes = ["public/", "frontend/public/"]
    expect(stripPathPrefixes("frontend/public/img/a.png", prefixes)).toBe("img/a.png")
  })

  test("strips at most one prefix", () => {
    expect(stripPathPrefixes("public/public/a.png", ["public/"])).toBe("public/a.png")
  })

  test("accepts prefixes with or without a trailing slash", () => {
    expect(stripPathPrefixes("public/a.png", ["public"])).toBe("a.png")
  })

  test("does not strip a partial segment match", () => {
    expect(stripPathPrefixes("publicity/a.png", ["public/"])).toBe("publicity/a.png")
  })

  test("is case-sensitive, because object stores are", () => {
    expect(stripPathPrefixes("Public/a.png", ["public/"])).toBe("Public/a.png")
  })

  test("leaves external values alone", () => {
    expect(stripPathPrefixes("https://cdn/public/a.png", ["public/"])).toBe(
      "https://cdn/public/a.png",
    )
  })

  test("no match returns the normalised bare path", () => {
    expect(stripPathPrefixes("./img/a.png", ["public/"])).toBe("img/a.png")
  })
})

describe("isRemoteUrl / isExternalUrl with bare hosts", () => {
  test("scheme-less host is not remote by default", () => {
    expect(isRemoteUrl("abc-123.convex.cloud/img/a.png")).toBe(false)
  })

  test("a listed host matches itself and any subdomain", () => {
    const options = { hosts: ["convex.cloud"] }
    expect(isRemoteUrl("abc-123.convex.cloud/img/a.png", options)).toBe(true)
    expect(isRemoteUrl("convex.cloud/img/a.png", options)).toBe(true)
    expect(isExternalUrl("abc-123.convex.cloud/img/a.png", options)).toBe(true)
  })

  test("a leading dot in the host entry is accepted", () => {
    expect(isRemoteUrl("abc.convex.cloud/a.png", { hosts: [".convex.cloud"] })).toBe(true)
  })

  test("does not match a path segment that merely contains the host", () => {
    const options = { hosts: ["convex.cloud"] }
    expect(isRemoteUrl("img/convex.cloud/a.png", options)).toBe(false)
    expect(isRemoteUrl("notconvex.cloud/a.png", options)).toBe(false)
  })

  test("still matches ordinary schemes without options", () => {
    expect(isRemoteUrl("https://x/a.png")).toBe(true)
    expect(isRemoteUrl("//x/a.png")).toBe(true)
    expect(isRemoteUrl("a/b.png")).toBe(false)
  })

  // A bare host must survive formatPath, or the reference is destroyed.
  test("a listed host is not mangled by normalisation", () => {
    const value = "abc-123.convex.cloud/img/a.png"
    expect(isExternalUrl(value, { hosts: ["convex.cloud"] })).toBe(true)
  })
})

describe("isSignedUrl / isTransientUrl", () => {
  test("detects expiring credentials in the query", () => {
    expect(isSignedUrl("https://s3/a.png?X-Amz-Signature=abc")).toBe(true)
    expect(isSignedUrl("https://s3/a.png?x-amz-expires=60")).toBe(true)
    expect(isSignedUrl("https://x/a.png?token=abc")).toBe(true)
    expect(isSignedUrl("https://x/a.png?a=1&signature=z")).toBe(true)
    expect(isSignedUrl("https://x/a.png?expires=1")).toBe(true)
  })

  test("a plain url is not signed", () => {
    expect(isSignedUrl("https://x/a.png")).toBe(false)
    expect(isSignedUrl("https://x/a.png?v=2")).toBe(false)
  })

  test("does not match a query key that merely ends in the word", () => {
    expect(isSignedUrl("https://x/a.png?mytoken=abc")).toBe(false)
  })

  test("transient covers blob and signed, but not data", () => {
    expect(isTransientUrl("blob:https://x/y")).toBe(true)
    expect(isTransientUrl("https://x/a.png?token=1")).toBe(true)
    expect(isTransientUrl("data:image/png;base64,AAA")).toBe(false)
    expect(isTransientUrl("a/b.png")).toBe(false)
  })
})

describe("folderSlug lowercase option", () => {
  test("preserves case by default", () => {
    expect(folderSlug("My Game")).toBe("My-Game")
  })

  test("lowercases on request", () => {
    expect(folderSlug("My Game", { lowercase: true })).toBe("my-game")
  })

  test("respects maxLength and fallback alongside lowercase", () => {
    expect(folderSlug("My Game", { lowercase: true, maxLength: 4 })).toBe("my-g")
    expect(folderSlug("???", { lowercase: true, fallback: "game" })).toBe("game")
  })
})

describe("sanitiseFilename fallback", () => {
  test("returns the fallback when the name reduces to nothing", () => {
    expect(sanitiseFilename("???")).toBe("")
    expect(sanitiseFilename("???", { fallback: "asset" })).toBe("asset")
    expect(sanitiseFilename("...", { fallback: "asset" })).toBe("asset")
  })

  test("does not affect a name that survives sanitising", () => {
    expect(sanitiseFilename("Hero Image (Final).PNG", { fallback: "asset" })).toBe(
      "hero-image-final.png",
    )
  })

  test("sanitisePath keeps the fallback segment rather than dropping it", () => {
    expect(sanitisePath("a/???/b.png", { fallback: "x" })).toBe("a/x/b.png")
  })
})
