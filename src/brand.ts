declare const brand: unique symbol

/** A string that carries a compile-time role. Erased at runtime. */
export type Brand<B extends string> = string & { readonly [brand]: B }

/**
 * A value safe to use as a lookup key: canonical, and identical for every
 * spelling of the same path.
 *
 * The bug this prevents, in the type system rather than in review: a table is
 * keyed with `key(ref.name)` and then read with the *emitted* reference, which
 * carries a leading slash. The lookup misses, the value passes through
 * unresolved, and it 404s in production. `Map<PathKey, T>` cannot be read with
 * an `EmittedRef`.
 *
 * Assignable to `string`, but a `string` is not assignable to it — you get one
 * from `washer.key()`, which is the only thing that can promise the property.
 */
export type PathKey = Brand<"PathKey">

/**
 * A value safe to write out: rendered in the washer's configured form, ready
 * for a config file, a database column, or an `<img src>`.
 *
 * Distinct from `PathKey` because the two are different strings for the same
 * asset — that is the entire point of having both, and the entire reason they
 * get mixed up.
 */
export type EmittedRef = Brand<"EmittedRef">

/**
 * Assert that a string already has the properties of a `PathKey`.
 *
 * The escape hatch for values that entered your system already canonical (a
 * database column written by an earlier `key()` call). It does not check —
 * that is what `washer.isClean` is for. Reach for it rarely and near a
 * boundary.
 */
export const asPathKey = (value: string): PathKey => value as PathKey

/** As `asPathKey`, for values already in the emitted form. */
export const asEmittedRef = (value: string): EmittedRef => value as EmittedRef
