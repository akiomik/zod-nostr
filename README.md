# zod-nostr

[![npm version](https://img.shields.io/npm/v/zod-nostr)](https://www.npmjs.com/package/zod-nostr)
[![CI](https://github.com/akiomik/zod-nostr/actions/workflows/ci.yml/badge.svg)](https://github.com/akiomik/zod-nostr/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/akiomik/zod-nostr/graph/badge.svg?token=GDL3P5N6L7)](https://codecov.io/gh/akiomik/zod-nostr)
[![provenance](https://img.shields.io/badge/provenance-npm%20attested-blue)](https://www.npmjs.com/package/zod-nostr)
[![types](https://img.shields.io/npm/types/zod-nostr)](https://www.npmjs.com/package/zod-nostr)
[![license](https://img.shields.io/npm/l/zod-nostr)](LICENSE)

**Spec-faithful, tunable Zod schemas & codecs for [Nostr](https://nostr.com) —
strict by default, loosen deliberately.**

- **Strict, spec-faithful atoms** — each schema validates to exactly what its NIP
  permits, and never rejects spec-valid input.
- **Tunable in both directions** — strict bases compose with zod's own
  loosening tools (`optional`, `catch`, `default`, `refine`) in each flavor's
  native form, so you can loosen them deliberately for the messy data real
  relays serve.
- **Classic zod and zod/mini** — one set of rules, written once against
  `zod/v4/core` and re-exposed through [classic zod](https://zod.dev) and
  tree-shakeable [zod/mini](https://zod.dev/packages/mini) with each flavor's
  native `.check()` chaining.
- **Precise type inference** — schemas are the single source of truth, so
  inferred types and runtime checks can't drift apart.
- **Bidirectional codecs** — NIP-19 bech32 entities and NIP-21 `nostr:` URIs
  decode *and* encode, not just validate.
- **Opt-in checks** — signatures, proof of work, expiration, and authentication
  compose via `.check()` instead of being baked into every parse.
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

zod v4 ships two API flavors: classic zod (chainable methods, `z.string().min(1)`)
and zod/mini (functional composition, `z.string().check(z.minLength(1))`,
optimized for tree-shaking). They don't share method chains, but both build on
the same schema representation in `zod/v4/core`.

zod-nostr's validation logic is written once against that core, and each entry
point re-wraps it through its own flavor's native `z.object()`. That is what
lets each flavor's own composition — classic's `.optional()`, mini's
`z.optional()` — work on the schemas returned, with no custom sugar in between.

### Signature verification is opt-in, via `.check()`

`zostr.event()` validates NIP-01 event *structure* (field shapes, hex lengths,
tag shape) but does **not** verify the signature. Verifying every event is
comparatively expensive, so forcing it into every `.parse()` would be a poor
default for bulk ingestion paths that don't need it. Compose it explicitly,
in zod's own check-composition style rather than a bespoke chain method:

```ts
zostr.event().check(zostr.signatureCheck())
```

### bech32 format check vs. codec

- `zostr.bech32(prefix)` — validates a well-formed bech32 entity with the given
  prefix and returns the string as-is.
- `zostr.npub()`, `zostr.nsec()`, … — full **codecs**: `z.decode()` to the
  underlying value, `z.encode()` back to the string (or `.decode()`/`.encode()`
  on the classic schema). `nsec()` decodes to raw bytes (`Uint8Array`), not hex,
  matching how `nostr-tools` represents secret keys elsewhere.

## Supported NIPs

| NIP | Coverage |
| --- | --- |
| [**NIP-01**](https://github.com/nostr-protocol/nips/blob/master/01.md) | Events and templates, opt-in signature verification, kind:0 profile metadata (content codec and field atoms), the `REQ`/`COUNT` filter, and relay/client messages |
| [**NIP-05**](https://github.com/nostr-protocol/nips/blob/master/05.md) | Identifiers and the `.well-known/nostr.json` document |
| [**NIP-10**](https://github.com/nostr-protocol/nips/blob/master/10.md) | kind:1 text notes, marked reply and citation tags, opt-in reply and thread checks |
| [**NIP-11**](https://github.com/nostr-protocol/nips/blob/master/11.md) | Relay information document |
| [**NIP-13**](https://github.com/nostr-protocol/nips/blob/master/13.md) | Proof of work: the `nonce` tag, opt-in achieved-difficulty and commitment checks |
| [**NIP-19**](https://github.com/nostr-protocol/nips/blob/master/19.md) | bech32 entities, as codecs and as a validation-only format check |
| [**NIP-21**](https://github.com/nostr-protocol/nips/blob/master/21.md) | `nostr:` URIs over the NIP-19 entities except `nsec`: validation-only, per-entity codecs, and a union that decodes any of them |
| [**NIP-24**](https://github.com/nostr-protocol/nips/blob/master/24.md) | Extra kind:0 profile fields (`display_name`, `website`, `banner`, `bot`, `birthday`), alongside NIP-01's |
| [**NIP-40**](https://github.com/nostr-protocol/nips/blob/master/40.md) | Expiration timestamps: the `expiration` tag and an opt-in not-expired check |
| [**NIP-42**](https://github.com/nostr-protocol/nips/blob/master/42.md) | Authentication: the `kind: 22242` event, the `AUTH` messages, opt-in checks |
| [**NIP-45**](https://github.com/nostr-protocol/nips/blob/master/45.md) | Event counts: the `COUNT` request and response, and the response body |
| [**NIP-50**](https://github.com/nostr-protocol/nips/blob/master/50.md) | Search: the filter extended with `search`, an intentional superset of NIP-01's |
| [**NIP-67**](https://github.com/nostr-protocol/nips/blob/master/67.md) | EOSE completeness hints: `EOSE` extended with an optional hints array |
| [**NIP-70**](https://github.com/nostr-protocol/nips/blob/master/70.md) | Protected events: the `["-"]` tag and an opt-in authenticated-author check |

Each NIP links to its current text. Which revision these schemas are written
against is recorded in [spec-baseline.json](spec-baseline.json) — the upstream
commit, when it landed, and the SHA-256 of the document, so an entry can be
confirmed against the document rather than taken on trust. It also covers the
two [LUD](https://github.com/lnurl/luds) specs behind
`nip01.metadataFields.lud06()` and `lud16()` — LUD-01, which owns the LNURL
encoding the `lud06` field carries, and LUD-16.

See [docs/API.md](docs/API.md) for the full reference and
[docs/guides.md](docs/guides.md) for task-oriented guides.

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

The conventions those commands cannot check — commit marking, changelog format,
which document a change belongs in, what a new schema owes its specification —
are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Release process

Versioning follows
[docs/design.md](docs/design.md#compatibility-and-versioning): before 1.0,
backward-incompatible public API changes bump the minor version, and
backward-compatible additions and fixes bump the patch version.

The steps are in [RELEASING.md](RELEASING.md).

## License

[MIT](LICENSE)
