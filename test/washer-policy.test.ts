import { describe, expect, test } from "bun:test"
import { createWasher, caseCollisions, segments } from "../src/index.js"

const isCssColour = (v: string) => /^#[0-9a-f]{3,8}$/i.test(v)

/**
 * One washer, configured once, standing in for a real deployment pipeline:
 * assets live at the tree root, some refs are colours, one backend hands out
 * scheme-less hosts, and the emitted config is loaded from nested routes.
 */
const assetPaths = createWasher({
  externalUrls: "allow",
  hosts: ["storage.example.com"],
  passthrough: isCssColour,
  stripPrefixes: ["frontend/public/", "public/"],
  form: "absolute",
})

describe("a washer is the whole policy", () => {
  test("key is bare and emit is absolute, from the same washer", () => {
    expect<string>(assetPaths.key("/avatars/UK.png")).toBe("avatars/uk.png")
    expect<string>(assetPaths.emit("avatars/UK.png")).toBe("/avatars/uk.png")
  })

  // The bug this library exists to prevent: a table keyed on one spelling
  // misses the other two, silently.
  test("every spelling of a path lands on one key", () => {
    const keys = new Set(
      ["avatars/uk.png", "/avatars/uk.png", "./avatars/uk.png"].map((v) => assetPaths.key(v)),
    )
    expect(keys.size).toBe(1)
  })

  test("emit is stable regardless of how the value was written", () => {
    for (const v of ["avatars/uk.png", "/avatars/uk.png", "./avatars/uk.png"]) {
      expect<string>(assetPaths.emit(v)).toBe("/avatars/uk.png")
    }
  })

  test("key and emit are both idempotent, and agree with each other", () => {
    const emitted = assetPaths.emit("avatars/UK.png")
    expect<string>(assetPaths.emit(emitted)).toBe(emitted)
    expect<string>(assetPaths.key(emitted)).toBe(assetPaths.key("avatars/UK.png"))
  })

  test("deploy roots are stripped by the washer, not by each caller", () => {
    expect<string>(assetPaths.key("frontend/public/img/a.png")).toBe("img/a.png")
    expect<string>(assetPaths.emit("public/img/a.png")).toBe("/img/a.png")
  })
})

describe("passthrough: the library never learns your domain", () => {
  test("a colour is not a path, and no method touches it", () => {
    for (const colour of ["#ff0000", "#FFF", "#11223344"]) {
      expect(assetPaths.clean(colour)).toBe(colour)
      expect<string>(assetPaths.key(colour)).toBe(colour)
      expect<string>(assetPaths.emit(colour)).toBe(colour)
      expect(assetPaths.toUrl(colour)).toBe(colour)
      expect(assetPaths.isClean(colour)).toBe(true)
      expect(assetPaths.isPassthrough(colour)).toBe(true)
      expect(() => assetPaths.assertClean(colour)).not.toThrow()
    }
  })

  // Without passthrough, "#ff0000" would be treated as a path and emitted as
  // "/#ff0000" — a broken image, which is exactly how this bug shows up.
  test("without passthrough the same value would be mangled", () => {
    const naive = createWasher({ externalUrls: "allow", form: "absolute" })
    expect<string>(naive.emit("#ff0000")).not.toBe("#ff0000")
  })

  test("a scheme-less configured host survives untouched", () => {
    const ref = "abc-123.storage.example.com/img/A.png"
    expect(assetPaths.clean(ref)).toBe(ref)
    expect<string>(assetPaths.emit(ref)).toBe(ref)
    expect(assetPaths.isPassthrough(ref)).toBe(true)
  })

  test("an unconfigured host is just a path, and gets normalised", () => {
    const naive = createWasher({ externalUrls: "allow" })
    expect(naive.clean("abc-123.storage.example.com/img/A.png")).toBe(
      "abc-123.storage.example.com/img/a.png",
    )
  })

  test("ordinary external urls and inline values still pass through", () => {
    for (const v of ["https://cdn.example.com/a.png", "data:image/png;base64,AA", "blob:https://x/y"]) {
      expect<string>(assetPaths.emit(v)).toBe(v)
    }
  })

  test("a rejecting washer still refuses external urls, but honours passthrough", () => {
    const strict = createWasher({ externalUrls: "reject", passthrough: isCssColour })
    expect(() => strict.clean("https://cdn.example.com/a.png")).toThrow(/External URL/)
    expect(strict.clean("#ff0000")).toBe("#ff0000")
  })
})

describe("folderName", () => {
  test("defaults preserve underscores and collapse dots", () => {
    expect(assetPaths.folderName("My_Level")).toBe("my_level")
    expect(assetPaths.folderName("v1.2 Intro")).toBe("v1-2-intro")
  })

  test("policy is set once on the washer, not per call", () => {
    const casePreserving = createWasher({ folder: { lowercase: false } })
    expect(casePreserving.folderName("My_Level")).toBe("My_Level")
  })
})

describe("within: zip-slip, decided by the washer's caller", () => {
  test("joins an ordinary entry and refuses an escaping one", () => {
    expect(assetPaths.within("uploads", "a/b.png")).toBe("uploads/a/b.png")
    expect(assetPaths.within("uploads", "../../etc/passwd")).toBeNull()
    expect(assetPaths.within("uploads", "..\\..\\etc\\passwd")).toBeNull()
  })
})

describe("caseCollisions", () => {
  test("finds paths differing only by case", () => {
    const groups = caseCollisions(["a/Logo.png", "a/logo.png", "b/x.png"])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.sort()).toEqual(["a/Logo.png", "a/logo.png"])
  })

  test("no collisions yields an empty array", () => {
    expect(caseCollisions(["a.png", "b.png"])).toEqual([])
  })

  test("reachable from a washer too", () => {
    expect(assetPaths.caseCollisions(["A.png", "a.png"])).toHaveLength(1)
  })
})

describe("segments", () => {
  test("splits without the caller re-deriving the edge cases", () => {
    expect(segments("levels/intro/a.png")).toEqual(["levels", "intro", "a.png"])
    expect(segments("/a//b/./c")).toEqual(["a", "b", "c"])
    expect(segments("a\\b")).toEqual(["a", "b"])
    expect(segments("")).toEqual([])
  })

  // "The folder after `levels/`" is the caller's concept, not the library's.
  test("lets a caller answer domain questions without the library knowing them", () => {
    expect(segments("levels/intro/a.png")[1]).toBe("intro")
  })

  test("traversal stays visible", () => {
    expect(segments("a/../b")).toEqual(["a", "..", "b"])
  })
})
