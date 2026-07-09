import { describe, expect, test } from "bun:test"
import { folderSlug } from "../src/index.js"

/**
 * A deployed directory is named from an authored title, but other things
 * reference it verbatim: a config `src`, an iframe URL, a zip entry. Rewriting
 * `my_level/` to `my-level/` while the reference still says `my_level` 404s at
 * runtime with no warning. Underscores survive; only the shapes a static host
 * actually mishandles are removed.
 */
describe("folderSlug preserves underscores", () => {
  test("keeps `_` under every option combination", () => {
    expect(folderSlug("my_level")).toBe("my_level")
    expect(folderSlug("my_level", { lowercase: true })).toBe("my_level")
    expect(folderSlug("Module_02_Intro", { lowercase: true })).toBe("module_02_intro")
    expect(folderSlug("my_level", { dots: "collapse" })).toBe("my_level")
  })
})

describe("folderSlug dots option", () => {
  test("keeps dots by default", () => {
    expect(folderSlug("v1.2 Intro")).toBe("v1.2-Intro")
    expect(folderSlug("v1.2 Intro", { dots: "keep" })).toBe("v1.2-Intro")
  })

  test("collapses each run of dots to one hyphen", () => {
    expect(folderSlug("v1.2 Intro", { dots: "collapse" })).toBe("v1-2-Intro")
    expect(folderSlug("a...b", { dots: "collapse" })).toBe("a-b")
  })

  test("does not leave doubled hyphens behind", () => {
    expect(folderSlug("a-.-b", { dots: "collapse" })).toBe("a-b")
    expect(folderSlug("a. b", { dots: "collapse" })).toBe("a-b")
  })

  test("composes with lowercase, maxLength and fallback", () => {
    expect(folderSlug("V1.2 Intro", { dots: "collapse", lowercase: true })).toBe("v1-2-intro")
    expect(folderSlug("v1.2 Intro", { dots: "collapse", maxLength: 4 })).toBe("v1-2")
    expect(folderSlug("...", { dots: "collapse", fallback: "level" })).toBe("level")
  })
})

/** Shapes a static host mishandles, removed under both settings. */
describe("folderSlug never emits a hostile directory name", () => {
  test("trims a leading dot, so no hidden directory", () => {
    for (const dots of ["keep", "collapse"] as const) {
      expect(folderSlug(".hidden", { dots })).toBe("hidden")
      expect(folderSlug("..evil", { dots })).toBe("evil")
    }
  })

  test("trims leading underscore and hyphen", () => {
    expect(folderSlug("_private")).toBe("private")
    expect(folderSlug("-dash")).toBe("dash")
  })

  test("cannot produce a traversal segment", () => {
    expect(folderSlug("..", { fallback: "level" })).toBe("level")
    expect(folderSlug("../..", { fallback: "level" })).toBe("level")
  })

  test("an all-punctuation name falls back rather than emitting an empty segment", () => {
    expect(folderSlug("___", { fallback: "level" })).toBe("level")
    expect(folderSlug("!!!", { fallback: "level" })).toBe("level")
  })

  test("strips path separators, so a slug can never widen into a path", () => {
    expect(folderSlug("a/b")).toBe("ab")
    expect(folderSlug("a\\b")).toBe("ab")
  })

  test("is idempotent under both settings", () => {
    for (const dots of ["keep", "collapse"] as const) {
      const once = folderSlug("V1.2 My_Level!", { dots, lowercase: true })
      expect(folderSlug(once, { dots, lowercase: true })).toBe(once)
    }
  })
})
