# 0003 — JSDoc on the public surface

Status: Accepted

Adds editor hover text as an altitude of its own, requires it on every public
path in both flavors, and enforces that with a check over the built
declarations. Motivated by a public surface that carried no documentation an
editor could show.

## Context

[0002](./0002-documentation-altitudes.md) split the prose docs by altitude
(reference / how-to / rationale / decision records) but said nothing about
documentation *in the code*, because there was effectively none to place.

The gap that left is sharper than it sounds. The package exports one object,
`zostr`, whose leaves are anonymous arrow functions assigned to object
properties (`pubkey: () => classicSchema(z.ZodString, nip01.pubkey())`). Every
`src/nipXX.ts` module is rich in JSDoc, but those modules are not in
`package.json#exports`, and the comments sat on non-exported helpers. The
built declarations — the only thing an editor reads for hover text — carried
**zero** JSDoc across 122 public paths. A consumer typing `zostr.` got a list of
names and nothing else, while the explanations already existed twice: in
internal JSDoc, and in [API.md](../API.md).

The surface also makes some behavior genuinely unguessable from a name.
`metadata()` and `metadataContent()` differ by one word and return different
kinds of thing; `powCheck` verifies achieved difficulty while `commitmentCheck`
verifies the declared target; `protectedCheck` fails closed while
`createdAtCheck` throws on the same class of bad argument; `jsonCodec`'s encode
can throw where `safeParse` intuition says it cannot. Hover text is where a
reader meets those, not the reference they haven't opened.

## Decision

Treat JSDoc as a fifth altitude — **hover summary** — and require it on the
whole public surface.

- **Scope.** Every public path carries a JSDoc comment: each leaf factory, each
  namespace, and `zostr` itself. Both entry points document the same path with
  the **same text**, the way `api-surface.test.ts` already requires them to
  expose the same key tree.
- **Content.** One to three sentences. Say what the schema/codec/check *is*,
  then spend the remaining words on what the name cannot carry — strict vs.
  preserved unknown keys, fail-closed argument handling, encode/decode
  asymmetry, and the distinction from a similarly-named sibling. No worked
  examples (those are how-to) and no rationale for the surface's shape (that is
  `design.md`).
- **References.** JSDoc sits *below* the reference: it summarizes `API.md`, so
  it never links into it. Only the `zostr` root comment names `docs/API.md` and
  `docs/design.md`, as the one entry point into the prose docs. Per-leaf `@see`
  anchors were deliberately left out — they would multiply by 122 and rot on the
  next heading rename.
- **Enforcement.** `scripts/public-jsdoc-check.mjs` walks `dist/classic.d.ts`
  and `dist/mini.d.ts` and fails on any undocumented path, any path present in
  one flavor only, and any path whose two comments differ. It runs in CI after
  the build and in `prepublishOnly`.

Checking the built declarations rather than the sources is the load-bearing
part: they are what an editor actually shows, and they are the one place where
each flavor's scattered namespace constants are already collapsed into a single
tree, which makes flavor parity a straight path-by-path diff.

## Alternatives not chosen

- *Enforce with Biome* — Biome 2.5.6 has no `require-jsdoc` equivalent (its only
  JSDoc rule is `useSingleJsDocAsterisk`), and a GritQL plugin cannot see leading
  trivia: `after`/`contains` predicates fire identically on documented and
  undocumented declarations, and a pattern with the comment written into the
  snippet silently matches nothing. Verified empirically against 2.5.6, and
  matching [biomejs/biome#10474](https://github.com/biomejs/biome/issues/10474).
- *Add ESLint with `eslint-plugin-jsdoc`* — the one linter that can express the
  rule, including on object properties via `contexts`. Rejected because it
  trades a single-linter setup for one rule, and the check below costs no
  dependency at all.
- *TypeDoc's `validation.notDocumented`* — works, and would come with a
  generated API site. But it reports on inferred Zod internals as well: of 380
  warnings, 249 were properties of inferred schema types rather than public
  paths. Worth revisiting as a package if a docs site is ever wanted; not worth
  tuning as a lint.
- *Parse `src/*.ts` instead of the declarations* — TypeScript 7's Go port ships
  no JavaScript compiler API (`ts.createSourceFile` and friends are gone; only
  an `unstable/ast` scanner exists), and the surface is spread across namespace
  constants in two files. The declarations avoid both problems.
- *Require JSDoc only on the non-obvious leaves* — smaller to write, but it
  needs an allowlist, and "is this leaf obvious?" becomes a judgment call on
  every future addition. A blanket rule needs no exception list.

## Consequences

A new public leaf now needs a JSDoc comment in both `classic.ts` and `mini.ts`,
with identical text, or the build fails. `API.md` stays the single reference:
tables, examples, round-trip caveats, and cross-links live there, and it wins
whenever the two disagree — the hover summary is a lossy view of it, not a
second source. Because the check reads `dist/`, it does not run under
`npm test`; `npm run build && npm run test:jsdoc` is the local equivalent of
what CI does.
