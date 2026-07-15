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

[Unreleased]: https://github.com/akiomik/zod-nostr/commits/main
