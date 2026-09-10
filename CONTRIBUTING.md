# Contributing

Everything that stays in the repository is written in English: commit messages,
pull request bodies, code and its comments, and everything under `docs/`.

CI runs the checks and gates `package.json` declares. This file is about the
conventions none of them can check for you.

## Commits

Commit messages follow [Conventional Commits 1.0.0][cc].

A breaking change must be marked, in the prefix or in the footer (rule 11):
`!` before the `:`, or a `BREAKING CHANGE:` footer. If you take the `!` and
omit the footer, rule 13 makes the *description* the place where the break is
described: `fix!: reject filter values that are not 64-character hex`, not
`fix!: correct the filter regex`. That second half is the easy one to miss, and
nothing here verifies it — the repository runs no commit linter.

What counts as breaking, including type-only breaks, is in
[docs/design.md](docs/design.md#compatibility-and-versioning). The commit's
marking, the changelog's `**Breaking:**` bullet and the pull request body say
one thing between them; fixing only one moves the contradiction rather than
closing it.

Pull requests merge with a merge commit, the only method this repository
enables, so each commit's subject reaches `main` where its marking can be read.

Leave out anything a reader outside the repository cannot resolve — internal
work-phase labels, review round numbers, scratch file names. Version numbers,
issue and pull request numbers, and plain description all travel.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog 1.1.0][kac], and the project is
versioned with [Semantic Versioning][semver]. Which digit a change moves is
decided in [docs/design.md](docs/design.md#compatibility-and-versioning).

- Not every change needs an entry. Keep a Changelog calls the file a curated
  list of *notable* changes written for humans rather than a commit log, and
  leaves *notable* to the project. Here it means the reader is someone deciding
  whether and how to upgrade, so an entry goes in when the change reaches the
  published package — its API, its runtime behavior, its inferred types, the
  documentation that ships inside the declarations — or when it moves which
  revision of a specification the schemas are written against
  ([decision 0004](docs/decisions/0004-spec-baselines.md) asks for a line even
  when no code changed). Everything else is repository work and gets none:
  contributor documents and conventions, guides, decision records, tests,
  tooling, refactoring, dependency bumps, and `README.md` — which documents the
  library rather than changing it, so a `Supported NIPs` row belongs to the
  release that added the support, not to the one that wrote the row.
- Released sections are history. They record where the line fell when they were
  written, which is not always where it falls now; the rule above decides a new
  entry, not the entries above it.
- Where one is needed, write it under `## [Unreleased]` in the same pull
  request as the change. Releases do not write entries; they only move that
  section under a version heading.
- Use only the standard type headings: `Added`, `Changed`, `Deprecated`,
  `Removed`, `Fixed`, `Security`. No suffixes on them, no invented types, and
  one block per type per version.
- Mark a breaking entry with a `- **Breaking:**` or `- **Breaking (type-only):**`
  bullet inside the relevant type, rather than a heading of its own.
- Fold before/after migration examples into the bullet as a ` ```ts ` block.

## Documentation

The prose docs are split by altitude, and references flow one way — how-to →
reference → rationale. [Decision 0002](docs/decisions/0002-documentation-altitudes.md)
has the reasoning; the short version is:

| Change | Goes in |
| --- | --- |
| What a symbol is and how it behaves | [docs/API.md](docs/API.md) |
| How to accomplish a task with the library | [docs/guides.md](docs/guides.md) |
| Why the public surface is shaped this way | [docs/design.md](docs/design.md) |
| A specific decision worth recording | [docs/decisions/](docs/decisions/) |

A higher-altitude document's own content stands without the lower ones.
`design.md` does not reference `guides.md` at all; `API.md` and `README.md`
carry *see also* pointers down to `guides.md` as navigation.

Any example in a document, an issue reply or a pull request gets built and run
first, in **both** flavors and **both** directions: a schema shown with
`jsonCodec` has to decode *and* encode. A one-way `.transform()` reads fine on
the page and throws on encode.

## Schemas and specs

[docs/design.md](docs/design.md#verification-requirements) lists what a public
API addition ships with, and CI gates most of it. Three things no gate can
decide for you:

- **Do not accept what the specification does not.** Enumerate the accept and
  reject boundary from the spec text before implementing, and check that the
  enumerated domains — kind classes, marker vocabularies, structured
  coordinates — actually reject garbage. A validator that is loose today cannot
  be tightened later without that being a breaking change.
- **Do not carry a rule from one specification to another by analogy.** Each
  constraint has to be stated by the document you are implementing. NIP-13's
  target difficulty was once given NIP-01's canonical-integer rule, which NIP-13
  does not state, and spec-valid `"05"` was rejected. Over-constraining is the
  same defect as under-constraining.
- **An opt-in check fails closed.** For a factory argument, ask whether a bad
  one would disable the check silently rather than fail it; where it would,
  validate it as the check is composed and throw there. A parsed value is the
  other case: validate it inside the check and *fail the check*, because
  `safeParse` never throws and a consumer may reach the check through a looser
  schema of their own.

## Tests

- Tests sit beside what they cover: `src/` for the library, `scripts/` for the
  build's own checks, `test/consumer/` for the fixture the packed-consumer gate
  compiles. Group the library's tests one file per spec document
  (`src/nip01.test.ts`), or per public surface where one spans several — NIP-24's
  fields are covered by `src/metadata-fields.test.ts`, not a file of their own.
- `describe.each` over both flavors, so a single body verifies classic and mini.
  Whatever form the pair takes — a local `FLAVORS` binding in most files, a
  literal at the call in `api-surface.test.ts` and `release-surface.test.ts` —
  each file spells it out itself; there is no shared helper to import. A test
  with no flavor dimension needs none of it: `internet-identifier.test.ts`
  covers an internal predicate.
- Prefer the functional top-level API that both flavors have: `z.parse`,
  `z.safeParse`, `z.decode`, `z.encode`.
- `src/flavor-methods.test.ts` carries only the instance-method differences
  between the flavors; nothing else belongs there.
- `it.each` for lists of like inputs, so a failure names itself. A multi-step
  single scenario stays one `it`.
- Assert output **types** with `expectTypeOf`, in both flavors. Each re-wraps
  the shared core through its own helpers, so inference can degrade to
  `unknown` in one and not the other.
- Coverage is at 100% and stays there. `npm run test:coverage` reports it and
  `npm test` does not. Nothing stops a drop: vitest sets no threshold, and
  Codecov turns its status red without being one of the checks `main` requires.
  The number covers `src/` alone, so a branch added under `scripts/` is
  untested at 100%.

## Releasing

See [RELEASING.md](RELEASING.md).

[cc]: https://www.conventionalcommits.org/en/v1.0.0/
[kac]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html
