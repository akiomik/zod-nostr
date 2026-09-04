# 0004 — Spec baselines

Status: Accepted

Records, per specification, the exact revision the schemas are written against,
in one machine-readable file, and enforces that the README quotes it. Motivated
by a repository that could not say which version of Nostr it implemented.

## Context

Every schema here is derived from a document — a NIP, or a LUD for two of the
kind:0 profile fields. Those documents change. NIP-01 gained a paragraph
specifying `limit: 0`; NIP-67 gained a third completeness hint; LUD-16 gained a
default-identifier shorthand. None of that was visible from the repository: a
reader could see *which* specs were covered, never *which revision* of them.

That gap has two costs. Externally, a consumer deciding whether `zostr.filter()`
matches the relay they are talking to has no way to tell whether the schema
predates a clarification. Internally, keeping up with upstream depended entirely
on someone happening to see a pull request — the NIP-67 hint had been merged for
days, and its absence from the docs was found by accident, while recording these
baselines.

[0002](./0002-documentation-altitudes.md) placed prose by altitude and
[0003](./0003-jsdoc-on-the-public-surface.md) added hover text, but provenance
fits none of those: it is not a rule a schema enforces, so it does not belong in
a docstring, and it is not narrative, so it does not belong in a guide.

## Decision

Record a **spec baseline** per document in `spec-baseline.json`, and treat it as
the single source of truth for provenance.

- **Granularity: one entry per document, not one revision per repository.**
  `nostr-protocol/nips` changes constantly for NIPs this library does not
  implement. A single repository-wide commit would look stale without meaning
  anything, would not say which text any individual schema targets, and could
  not express a document that lives elsewhere at all — which LUD-06 and LUD-16
  do. A `sources` map names each family's repository and label.
- **Content: `commit`, `date`, `sha256`.** The commit identifies the revision;
  `date` is when it landed upstream (the committer date, which for a long-open
  pull request is later than the author date GitHub displays); `sha256` is the
  hash of the document's Markdown at that commit. The hash is the load-bearing
  field — it is what turns a record into something a checker can act on, and the
  reason this is a data file rather than prose.
- **No review date.** An entry says which revision the schemas target; it does
  not say when someone last looked. Recording that would mean stamping every
  document as reviewed whenever one of them is, and the honest alternative —
  bumping only the ones actually re-read — is what git history and
  `CHANGELOG.md` already record. The same fact in two places is the failure this
  file exists to prevent.
- **Bumped on re-reading, not on noticing.** An entry moves only when the
  document has been read and the schemas confirmed against it. A bump is
  therefore worth a changelog line even when no code changed: "we looked, and
  nothing needed to change" is a result.
- **Surfaced in the README.** The `Supported NIPs` table carries a `Spec
  baseline` column linking each NIP at its recorded revision, because a consumer
  reads the README, not a JSON file at the repository root.
- **Enforcement, with `src/` as the authority.** Four places name the same set
  of specs: the modules, the baseline, the `Supported NIPs` table, and the
  coverage paragraph above it. `test/spec-baseline/check.mjs` derives the
  required set from the module filenames — `src/nip67.ts` demands a `nips.67`
  entry, an entry with no module is dead weight, and a module whose family is
  not declared at all is reported — then asserts the file is well formed and
  that both README copies quote it, in both directions. A spec
  added to one place and forgotten in another fails the build. It runs in CI and
  `prepublishOnly`, and stays offline: whether upstream has moved since a
  baseline was recorded is a different question, with a different answer over
  time, from whether the repository agrees with itself.

## Alternatives not chosen

- *A header comment in each `src/nipXX.ts`* — the obvious place, and the reason
  it fails is that there are sixteen of them. Nothing enforces a comment, a
  stale one is invisible, and consumers read the README rather than the source.
  Provenance belongs in one file that a check can read.
- *A single repository revision, or a git submodule* — a submodule makes the
  upstream text diffable but says nothing about whether it has been read, and
  neither form can carry two source repositories.
- *Exporting the baseline at runtime* (`export const SPEC_BASELINE`) — adds
  public surface and bundle weight for something with documentation value only.
  Nothing prevents adding it later if a consumer asks.
- *Checking upstream in the same script* — worth doing, but not here: a network
  call makes the check non-deterministic and turns an unrelated upstream edit
  into a red build on an innocent pull request. A scheduled job that reports the
  diff is the right shape for that, and the `sha256` field is what it will read.

## Consequences

Adding `src/nipXX.ts` now means adding a baseline entry, a table row, and a
mention in the coverage paragraph, or the build fails; adding a document from a
new family means adding a `sources` entry too.
Re-reading a spec is a reviewable change with a diff, rather than an
undocumented act of diligence. The baseline is a claim about the text a schema
targets, not a guarantee that upstream has not moved since — until the scheduled
comparison exists, an entry going stale is still noticed by hand.
