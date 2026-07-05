import { describe, expect, test } from "bun:test"
import { createWasher } from "../src/index.js"

describe("createWasher", () => {
  test("default washer: sanitises paths, rejects external urls", () => {
    const w = createWasher()
    expect(w.clean("My Assets\\Hero Image.PNG")).toBe("my-assets/hero-image.png")
    expect(() => w.clean("https://cdn.example.com/a.png")).toThrow(/External URL/)
    expect(w.isClean("https://cdn.example.com/a.png")).toBe(false)
  })

  test("relative-only vs external-allowing washers from the same factory", () => {
    const relative = createWasher({ externalUrls: "reject" })
    const mixed = createWasher({ externalUrls: "allow", stripQueryAndHash: true })

    expect(relative.isClean("img/hero.png")).toBe(true)
    expect(relative.isClean("//cdn.example.com/a.png")).toBe(false)

    expect(mixed.clean("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png")
    expect(mixed.isClean("https://cdn.example.com/a.png")).toBe(true)
    expect(mixed.clean("img/Hero.png?v=2#x")).toBe("img/hero.png")
  })

  test("normalise-only washer (sanitise: false) keeps names, fixes separators", () => {
    const w = createWasher({ sanitise: false })
    expect(w.clean("a\\Hero Image.PNG")).toBe("a/Hero Image.PNG")
    expect(w.isClean("a/Hero Image.PNG")).toBe(true)
    expect(w.isClean("a\\Hero Image.PNG")).toBe(false)
  })

  test("sanitise options flow through, e.g. case-preserving", () => {
    const w = createWasher({ sanitise: { lowercase: false } })
    expect(w.clean("a/Hero Image.PNG")).toBe("a/Hero-Image.PNG")
    expect(w.cleanFilename("Hero Image.PNG")).toBe("Hero-Image.PNG")
  })

  test("fixed point holds per washer: isClean(x) === (clean(x) === x)", () => {
    const washers = [
      createWasher(),
      createWasher({ externalUrls: "allow" }),
      createWasher({ sanitise: false }),
      createWasher({ sanitise: { lowercase: false }, stripQueryAndHash: true }),
    ]
    const inputs = [
      "img/hero.png",
      "img\\Hero Image.PNG",
      "https://cdn.example.com/a.png",
      "café.png",
      "a/b.png?v=1",
    ]
    for (const w of washers) {
      for (const input of inputs) {
        let cleaned: string | null = null
        try {
          cleaned = w.clean(input)
        } catch {
          // rejected external URL
        }
        expect(w.isClean(input)).toBe(cleaned === input)
        if (cleaned !== null) expect(w.isClean(cleaned)).toBe(cleaned !== "")
      }
    }
  })

  test("analyse uses washer defaults, per-call options win", () => {
    const w = createWasher({ analyse: { stripCommonRoot: false } })
    const entries = [{ path: "wrap/A File.txt" }, { path: "wrap/b.txt" }]
    expect(w.analyse(entries).commonRoot).toBeNull()
    expect(w.analyse(entries).entries[0]?.to).toBe("wrap/a-file.txt")
    expect(w.analyse(entries, { stripCommonRoot: true }).commonRoot).toBe("wrap")
  })

  test("assertClean names the canonical form", () => {
    const w = createWasher()
    expect(() => w.assertClean("img/Hero.PNG")).toThrow(/img\/hero\.png/)
    expect(() => w.assertClean("img/hero.png")).not.toThrow()
  })
})
