# Releasing

Publishing is automated: `.github/workflows/publish.yml` runs on
`release: published` and publishes with OIDC trusted publishing, so there is no
npm token to manage. It re-runs the repository's checks first, and `npm publish`
fires `prepublishOnly`, which runs more of them — so a publish can fail after
every visible step has gone green.

**Publishing the GitHub Release is the point of no return.** A draft is not.

## Choosing the version

[docs/design.md](docs/design.md#compatibility-and-versioning) defines what counts
as breaking and which digit a breaking change moves before 1.0.
[CONTRIBUTING.md](CONTRIBUTING.md#commits) covers how the commit is marked.

## Steps

1. Start from a current `main`, with CI green and no dependency pull request you
   mean to include still open.

2. On a branch named `chore/release-X.Y.Z`, bump the version with
   `npm version X.Y.Z --no-git-tag-version`, which updates `package.json` and
   both version fields in `package-lock.json` without committing or tagging.

   Then edit `CHANGELOG.md`: insert `## [X.Y.Z] - YYYY-MM-DD` directly under
   `## [Unreleased]`, leaving `## [Unreleased]` empty, and repoint the
   `[Unreleased]` compare link at the new tag, adding an `[X.Y.Z]` link above
   the previous one.

   Commit those three files, and only those three, as `chore(release): X.Y.Z`.

3. Open a pull request with the same title, wait for CI, and merge it.

4. Wait for `main`'s own CI run on the bump pull request's merge commit to go
   **green** — the pull request's run covered a merge preview, and required
   checks here are not strict, so a branch can merge behind its base — then
   create the release with tag `vX.Y.Z` targeting **that commit** rather than
   `main`, so that nothing merged in the meantime ends up inside the tag. Its
   notes are that version's `CHANGELOG.md` section with the `###` headings
   promoted to `##`, read from that same commit rather than from your working
   tree, for the same reason. A short paragraph above them saying what the
   release is for is optional.

   Check both inputs before creating it, because each fails by producing nothing
   rather than by failing: an unmerged pull request has no merge commit while
   `gh` still exits 0, and a mistyped version finds no changelog section, which
   `gh` will publish as an empty release body. An empty body can be edited
   afterwards; the tag cannot.

5. Confirm the publish. Find the workflow run **by tag** — asking for the newest
   run can hand you the previous release's, which looks identical to success. A
   release-triggered run carries the tag where a branch would go, so `gh run
   list` selects it with `--branch vX.Y.Z`; there is no `--tag`. Then ask npm
   for the exact version rather than for `latest`, which lags for a few minutes
   after the run succeeds.

6. Bump the release-surface baseline, in its own pull request.
   `src/release-surface.test.ts` holds the public path set of the last published
   release, and until it moves the gate keeps comparing against an older one —
   silently, because a path absent from the baseline cannot be reported as
   removed.

   Derive the new set from the **tag**, not from `main`, which may already carry
   paths this release did not ship; the file asks for this at each release and
   *not before*, since a baseline moved ahead of a publish names a surface
   nobody can install. Empty `INTENTIONAL_REMOVALS` with it. The version is
   written into names and prose in that file and in `docs/design.md` as well:
   every occurrence moves, the test titles included, and notes about what a past
   release shipped are deleted rather than rewritten.

## If publishing fails

Ask npm for the exact version first. `npm publish` is the last step, so a run
can die with the version already published; re-running then fails in a way that
reads like a broken release when there is nothing left to do.

If the version is not there, `publish.yml` accepts `workflow_dispatch`, and it
has to be dispatched against **the tag ref**; from the default branch it fails.
That repeats the run. It does not pick up a fix: fixes land on `main` and the
tag does not move, so a release needing a code change needs the next patch
version.
