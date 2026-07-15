# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- NIP-05 `.well-known/nostr.json` document schema:
  `zostr.nip05.nostrJsonDocument()`. Validates `names` (required —
  local-part to lowercase 64-char hex pubkey) and `relays` (optional —
  pubkey to an array of relay URLs), per the NIP-05 well-known document
  format.

### Changed

- **Breaking:** `zostr.nip05` is now a namespace, matching how
  `zostr.nip11.relayInformationDocument()` is namespaced under `nip11`:
  - `zostr.nip05()` → `zostr.nip05.identifier()`
  - `zostr.formatNip05Identifier()` → `zostr.nip05.formatIdentifier()`

### Fixed

- **Breaking (type-only):** `zostr.tags()`, `zostr.filter()`, and all
  `zostr.relayMessage.*`/`zostr.clientMessage.*` schemas now infer their
  precise structural output type from `.parse()` (e.g.
  `zostr.filter().parse(f).ids` is `string[] | undefined`, not `unknown`;
  `zostr.relayMessage.ok().parse(m)[3]` is `string`, not `unknown`).
  Previously `classic.ts`/`mini.ts` re-wrapped these through a generic
  helper that inferred its type parameter from a bare schema-class
  reference rather than the actual schema, so the output type fell back to
  each class's loose default. Runtime validation behavior is unchanged.
- **Breaking (type-only):** `zostr.nip11.relayInformationDocument()` and
  `zostr.nip05.nostrJsonDocument()` now infer their precise field types
  from `.parse()` (e.g. `.parse(doc).name` is `string | undefined`, not
  `unknown`), for the same reason as above. Runtime validation behavior is
  unchanged.

## [0.1.2] - 2026-07-15

### Added

- NIP-01 `REQ`/`COUNT` filter object: `zostr.filter()`.
- NIP-01 subscription id: `zostr.subscriptionId()` (non-empty string, max 64
  chars).
- NIP-01 relay-to-client message schemas: `zostr.relayMessage.event()`,
  `.ok()`, `.eose()`, `.closed()`, `.notice()`, and the combined union
  `.any()`.
- NIP-01 client-to-relay message schemas: `zostr.clientMessage.event()`,
  `.req()`, `.close()`, and the combined union `.any()`.
- Opt-in checks for NIP-01's `OK`/`CLOSED` `"<prefix>: <message>"` message
  convention: `zostr.relayMessage.okMessagePrefixCheck()` and
  `.closedMessagePrefixCheck()`. Compose with `.check()`, same as
  `signatureCheck()`.
- NIP-11 relay information document schema: `zostr.nip11.relayInformationDocument()`.
  `banner`/`icon`/`terms_of_service`/`payments_url` are validated as URLs by
  default; `pubkey`/`self` as 64-char hex.

## [0.1.1] - 2026-07-15

### Changed

- `.github/workflows/publish.yml` now authenticates to npm via
  [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC)
  instead of the `NPM_TOKEN` repository secret, which has been removed.
  `npm publish` no longer needs `NODE_AUTH_TOKEN`; provenance is generated
  automatically as part of trusted publishing, so the explicit `--provenance`
  flag was dropped (`--access public` is kept).
- Enable dependabot for updating npm packages and GitHub Actions.

### Fixed

- `zostr.pubkey()`, `eventId()`, `signature()`, `timestamp()`, `kind()`,
  `tags()`, `nip05()`, and `bech32()` now return schemas re-wrapped through
  each flavor's own constructor, matching how event schemas and codecs were
  already re-wrapped. Previously these returned an unwrapped
  `core.$ZodType` with none of classic zod's instance methods — not even
  `.parse()`, let alone `.optional()`/`.catch()`/`.safeParse()` — contrary to
  what `docs/API.md` documented. Embedding them directly in a
  `z.object({...})` shape (as shown in `README.md`) still works as before.

## [0.1.0] - 2026-07-15

### Added

- Shared validation core (`src/core/`) built directly against `zod/v4/core`
  (checks, codecs, and schema primitives), with no dependency on `zod` or
  `zod/mini` themselves.
- `zod-nostr` entry point (classic zod): `zostr.pubkey()`, `eventId()`,
  `signature()`, `timestamp()`, `kind()`, `tags()`, `eventTemplate()`,
  `unsignedEvent()`, `event()`, `signatureCheck()`, `nip05()`,
  `formatNip05Identifier()`, `bech32()`, `npub()`, `nsec()`, `note()`,
  `nprofile()`, `nevent()`, `naddr()`, `nip01.metadata()`, `nip01.textNote()`.
- `zod-nostr/mini` entry point (zod/mini) exposing the same `zostr` API,
  built from the same shared core so both flavors validate identically.
- NIP-01 event structure validation, with signature verification available
  as an explicit, composable check (`zostr.event().check(zostr.signatureCheck())`)
  rather than baked into the schema.
- NIP-05 identifier validation.
- NIP-19 bech32 support: lightweight prefix-only validation (`bech32()`) and
  full decode/encode codecs for `npub`, `nsec`, `note`, `nprofile`, `nevent`,
  and `naddr`.
- `README.md`, `docs/API.md`, and this changelog.
- [Biome](https://biomejs.dev) for linting and formatting (`npm run check`,
  `npm run check:write`).
- GitHub Actions CI (`.github/workflows/ci.yml`) running typecheck, lint/format
  check, tests, and build on every push and pull request to `main`.
- GitHub Actions publish workflow (`.github/workflows/publish.yml`), triggered
  by GitHub Releases, that verifies the release tag matches `package.json`'s
  version, runs the full check suite, and publishes to npm with provenance
  using an `NPM_TOKEN` repository secret (trusted publishing isn't set up
  yet). A matching `prepublishOnly` script provides the same safety net for
  local `npm publish`.

### Fixed

- `zostr.nip05()` / `formatNip05Identifier()` are now exposed from both entry
  points (previously only used internally by `nip01.metadata()`).
- `zostr.npub()`, `nsec()`, `note()`, `nprofile()`, `nevent()`, `naddr()`, and
  `nip01.metadata()` now return codecs re-wrapped through each flavor's own
  `codec()`. In classic zod this unlocks `.decode()`/`.encode()`/`.check()`
  instance methods; in zod/mini it unlocks `.check()` (zod/mini never attaches
  `.decode()`/`.encode()` as instance methods on any schema — use the
  top-level `z.decode()`/`z.encode()` there instead).
- `.github/workflows/publish.yml`: `npm publish` now passes `--access public`
  explicitly. npm requires this when generating provenance for a package that
  has never been published before, even when the package is unscoped (and
  thus defaults to public access already) — the first release attempt failed
  at the publish step with `Can't generate provenance for new or private
  package, you must set access to public` before anything was written to the
  registry.
- Added a `workflow_dispatch` trigger to `publish.yml` so a failed publish
  can be retried by re-running the workflow against the existing tag, without
  having to delete and recreate the GitHub Release.

### Testing

- `src/api-surface.test.ts`: asserts the exact set of public keys on `zostr`
  (and `zostr.nip01`) for both entry points, and that classic/mini expose
  identical key sets. Regression coverage for schemas/functions that exist
  internally but are never wired into the public `zostr` object.
- `src/classic.test.ts` / `src/mini.test.ts`: assert every event schema and
  codec exposes its flavor's native `.check()`, and (classic only) every
  codec exposes native `.decode()`/`.encode()`. Regression coverage for
  `zostr` members that accidentally return an unwrapped `core.$ZodType`/
  `core.$ZodCodec` instead of being re-wrapped through the flavor's own
  constructor.

[Unreleased]: https://github.com/akiomik/zod-nostr/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/akiomik/zod-nostr/releases/tag/v0.1.2
[0.1.1]: https://github.com/akiomik/zod-nostr/releases/tag/v0.1.1
[0.1.0]: https://github.com/akiomik/zod-nostr/releases/tag/v0.1.0
