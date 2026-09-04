# zod-nostr

[![npm version](https://badge.fury.io/js/zod-nostr.svg)](https://badge.fury.io/js/zod-nostr)
[![CI](https://github.com/akiomik/zod-nostr/actions/workflows/ci.yml/badge.svg)](https://github.com/akiomik/zod-nostr/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/akiomik/zod-nostr/graph/badge.svg?token=GDL3P5N6L7)](https://codecov.io/gh/akiomik/zod-nostr)

**Spec-faithful, tunable Zod schemas & codecs for [Nostr](https://nostr.com) —
strict by default, loosen deliberately.**

- **Strict, spec-faithful atoms** — each schema validates to exactly what its NIP
  permits, and never rejects spec-valid input.
- **Tunable in both directions** — strict base schemas compose with
  `.optional()`, `.catch()`, `.default()`, and `.refine()`, so you can
  deliberately loosen them to absorb the messy data real relays serve.
- **Classic zod and zod/mini** — one set of rules, written once against
  `zod/v4/core` and re-exposed through two entry points with each flavor's native
  `.check()` chaining; reach for tree-shakeable
  [zod/mini](https://zod.dev/packages/mini) or ergonomic
  [classic zod](https://zod.dev).
- **Precise type inference** — schemas are the single source of truth, so
  inferred types and runtime checks can't drift apart.
- **Bidirectional codecs** — NIP-19 bech32 entities and NIP-21 `nostr:` URIs
  decode *and* encode, not just validate.
- **Opt-in checks** — expensive or context-dependent verification (signatures,
  proof of work, expiration, authentication) composes via `.check()` instead of
  being baked into every parse.
- **Framework-agnostic** — a pure schema layer you can drop into any Nostr stack.

Covers NIP-01, NIP-05, NIP-10, NIP-11, NIP-13, NIP-19, NIP-21, NIP-24, NIP-40,
NIP-42, NIP-45, NIP-50, NIP-67, and NIP-70 — see
[Supported NIPs](#supported-nips).

## Installation

```sh
npm install zod-nostr zod
```

`zod` (`^4.4.3`) is a peer dependency — bring your own version.

zod-nostr ships as ESM only.

## Quick start

### classic zod

```ts
import { z } from "zod";
import { zostr } from "zod-nostr";

const schema = z.object({ pubkey: zostr.pubkey() });
schema.parse({ pubkey: "3bf0c63f..." });

// Structure only, no signature check:
zostr.event().parse(someEvent);

// Structure + signature verification, composed explicitly:
zostr.event().check(zostr.signatureCheck()).parse(someEvent);
```

### zod/mini

```ts
import * as z from "zod/mini";
import { zostr } from "zod-nostr/mini";

const schema = z.object({ pubkey: zostr.pubkey() });
z.parse(schema, { pubkey: "3bf0c63f..." });

z.parse(zostr.event().check(zostr.signatureCheck()), someEvent);
```

The `zostr` object exposes the identical set of functions from both entry
points — only the import path and the ambient zod flavor differ.

Every API has one **canonical owner path** — usually its spec namespace
(`zostr.nip19.npub()`), a domain namespace for a cross-spec catalog
(`zostr.nip01.metadataFields.*`), or the root for a cross-spec utility
(`zostr.jsonCodec()`). Frequently used Nostr-wide concepts are also re-exposed at
the root as an ergonomic alias that is a direct reference to the same factory:

```ts
zostr.event(); // alias of zostr.nip01.event()
zostr.event === zostr.nip01.event; // true
```

## Design notes

These notes summarize a few user-facing choices. The full public-API design
principles — controllability, strict atoms, opt-in checks, versioning, and the
verification bar for new APIs — live in [docs/design.md](docs/design.md).

### Why two entry points?

zod v4 ships two API flavors: classic zod (chainable methods, e.g.
`z.string().min(1)`) and zod/mini (functional composition, e.g.
`z.string().check(z.minLength(1))`, optimized for tree-shaking). The two
flavors don't share method chains, but both are built on the same schema
representation in `zod/v4/core`.

zod-nostr's validation logic (hex/bech32 formats, event structure, signature
checks, codecs) is written once against `zod/v4/core` and has no dependency
on `zod` or `zod/mini` itself. The `zod-nostr` (classic) and `zod-nostr/mini`
entry points each re-wrap that shared logic through their own flavor's native
`z.object()`, which is what makes `.check()`/`.optional()` and friends work
naturally on the schemas they return — there's no custom chaining sugar layered
on top.

### Signature verification is opt-in, via `.check()`

`zostr.event()` validates NIP-01 event *structure* (field shapes, hex
lengths, tag shape) but does **not** verify the cryptographic signature by
default. Verifying every event's signature is comparatively expensive, so
forcing it into every `.parse()` call would be a poor default for bulk
ingestion paths that don't need it. Compose it explicitly instead:

```ts
zostr.event().check(zostr.signatureCheck())
```

This mirrors zod's own check-composition style (e.g. `z.string().check(z.minLength(1))`)
rather than inventing a bespoke `.verified()`-style chain method.

### bech32 format check vs. codec

- `zostr.bech32(prefix)` — validates that a string is a well-formed bech32
  entity with the given prefix (`npub`, `nsec`, `note`, `nprofile`, `nevent`,
  `naddr`). Returns the string as-is.
- `zostr.npub()`, `zostr.nsec()`, etc. — full **codecs**: decode a bech32
  string to its underlying value, and encode the value back to a bech32
  string. Use `z.decode(zostr.npub(), npub)` / `z.encode(zostr.npub(), pubkey)`
  (or `.decode()`/`.encode()` methods on the classic schema). See
  [docs/API.md](docs/API.md) for each codec's decoded value.

Note that `nsec()` decodes to raw bytes (`Uint8Array`), not a hex string,
matching how `nostr-tools` represents secret keys elsewhere
(`generateSecretKey`, `finalizeEvent`, ...).

## Supported NIPs

Canonical paths below are `zostr.nipXX.*`; the curated Nostr-wide ones are also
aliased at the root (`zostr.event`, `zostr.npub`, …).

| NIP | Spec baseline | Coverage | Key canonical paths |
| --- | --- | --- | --- |
| **NIP-01** | [2026-09-04](https://github.com/nostr-protocol/nips/blob/c3fd9af17939316bf6d0d83a5759100f8b0a1bdb/01.md) | Event structure and templates, opt-in signature verification, kind:0 profile metadata (content codec and field-level atoms), the `REQ`/`COUNT` filter object, and relay/client protocol messages | `nip01.event`, `nip01.unsignedEvent`, `nip01.eventTemplate`, `nip01.signatureCheck`, `nip01.metadata`, `nip01.filter`, `nip01.relayMessage.*`, `nip01.clientMessage.*` |
| **NIP-05** | [2026-06-13](https://github.com/nostr-protocol/nips/blob/999f9bfbf5fe00d5c2711fd24badb4e56748c9bc/05.md) | Identifier and `.well-known/nostr.json` document validation | `nip05.identifier`, `nip05.nostrJsonDocument` |
| **NIP-10** | [2025-02-07](https://github.com/nostr-protocol/nips/blob/0023ca818c759f46cd357a812dca98abfd9824b8/10.md) | kind:1 text notes and threads, marked reply/citation tags, and opt-in reply/thread checks | `nip10.textNote` |
| **NIP-11** | [2026-06-13](https://github.com/nostr-protocol/nips/blob/999f9bfbf5fe00d5c2711fd24badb4e56748c9bc/11.md) | Relay information document | `nip11.relayInformationDocument` |
| **NIP-13** | [2025-12-23](https://github.com/nostr-protocol/nips/blob/f5a15ea27e06ce8f5635117931f06318f532a713/13.md) | Proof of work: the `nonce` tag schema and opt-in checks for achieved difficulty and the committed target | `nip13.nonceTag`, `nip13.powCheck`, `nip13.commitmentCheck` |
| **NIP-19** | [2026-03-12](https://github.com/nostr-protocol/nips/blob/7d9908018eabb260e794174349e834199030bfd1/19.md) | bech32 entities | `nip19.npub`, `nip19.nsec`, `nip19.note`, `nip19.nprofile`, `nip19.nevent`, `nip19.naddr` |
| **NIP-21** | [2026-03-21](https://github.com/nostr-protocol/nips/blob/699e7a28f4d6e2df10660184c4f8c159adf1582d/21.md) | `nostr:` URIs over the supported NIP-19 entities (`nsec` excluded): validation-only, per-entity codecs, and decoding to a `{ type, data }` discriminated union | `nip21.any` |
| **NIP-24** | [2025-08-11](https://github.com/nostr-protocol/nips/blob/739f3c5263584770f098440855d9364a779e7f9d/24.md) | Extra kind:0 profile metadata fields (`display_name`, `website`, `banner`, `bot`, `birthday`), exposed as field-level atoms alongside NIP-01's | `nip01.metadataFields.displayName`, `nip01.metadataFields.birthday` |
| **NIP-40** | [2025-12-23](https://github.com/nostr-protocol/nips/blob/f5a15ea27e06ce8f5635117931f06318f532a713/40.md) | Expiration timestamps: the `expiration` tag schema and an opt-in not-expired check | `nip40.expirationTag`, `nip40.expirationCheck` |
| **NIP-42** | [2026-09-01](https://github.com/nostr-protocol/nips/blob/e65954922b28eff0e04b4e9020a5474f493793d2/42.md) | Authentication (`AUTH`): the `kind: 22242` auth event, the relay/client `AUTH` messages, and opt-in verification checks | `nip42.authEvent` |
| **NIP-45** | [2026-02-06](https://github.com/nostr-protocol/nips/blob/3d71a4a78c376a5a71bf44708cd6b02c1773ae0b/45.md) | Event counts (`COUNT`): request/response messages and the response body object | `nip45.count` |
| **NIP-50** | [2026-06-13](https://github.com/nostr-protocol/nips/blob/999f9bfbf5fe00d5c2711fd24badb4e56748c9bc/50.md) | Search: the filter extended with a `search` string and the `REQ` that carries it, an intentional superset of NIP-01's | `nip50.filter` |
| **NIP-67** | [2026-09-01](https://github.com/nostr-protocol/nips/blob/e65954922b28eff0e04b4e9020a5474f493793d2/67.md) | EOSE completeness hint: `EOSE` extended with an optional hints array, a strict superset of NIP-01's | `nip67.relayMessage.eose` |
| **NIP-70** | [2026-06-13](https://github.com/nostr-protocol/nips/blob/999f9bfbf5fe00d5c2711fd24badb4e56748c9bc/70.md) | Protected events: the `["-"]` marker tag schema and an opt-in check that a protected event's author is an authenticated pubkey | `nip70.protectedTag`, `nip70.protectedCheck` |

**Spec baseline** links the exact revision of each NIP these schemas are written
against; the date shown is when that revision landed in
[nostr-protocol/nips](https://github.com/nostr-protocol/nips) (its committer
date, which for a long-open pull request is later than the author date GitHub
shows). The same data lives in
[spec-baseline.json](spec-baseline.json), which also records the
SHA-256 of each spec's text so that upstream changes can be detected
mechanically, and covers the two specs that have no row here because they are
not NIPs: [LUD-06 and LUD-16](https://github.com/lnurl/luds), behind
`nip01.metadataFields.lud06()` and `nip01.metadataFields.lud16()`. An entry
moves only when the spec is re-read and the schemas are confirmed against it;
`npm run test:spec-baseline` keeps the table and the JSON from disagreeing.

See [docs/API.md](docs/API.md) for the full API reference, and
[docs/guides.md](docs/guides.md) for task-oriented how-to guides (building a
tunable profile schema, composing opt-in checks).

## Development

```sh
npm run typecheck    # tsc --noEmit
npm run check        # biome check . (lint + format check)
npm run check:write  # biome check --write . (auto-fix)
npm test             # vitest run
npm run build        # emit dist/ (classic.js + mini.js)
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull
request to `main`.

## Release process

Versioning follows
[docs/design.md](docs/design.md#compatibility-and-versioning): before 1.0,
backward-incompatible public API changes bump the minor version, and
backward-compatible additions and fixes bump the patch version.

1. Bump `version` in `package.json` and add a dated section to
   `CHANGELOG.md` (move the relevant `[Unreleased]` entries under it).
2. Merge that to `main`.
3. Create a GitHub Release with tag `vX.Y.Z` (matching `package.json`'s
   version) targeting `main`.

Publishing a release triggers `.github/workflows/publish.yml`, which
type-checks, lints, tests, builds, verifies the tag matches
`package.json`'s version, and runs `npm publish --access public`.

## License

[MIT](LICENSE)
