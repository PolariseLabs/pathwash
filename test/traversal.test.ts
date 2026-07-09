import { describe, expect, test } from "bun:test"
import {
  assertCleanPath,
  hasTraversal,
  isCleanPath,
  sanitiseFilename,
  sanitisePath,
} from "../src/index.js"

/**
 * `sanitisePath` used to run `..` through `sanitiseFilename`, which strips
 * leading dots and reduced it to an empty segment. The segment was then
 * filtered out, so `../../etc/passwd` sanitised to `etc/passwd` and
 * `hasTraversal` reported false on the result: a hostile path laundered into a
 * plausible one, which is precisely what `normalisePath` refuses to do.
 */
describe("sanitisePath does not launder traversal", () => {
  test("preserves .. segments verbatim", () => {
    expect(sanitisePath("../../etc/passwd")).toBe("../../etc/passwd")
    expect(sanitisePath("a/../b.png")).toBe("a/../b.png")
  })

  test("traversal survives sanitising so it can still be detected", () => {
    for (const hostile of ["../../etc/passwd", "a/../b.png", "a/../../b.png"]) {
      expect(hasTraversal(sanitisePath(hostile))).toBe(true)
    }
  })

  test("still sanitises the non-traversal segments around it", () => {
    expect(sanitisePath("../My Photo (1).PNG")).toBe("../my-photo-1.png")
  })

  test("a lone .. filename still reduces to nothing", () => {
    // sanitiseFilename is a *filename* function; ".." is not a filename.
    expect(sanitiseFilename("..")).toBe("")
  })

  test("ordinary paths are unaffected", () => {
    expect(sanitisePath("levels/My Game/a.PNG")).toBe("levels/my-game/a.png")
  })
})

describe("assertCleanPath refuses traversal", () => {
  test("throws on a canonical-but-hostile path", () => {
    // Canonical under sanitisePath, yet unsafe: the assert is the boundary.
    expect(isCleanPath("../../etc/passwd")).toBe(true)
    expect(() => assertCleanPath("../../etc/passwd")).toThrow(/traversal/i)
  })

  test("throws on traversal before complaining about canonical form", () => {
    expect(() => assertCleanPath("../My Photo.PNG")).toThrow(/traversal/i)
  })

  test("still throws on a merely-uncanonical path", () => {
    expect(() => assertCleanPath("My Photo.PNG")).toThrow(/canonical/i)
  })

  test("accepts a clean, traversal-free path", () => {
    expect(() => assertCleanPath("levels/my-game/a.png")).not.toThrow()
  })
})
