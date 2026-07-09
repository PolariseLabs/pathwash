import { describe, expect, test } from "bun:test"
import {
  asPathKey,
  createWasher,
  folderSlug,
  formatPath,
  resolveWithin,
  type EmittedRef,
  type PathForm,
  type PathKey,
} from "../src/index.js"

/**
 * Compile-time assertions. `bun test` does not typecheck, so these are enforced
 * by `bun run typecheck` (tsconfig includes `test`). The `@ts-expect-error`
 * lines FAIL THE BUILD if the expression starts compiling — that is the
 * assertion. The runtime `expect`s below only keep the file honest as a test.
 */

const w = createWasher({ form: "absolute" })

describe("brands separate a lookup key from an emitted ref", () => {
  test("a key cannot be used where an emitted ref is required", () => {
    const takesEmitted = (_: EmittedRef): void => {}
    takesEmitted(w.emit("a.png"))
    // @ts-expect-error a PathKey is not an EmittedRef — they are different strings
    takesEmitted(w.key("a.png"))
  })

  test("an emitted ref cannot be used where a key is required", () => {
    const table = new Map<PathKey, number>()
    table.set(w.key("a.png"), 1)
    expect(table.get(w.key("/a.png"))).toBe(1)
    // @ts-expect-error this is the CL-795 bug: reading a key-table with an emitted ref
    table.get(w.emit("a.png"))
  })

  test("a bare string cannot masquerade as either", () => {
    const takesKey = (_: PathKey): void => {}
    // @ts-expect-error only `key()` (or the explicit escape hatch) can promise this
    takesKey("a.png")
    takesKey(asPathKey("a.png")) // the escape hatch is explicit and greppable
  })

  test("but both are still plain strings downstream", () => {
    const takesString = (s: string): string => s.toUpperCase()
    expect(takesString(w.key("a.png"))).toBe("A.PNG")
    expect(takesString(w.emit("a.png"))).toBe("/A.PNG")
  })

  test("the brand is erased at runtime", () => {
    expect(typeof w.key("a.png")).toBe("string")
    expect<string>(w.key("/a.png")).toBe("a.png")
    expect<string>(w.emit("a.png")).toBe("/a.png")
  })
})

describe("literal unions, so options autocomplete and typos fail", () => {
  test("PathForm is closed", () => {
    const form: PathForm = "absolute"
    expect(formatPath("a.png", form)).toBe("/a.png")
    // @ts-expect-error "root" is not a PathForm
    formatPath("a.png", "root")
  })

  test("folderSlug dots is closed", () => {
    expect(folderSlug("v1.2", { dots: "collapse" })).toBe("v1-2")
    // @ts-expect-error "drop" is not a dots policy
    folderSlug("v1.2", { dots: "drop" })
  })

  test("washer options are closed", () => {
    // @ts-expect-error "permit" is not an externalUrls policy
    createWasher({ externalUrls: "permit" })
    // @ts-expect-error unknown option — excess property check catches the typo
    createWasher({ stripPrefix: ["public/"] })
  })
})

describe("nullability is in the type, not the docs", () => {
  test("resolveWithin returns null rather than throwing", () => {
    const out = resolveWithin("uploads", "../escape")
    expect(out).toBeNull()

    // Typechecked, never invoked: calling it would throw, which is the point —
    // the type forces the narrowing that the runtime also demands.
    const _mustNarrow = (): void => {
      // @ts-expect-error must narrow before use — `string | null`
      out.toUpperCase()
    }
    expect(typeof _mustNarrow).toBe("function")

    const safe = resolveWithin("uploads", "a/b.png")
    if (safe !== null) expect(safe.toUpperCase()).toBe("UPLOADS/A/B.PNG")
  })
})
