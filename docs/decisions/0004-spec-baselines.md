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
  not express a document that lives elsewhere at all — which LUD-01 and LUD-16
  do. A `sources` map names each family's repository and label.
- **Content: `commit`, `date`, `sha256`.** The commit identifies the revision;
  `date` is when it landed upstream (the committer date, which is not always the
  author date a commit page shows); `sha256` is the
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
- **A module is named for the document it implements.** The check reads
  provenance from filenames, so `src/<label><id>.ts` must name the document
  whose rules the module encodes — not the field that happens to carry the
  value. The kind:0 `lud06` field carries an LNURL, but the encoding is LUD-01's
  and LUD-06 defines only what the decoded URL answers with, so the module is
  `lud01.ts` and the field keeps its ecosystem name at
  `metadataFields.lud06()` — the same split as `metadataFields.nip05()`
  referencing `nip05.identifier()`.
- **Enforcement, with `src/` as the authority.** Four places name the same set
  of specs: the modules, the baseline, the `Supported NIPs` table, and the
  coverage paragraph above it. `test/spec-baseline/check.mjs` derives the
  required set from the module filenames of a declared family — `src/nip67.ts`
  demands a `nips.67` entry, and an entry with no module is dead weight — then
  asserts the file is well formed and that both README copies quote it, in both
  directions. A spec
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
  diff is the right shape for that, and the `sha256` field is what it will read
  — against the text at the recorded commit as well as at the current head, so
  that it also answers whether the entry is internally consistent.

## Consequences

Adding `src/nipXX.ts` now means adding a baseline entry, a table row, and a
mention in the coverage paragraph, or the build fails. A document from a new
family needs a `sources` entry as well — a requirement this record carries, not
one the check can demand, for the reason below. Re-reading a spec is a
reviewable change with a diff, rather than an undocumented act of diligence. The
baseline is a claim about the text a schema targets, not a guarantee that
upstream has not moved since — until the scheduled comparison exists, an entry
going stale is still noticed by hand.

Three gaps are left open deliberately. The first is that nothing offline can tie
an entry's `sha256` or `date` to its `commit`: both are facts about a repository
this one does not vendor, so a bump that updates `commit` and the README but
carries the old hash — or a plausible wrong day — passes every check here. It is the field the design
rests on, so the scheduled comparison should hash the recorded commit too rather
than only the current head — otherwise a stale hash reads as an upstream change
that never happened.

The other two follow from the check deciding what it can read from filenames and
nothing more. A specification implemented **inside an existing module** rather
than in its own file is invisible to it: NIP-24 is caught only because
`src/nip24.ts` exists, and folding those fields into `src/nip01.ts` instead
would have shipped them unbaselined. So is a module of a **family `sources`
never declares** — no filename rule separates a `bolt11.ts` worth baselining
from a `bech32.ts` that is an ordinary helper, and a guess in either direction
was tried and produced worse diagnostics than it prevented. Both are judgements
made when the spec is added, and this record is where the requirement lives.
