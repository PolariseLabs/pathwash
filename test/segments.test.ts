import { describe, expect, test } from "bun:test"
import {
  basename,
  dirname,
  hasTraversal,
  joinPath,
  resolveWithin,
  stem,
} from "../src/index.js"

describe("basename", () => {
  test("returns the last segment", () => {
    expect(basename("a/b/c.png")).toBe("c.png")
    expect(basename("c.png")).toBe("c.png")
  })

  // The three surprises every `split("/").pop()` reimplementation hits.
  test("a trailing slash does not yield an empty string", () => {
    expect(basename("a/b/")).toBe("b")
    expect(basename("a/b///")).toBe("b")
  })

  test("Windows separators are separators, not part of the name", () => {
    expect(basename("a\\b\\c.png")).toBe("c.png")
  })

  test("empty and root are empty, not undefined", () => {
    expect(basename("")).toBe("")
    expect(basename("/")).toBe("")
  })

  test("does not strip a query string — a path is not a URL", () => {
    expect(basename("a/b.png?v=2")).toBe("b.png?v=2")
  })
})

describe("dirname", () => {
  test("returns everything before the last segment", () => {
    expect(dirname("a/b/c.png")).toBe("a/b")
  })

  test("is '.' when there is no directory part, like POSIX", () => {
    expect(dirname("c.png")).toBe(".")
    expect(dirname("")).toBe(".")
  })

  test("strips a leading slash, since paths are deploy-relative here", () => {
    expect(dirname("/a/b.png")).toBe("a")
  })
})

describe("stem", () => {
  test("drops the extension from the last segment", () => {
    expect(stem("a/b/hero.png")).toBe("hero")
    expect(stem("a/b/hero.final.png")).toBe("hero.final")
  })

  test("a leading dot is not an extension", () => {
    expect(stem(".gitignore")).toBe(".gitignore")
  })

  test("no extension leaves the name alone", () => {
    expect(stem("a/b/README")).toBe("README")
  })
})

describe("joinPath", () => {
  // `${base}/${rel}` gives cdn//a.png or cdna.png depending on the data.
  test("collapses to exactly one separator at each joint", () => {
    expect(joinPath("https://cdn.example.com/", "/a/", "b.png")).toBe(
      "https://cdn.example.com/a/b.png",
    )
    expect(joinPath("https://cdn.example.com", "a", "b.png")).toBe(
      "https://cdn.example.com/a/b.png",
    )
  })

  test("preserves the scheme's own double slash", () => {
    expect(joinPath("https://cdn.example.com", "a.png")).toContain("https://")
  })

  test("an empty base yields a bare relative path", () => {
    expect(joinPath("", "a.png")).toBe("a.png")
    expect(joinPath("", "a", "b.png")).toBe("a/b.png")
  })

  test("a root base stays rooted", () => {
    expect(joinPath("/", "a.png")).toBe("/a.png")
    expect(joinPath("/uploads", "a.png")).toBe("/uploads/a.png")
  })

  test("empty segments are skipped rather than doubling the separator", () => {
    expect(joinPath("a", "", "b.png")).toBe("a/b.png")
  })

  test("no segments returns the base unchanged, minus a trailing slash", () => {
    expect(joinPath("a/b/")).toBe("a/b")
  })

  // Lexical, not URL resolution: a later "/x" must not reset to the root.
  test("a leading slash on a later segment does not reset to root", () => {
    expect(joinPath("https://cdn.example.com/base", "/a.png")).toBe(
      "https://cdn.example.com/base/a.png",
    )
  })

  test("does not resolve .. — it stays visible to hasTraversal", () => {
    const joined = joinPath("uploads", "../etc/passwd")
    expect(joined).toBe("uploads/../etc/passwd")
    expect(hasTraversal(joined)).toBe(true)
  })
})

describe("resolveWithin", () => {
  test("joins an ordinary relative path", () => {
    expect(resolveWithin("uploads", "a/b.png")).toBe("uploads/a/b.png")
    expect(resolveWithin("uploads", "./a/b.png")).toBe("uploads/a/b.png")
  })

  test("refuses an entry that escapes the root", () => {
    expect(resolveWithin("uploads", "../../etc/passwd")).toBeNull()
    expect(resolveWithin("uploads", "..")).toBeNull()
    expect(resolveWithin("uploads", "a/../../b")).toBeNull()
  })

  test("refuses the Windows-separator and drive-letter disguises", () => {
    expect(resolveWithin("uploads", "..\\..\\etc\\passwd")).toBeNull()
    expect(resolveWithin("uploads", "C:/../../etc/passwd")).toBeNull()
  })

  test("an absolute entry is rooted under the root, not escaped", () => {
    expect(resolveWithin("uploads", "/etc/passwd")).toBe("uploads/etc/passwd")
  })

  test("allows .. that stays inside the root", () => {
    expect(resolveWithin("uploads", "a/../b.png")).toBe("uploads/b.png")
  })

  test("returns null rather than throwing or silently rewriting", () => {
    expect(resolveWithin("uploads", "")).toBeNull()
    expect(resolveWithin("uploads", "./")).toBeNull()
  })

  test("the result never contains a traversal segment", () => {
    for (const entry of ["a/b.png", "a/../b.png", "/etc/passwd", "./a/./b.png"]) {
      const out = resolveWithin("uploads", entry)
      if (out !== null) expect(hasTraversal(out)).toBe(false)
    }
  })

  test("the result always starts with the root", () => {
    for (const entry of ["a/b.png", "a/../b.png", "/etc/passwd"]) {
      const out = resolveWithin("uploads", entry)
      if (out !== null) expect(out.startsWith("uploads/")).toBe(true)
    }
  })
})
