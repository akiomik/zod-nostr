# 0004 — Spec baselines

Status: Accepted

Records, per specification, the exact revision the schemas are written against,
in one machine-readable file that nothing else repeats. Motivated by a
repository that could not say which version of Nostr it implemented.

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
- **Shape: `sources`, then `documents` keyed the same.** `sources` names each
  document family — its label and its repository — and `documents` holds that
  family's entries under the same key, so the file says what its own keys mean
  and a reader never has to know which top-level keys are data.
- **Content: `commit`, `date`, `sha256`.** The commit identifies the revision;
  `date` is when it landed upstream (the committer date, which is not always the
  author date a commit page shows); `sha256` is the
  hash of the document's Markdown at that commit. The hash is the load-bearing
  field: the commit names a revision and the hash names its text, so an entry
  can be confirmed against the document rather than taken on trust. Being a
  data file rather than prose is what lets a check read it.
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
- **Recorded once, pointed at from the README.** The `Supported NIPs` table
  links no revisions and the prose beside it points at `spec-baseline.json`
  instead. Repeating each revision in the table would read better — a consumer
  reads the README, not a JSON file at the repository root — but it makes the
  same fact live in two files, and keeping those in step means reading the
  README as Markdown. That parser grew larger than the record it guarded, so
  the duplication goes rather than the guard.
- **A module is named for the document it implements.** Provenance is read from
  filenames, so a spec module is `src/<label><id>.ts`, written lowercase as
  every one of them is — `src/nip67.ts` for NIP-67, `src/lud01.ts` for LUD-01,
  though the check matches without regard for case or for how deep under `src/`
  it sits — and it must name the document whose rules the module encodes, not
  the field that happens to carry the value. The baseline's own key is the
  upstream filename's stem, so it is written as that file is: `7D`, not `7d`.
  Both are two characters, which is what a document id is in these series and
  what the check looks for on either side; a module whose stem is another width
  is not one of these, and neither is another extension. The check reads names
  and not the directory entries behind them, so it would take a directory named
  `src/nip99.ts` for a module; nothing is done about that, since the mistake it
  would miss is not one anybody makes. Two files naming one document is
  reported as that rather than silently sharing an entry.
  The kind:0 `lud06` field carries an LNURL, but the encoding is LUD-01's and
  LUD-06 defines only what the decoded URL answers with, so the module is
  `lud01.ts` and the field keeps its ecosystem name at `metadataFields.lud06()`
  — the same split as `metadataFields.nip05()` referencing
  `nip05.identifier()`.
- **`sources` declares which families are checked; `src/` decides what each of
  them must baseline.** Two places name the same set of specs — the modules and
  the baseline — and within a family `sources` declares, the modules decide:
  `src/nip67.ts` calls for a `nips.67` entry, and an entry with no module is
  dead weight. Which families exist is what `sources` says, so a family it does
  not name is not checked — and naming one on only one side of the file, in
  `sources` or in `documents`, is reported, since that is a half-finished edit
  rather than a declaration. The two are kept in step by
  `scripts/spec-baseline-check.mjs`, in both directions, in CI and
  `prepublishOnly`.

  The check compares the repository against itself and nothing else. It does not
  fetch upstream — whether a spec has moved since a baseline was recorded is a
  different question, with a different answer over time, and asking it here
  would fail an innocent pull request on an unrelated upstream edit. It reads no
  Markdown, because there is no second copy of a revision to hold the README to.
  And it assumes the baseline is well-formed JSON a maintainer wrote: it asserts
  what someone plausibly gets wrong, which is updating one file and not the
  other, and not the ways a hand-corrupted file could be malformed. Those fail
  the build anyway, and guarding each one costs more than the case is worth.

  Its rules are pinned by `scripts/spec-baseline.test.mjs`, which is why they
  live in `spec-baseline.mjs` as a function of its two inputs, with reading
  files and exiting left to the CLI beside it. A script nothing exercises
  invites an open-ended argument about how good each diagnostic is; one with a
  contract answers that with a case, or with a deliberate change to one.

## Alternatives not chosen

- *A header comment in each `src/<label><id>.ts`* — the obvious place, and the
  reason it fails is that there are sixteen of them. Nothing enforces a comment, a
  stale one is invisible, and consumers read the README rather than the source.
  Provenance belongs in one file that a check can read.
- *A single repository revision, or a git submodule* — a submodule makes the
  upstream text diffable but says nothing about whether it has been read, and
  neither form can carry two source repositories.
- *Exporting the baseline at runtime* (`export const SPEC_BASELINE`) — adds
  public surface and bundle weight for something with documentation value only.
  Nothing prevents adding it later if a consumer asks.

## Consequences

Adding `src/nipXX.ts` now means adding a baseline entry, or the build fails.
The README's `Supported NIPs` table and its opening `Covers NIP-…` sentence
still name the specs this library implements, and stay hand-maintained prose.
No revision is written there, so none can fall out of step with the baseline;
what they list is coverage, and a NIP missing from either is support a reader
cannot find rather than provenance gone stale. `docs/design.md` carries that
requirement. A document from a new family needs a `sources` entry as well — a
requirement this record carries, not one the check can demand, for the reason
below. Re-reading a spec is a reviewable change with a diff, rather than an
undocumented act of diligence. The baseline is a claim about the text a schema
targets, not a guarantee that upstream has not moved since. Diffing from the
recorded commit is how a maintainer finds out, which is what the file is there
to make possible.

Two gaps stay open. The first is that only one of an entry's three fields
stands on its own: a `commit` is a name, while `date` and `sha256` are claims
about what that name points at — when it landed, and what its text was.
Confirming a claim means fetching the document, and no check that reads only
this repository does; the name itself is never looked up either. Entries are
held to each other, but agreement is not confirmation: one wrong day pasted
into every entry that shares a commit passes. An entry is true because whoever
wrote it hashed the document as they read it — care taken at the keyboard, not
something the build can demand.

The second follows from provenance being read from filenames: a specification
implemented **inside an existing module** rather than in its own file is
invisible to the check. NIP-24 is caught only because `src/nip24.ts` exists,
and folding those fields into `src/nip01.ts` instead would have shipped them
unbaselined. That is a judgement made when the spec is added, and this record
is where the requirement lives.

Registering a family is such a judgement too, and deliberately so rather than
by omission: no filename rule separates a `bolt11.ts` worth baselining from a
`bech32.ts` that is an ordinary helper, so `sources` says which families exist
and the check reads it. Adding or removing one is an edit to `spec-baseline.json`
that a reader sees in the diff — unlike adding a module, which leaves the
baseline untouched, which is why the check watches that direction.
