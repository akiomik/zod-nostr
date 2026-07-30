# zod-nostr

[![npm version](https://badge.fury.io/js/zod-nostr.svg)](https://badge.fury.io/js/zod-nostr)
[![CI](https://github.com/akiomik/zod-nostr/actions/workflows/ci.yml/badge.svg)](https://github.com/akiomik/zod-nostr/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/akiomik/zod-nostr/graph/badge.svg?token=GDL3P5N6L7)](https://codecov.io/gh/akiomik/zod-nostr)

Zod schemas and codecs for [Nostr](https://nostr.com) — NIP-01 events, NIP-05
identifiers, NIP-10 text notes, NIP-11 relay information documents, NIP-19 bech32
entities, NIP-21 `nostr:` URIs, NIP-42 authentication, NIP-45 event counts,
NIP-50 search, and NIP-67 EOSE completeness hints.

Validation logic is written once against `zod/v4/core` and re-exposed through
two entry points, so the exact same rules work with both
[classic zod](https://zod.dev) and [zod/mini](https://zod.dev/packages/mini),
each with native `.check()` chaining for its own flavor.

## Installation

```sh
npm install zod-nostr zod
```

`zod` (`^4.4.3`) is a peer dependency — bring your own version.

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
  (or `.decode()`/`.encode()` methods on the classic schema).

  | codec | decodes bech32 string to |
  | --- | --- |
  | `npub()` | hex pubkey (`string`) |
  | `nsec()` | secret key bytes (`Uint8Array`, 32 bytes) |
  | `note()` | hex event id (`string`) |
  | `nprofile()` | `{ pubkey, relays? }` |
  | `nevent()` | `{ id, relays?, author?, kind? }` |
  | `naddr()` | `{ identifier, pubkey, kind, relays? }` |

  Note that `nsec()` decodes to raw bytes (`Uint8Array`), not a hex string,
  matching how `nostr-tools` represents secret keys elsewhere
  (`generateSecretKey`, `finalizeEvent`, ...).

## Supported NIPs

Canonical paths below are `zostr.nipXX.*`; the curated Nostr-wide ones are also
aliased at the root (`zostr.event`, `zostr.npub`, …).

- **NIP-01** — event structure (`nip01.event`, `nip01.unsignedEvent`,
  `nip01.eventTemplate`), signature verification (`nip01.signatureCheck`), kind:0
  profile metadata (object schema `nip01.metadata`, content codec
  `nip01.metadataContent`, field-level schemas `nip01.metadataFields.*`), the
  `REQ`/`COUNT` filter object (`nip01.filter`), and relay/client protocol
  messages (`nip01.relayMessage.*`, `nip01.clientMessage.*`)
- **NIP-05** — identifier format validation (`nip05.identifier`) and
  `.well-known/nostr.json` document validation (`nip05.nostrJsonDocument`)
- **NIP-10** — kind:1 text notes and threads (`nip10.textNote`; marked reply/
  citation tags `nip10.eTag`/`nip10.qTag`; opt-in reply/thread checks
  `nip10.threadCheck`/`nip10.participantsCheck`)
- **NIP-11** — relay information document (`nip11.relayInformationDocument`)
- **NIP-19** — bech32 entities (`nip19.npub`, `nip19.nsec`, `nip19.note`,
  `nip19.nprofile`, `nip19.nevent`, `nip19.naddr`)
- **NIP-21** — `nostr:` URIs over the supported NIP-19 entities (`nsec`
  excluded): validation-only `nip21.uri`, per-entity codecs (`nip21.npub`,
  `nip21.note`, `nip21.nprofile`, `nip21.nevent`, `nip21.naddr`), and
  `nip21.any` decoding to a `{ type, data }` discriminated union
- **NIP-42** — authentication (`AUTH`): the `kind: 22242` auth event
  (`nip42.authEvent`), the relay/client `AUTH` messages
  (`nip42.relayMessage.auth`, `nip42.clientMessage.auth`), and opt-in
  verification checks (`nip42.challengeTagCheck`, `nip42.relayTagCheck`,
  `nip42.createdAtCheck`)
- **NIP-45** — event counts (`COUNT`): request/response messages
  (`nip45.clientMessage.count`, `nip45.relayMessage.count`) and the response body
  object (`nip45.count`)
- **NIP-50** — search: the filter extended with a `search` string
  (`nip50.filter`) and the `REQ` that carries it (`nip50.clientMessage.req`), an
  intentional superset of `nip01.clientMessage.req`
- **NIP-67** — EOSE completeness hint: `EOSE` extended with an optional hints
  array (`nip67.relayMessage.eose`), a strict superset of
  `nip01.relayMessage.eose`

See [docs/API.md](docs/API.md) for the full API reference.

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

Authentication uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers)
(OIDC) — the workflow only needs `id-token: write`, no `NPM_TOKEN`/
`NODE_AUTH_TOKEN` secret is involved. Provenance attestation is generated
automatically as part of trusted publishing.

## License

[MIT](LICENSE)
