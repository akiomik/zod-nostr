<!-- What changes, and why. -->

- [ ] `CHANGELOG.md` has an entry under `## [Unreleased]`, or this needs none
- [ ] If this breaks the public API — a name, an accepted value, an object's
      unknown-key semantics, or an inferred type — the commit is marked `type!:`
      with the break stated in its description, or carries a `BREAKING CHANGE:`
      footer, and the changelog entry is prefixed `**Breaking:**`, or
      `**Breaking (type-only):**` when runtime behavior is unchanged
- [ ] New or changed public API: runtime and `expectTypeOf` tests in both
      flavors, and `docs/API.md` updated
- [ ] New spec module: its entry in `spec-baseline.json`. A module whose family
      is declared in neither `sources` nor `documents` is never scanned, so
      nothing will report it missing
- [ ] New NIP: its row in `README.md`'s `Supported NIPs` table **and** the
      `Covers NIP-…` sentence above it — nothing checks either
- [ ] Any example added to a document was built and run, in both flavors and in
      both directions (a codec has to decode *and* encode)

<!-- Rendered as a PR body, so this has to be an absolute URL: GitHub resolves
     relative links in issue and PR bodies against the page, not the repo. -->

See [CONTRIBUTING.md](https://github.com/akiomik/zod-nostr/blob/main/CONTRIBUTING.md).
