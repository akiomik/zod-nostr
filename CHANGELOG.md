# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Fixed

- `zostr.nip05()` / `formatNip05Identifier()` are now exposed from both entry
  points (previously only used internally by `nip01.metadata()`).
- `zostr.npub()`, `nsec()`, `note()`, `nprofile()`, `nevent()`, `naddr()`, and
  `nip01.metadata()` now return codecs re-wrapped through each flavor's own
  `codec()`. In classic zod this unlocks `.decode()`/`.encode()`/`.check()`
  instance methods; in zod/mini it unlocks `.check()` (zod/mini never attaches
  `.decode()`/`.encode()` as instance methods on any schema — use the
  top-level `z.decode()`/`z.encode()` there instead).

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

[Unreleased]: https://github.com/akiomik/zod-nostr/commits/main
