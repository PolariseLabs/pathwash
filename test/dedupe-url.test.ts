import { describe, expect, test } from "bun:test"
import { createWasher, dedupeName, encodePathForUrl } from "../src/index.js"

describe("dedupeName", () => {
  test("returns the name unchanged when free", () => {
    expect(dedupeName("file.png", ["other.png"])).toBe("file.png")
  })

  test("counts before the extension", () => {
    expect(dedupeName("file.png", ["file.png"])).toBe("file-1.png")
    expect(dedupeName("file.png", ["file.png", "file-1.png"])).toBe("file-2.png")
  })

  test("handles names without an extension and dotfile-like names", () => {
    expect(dedupeName("readme", ["readme"])).toBe("readme-1")
    expect(dedupeName("archive.tar.gz", ["archive.tar.gz"])).toBe("archive.tar-1.gz")
  })

  test("accepts a predicate instead of a set", () => {
    const existing = new Set(["a.png", "a-1.png"])
    expect(dedupeName("a.png", (c) => existing.has(c))).toBe("a-2.png")
  })

  test("custom separator", () => {
    expect(dedupeName("file.png", ["file.png"], { separator: "_" })).toBe("file_1.png")
  })
})

describe("encodePathForUrl", () => {
  test("encodes unsafe characters per segment, keeps slashes", () => {
    expect(encodePathForUrl("my folder/héro image#1.png")).toBe(
      "my%20folder/h%C3%A9ro%20image%231.png",
    )
  })

  test("idempotent: never double-encodes", () => {
    const once = encodePathForUrl("a b.png")
    expect(once).toBe("a%20b.png")
    expect(encodePathForUrl(once)).toBe(once)
  })

  test("literal % not followed by hex is encoded, still idempotent", () => {
    const once = encodePathForUrl("100%.png")
    expect(once).toBe("100%25.png")
    expect(encodePathForUrl(once)).toBe(once)
  })
})

describe("washer.toUrl", () => {
  test("cleans then encodes; sanitised paths need no encoding", () => {
    const w = createWasher()
    expect(w.toUrl("img\\Hero Image.PNG")).toBe("img/hero-image.png")
  })

  test("normalise-only washer encodes what sanitisation would have removed", () => {
    const w = createWasher({ sanitise: false })
    expect(w.toUrl("img\\Hero Image.PNG")).toBe("img/Hero%20Image.PNG")
  })

  test("allowed external URLs pass through unencoded", () => {
    const w = createWasher({ externalUrls: "allow" })
    expect(w.toUrl("https://cdn.example.com/a b.png")).toBe("https://cdn.example.com/a b.png")
  })
})
