# Design

## Scope

This document defines the design rules for zod-nostr's **public schema and
codec API**: the principles new schemas/codecs follow, how the public surface
is layered, what counts as a breaking change, and what must ship with any
public API addition.

It is a *living document* describing the rules currently in force — not a
changelog or a decision history. For the concrete API surface see
[API.md](./API.md); for per-version changes see [../CHANGELOG.md](../CHANGELOG.md).

Internal module organization (file layout, dependency direction) is out of
scope here.

## Design principles

### Controllability is the axis (not strict vs. lenient)

The goal is not a particular default strictness, but that **consumers can
choose the validation and recovery policy in both directions**. A schema that
hardcodes leniency (e.g. a per-field `.catch`) is just as limiting as one that
hardcodes strictness — each removes a choice.

This rests on an asymmetry: zod's `.optional()`, `.catch()`, and `.default()`
are **additive wrappers — they can be added but not removed**. So a strict base
can always be loosened by the consumer, while a pre-loosened base cannot be
tightened. This asymmetry motivates the strict-atom and no-recovery-policy
rules below: expose the strongest meaningful validation and let consumers
weaken it.

### Validation logic has one source

Validation logic is defined once against `zod/v4/core` and exposed through both
the classic and zod/mini entry points as each flavor's native schema. Neither
flavor is the source of truth; both re-wrap the shared core.

### Canonical spec paths, with direct-reference ergonomic aliases

Every public schema, codec, check, and utility has exactly one **canonical**
path, namespaced by the specification that defines it (`nip01.*`, `nip19.*`,
`nip05.*`, …). The canonical path is the documentation and compatibility source
of truth.

A small, curated set of Nostr-wide concepts is additionally re-exposed at the
**root** as an ergonomic alias. An alias is a **direct reference** to the same
canonical factory — never a separate wrapper — so identity holds
(`zostr.event === zostr.nip01.event`) and the two cannot drift in behavior or
inferred type. An alias must not delegate through a wrapper, add or omit checks,
change types, carry its own behavior docs, or become the source the canonical
path is implemented from.

The root alias set is a deliberately curated product surface (Nostr-wide
primitives and the globally unique NIP-19 entities), not the output of an
eligibility algorithm; adding one is an explicit API decision. Message
namespaces and kind-specific content (`metadata`, `textNote`, …) are not
aliased. The one root-only member is `jsonCodec`, a cross-spec utility rather
than an alias.

### Expose strict atoms

Field-level schemas are exposed non-optional, with no `.catch`/fallback.
Consumers compose `optional`/`catch`/`default` on top.

"Strict" here means **faithful to the spec, not maximally restrictive**:
validate to exactly what the spec permits, and never reject spec-valid input.
Modeling a not-required field as `optional` is honest spec-modeling, not a
policy; allowing values the spec allows (e.g. an LUD-16 `+tag`) is required, not
lenient.

### Do not bake in recovery policy

Application-specific *recovery* policy — `.catch`, `.default`, empty-string
fallbacks — is never embedded in a base schema. The base fails on invalid
input; the consumer decides what to do about it. (Unknown-key handling is a
separate, structural concern — see below.)

### Unknown keys are preserved or rejected, never silently stripped

How an object schema treats unknown keys is part of its structural contract,
chosen deliberately from the spec and its forward-compatibility needs — not a
per-value recovery fallback. The choice is always one of two, never a silent
`strip`:

- **preserve** — the spec permits extension or consumers must accept unknown
  fields (a forward-compatible document or content). Kept via a `catchall`
  `unknown`, so the output type carries a `[key: string]: unknown` index
  signature. Examples: `nip01.metadata()`, `nip05.nostrJsonDocument()`,
  `nip11.relayInformationDocument()` (and its nested objects), the NIP-19 pointer
  outputs.
- **reject** — the object is a fixed protocol shape where an unknown key is not
  part of the represented value and could change its meaning. Enforced with a
  `catchall` of `never`. Examples: the event schemas (`event`, `eventTemplate`,
  `unsignedEvent`, `textNote`, `nip42.authEvent`) and the `nip45.count` response
  body.

Silent strip is avoided because it discards data without signaling it — a
forward-compatible field vanishes on a round-trip, and a malformed key passes
unnoticed. The choice is documented in the API and covered by tests in both
flavors, and changing it is breaking (see
[Compatibility and versioning](#compatibility-and-versioning)).

### Checks beyond the structural contract are opt-in

Checks that fall outside the base schema's declared structural contract are
exposed as composable, opt-in `.check()`s rather than baked in. This covers
advisory conventions (spec "SHOULD"s) and separately-requested semantic or
cryptographic verification. Examples: signature verification
(`signatureCheck`) and the NIP-01 OK/CLOSED message-prefix convention
(`nip01.relayMessage.okMessagePrefixCheck` / `closedMessagePrefixCheck`). Cost may
justify moving a check to a separate layer, but cost alone does not override a
required invariant — a MUST-level structural rule stays in the base.

### Separate shape from transport

An object's **shape** (its field schema) is kept separate from the **transport**
that carries it (e.g. a JSON string ⇄ object codec). Expose the shape as a
reusable object schema and the transport as a generic, composable codec, so
consumers can reuse either independently instead of being handed only a fused
unit.

*(Applied to kind:0 profile metadata: the `metadataFields` atoms, the generic
`jsonCodec(schema)` transport, the `metadata()` object schema, and the
`metadataContent()` convenience codec — see
[decision 0001](./decisions/0001-metadata-shape-and-transport.md).)*

### Put guarantees in schemas

Guarantees about output values are expressed in the schema/type, not in runtime
transport helpers ("parse, don't validate"). A generic JSON codec's `encode`
follows `JSON.stringify` semantics and converts only a raw `JSON.stringify`
error or a top-level `undefined` into Zod issues; a consumer who needs a
stronger JSON guarantee models it in the output schema rather than relying on
the serializer.

### Keep classic and mini equivalent

Both entry points expose the same public keys, run the same runtime validation,
and infer the same output types. Only the flavor-native way of *operating* on a
schema differs (classic method chains vs. zod/mini functions).

## Public API layers

New public API belongs to one of these layers; adding an API means deciding
which layer it extends.

- **Field atoms** — strict, non-optional schemas for a single field/value
  (`pubkey`, `nip05.identifier`, `nip01.metadataFields.*`). Building blocks for
  composition.
- **Object schemas** — structural schemas for a whole object (`event`, `filter`,
  `nip11.relayInformationDocument`, `nip05.nostrJsonDocument`).
- **Checks** — composable, opt-in `.check()`s (`signatureCheck`, the message
  prefix checks).
- **Generic codecs** — transport codecs parameterized by an output schema
  (`jsonCodec(schema)`).
- **Entity codecs** — decode/encode a specific entity to a fixed output type
  (bech32 entities `npub` / `nsec` / `note` / `nprofile` / `nevent` / `naddr`).
- **Convenience codecs** — a specific transport + shape assembled for a common
  case (`nip01.metadataContent()`, built on `jsonCodec(nip01.metadata())`).

Fields and schemas are named for the spec that defines them (e.g. `nip05`, and
the NIP-24 / LUD-16 / LUD-06 metadata fields), so the public surface reflects
provenance.

### Naming

Public names follow provenance and the protocol's own wire vocabulary:

- **Object schemas** are named for what they model (`filter`, `event`, `count`,
  `authEvent`); a NIP namespace drops the redundant prefix (`nip50.filter`, not
  `nip50.searchFilter`).
- **Protocol messages** live under a `relayMessage`/`clientMessage` namespace
  that carries the **direction**, and the leaf is the lowercased wire token, with
  protocol abbreviations not expanded (`req`, not `request`; `eose`, `ok`,
  `auth`, `count`). Direction in the namespace means a token that would otherwise
  collide across directions no longer needs a suffix: the relay's and client's
  `["AUTH", …]` are `nip42.relayMessage.auth` / `nip42.clientMessage.auth`, and
  COUNT both ways is `nip45.clientMessage.count` / `nip45.relayMessage.count` —
  the wire token stays recoverable from the leaf without inventing
  `authChallenge`/`countResponse`-style names. The same bare leaf recurs freely
  across namespaces: `clientMessage.event()` (`["EVENT", event]`) and
  `relayMessage.event()` (`["EVENT", subscriptionId, event]`).
- A schema that is a **superset** of an existing one reuses the leaf name, when
  unambiguous, to signal the relationship: `nip50.clientMessage.req` ⊃
  `nip01.clientMessage.req`, `nip50.filter` ⊃ `nip01.filter`,
  `nip67.relayMessage.eose` ⊃ `nip01.relayMessage.eose`.

## Composition examples

Compose strict atoms into an application schema. Minimal example (classic) — a
lenient profile schema built from the strict metadata field atoms:

```ts
import { z } from "zod";
import { zostr } from "zod-nostr";

const f = zostr.nip01.metadataFields;
const Profile = z.object({
  name: f.name().trim().min(1).catch("").default(""),
  picture: f.picture().catch("").default(""),
  nip05: f.nip05().catch("").default(""),
});
```

zod/mini is equivalent via the functional API — the same `trim`/`min` checks
and `catch`/`default` policy, composed as functions:

```ts
import * as z from "zod/mini";
import { zostr } from "zod-nostr/mini";

const f = zostr.nip01.metadataFields;
const Profile = z.object({
  name: z._default(z.catch(f.name().check(z.trim(), z.minLength(1)), ""), ""),
  picture: z._default(z.catch(f.picture(), ""), ""),
  nip05: z._default(z.catch(f.nip05(), ""), ""),
});
```

See [API.md](./API.md) for the full surface.

## Compatibility and versioning

Before 1.0:

- **Backward-incompatible** public API changes increment the **minor** version.
- Backward-compatible features and bug fixes increment the **patch** version.

A change is breaking if it is either:

- **Runtime breaking** — it changes observable behavior: renaming or removing a
  public name; tightening validation so previously-accepted values are now
  rejected; changing object semantics (e.g. unknown-key preserve vs. reject); a
  codec that previously encoded/decoded a value now failing.
- **Type-only breaking** — runtime behavior is unchanged but an inferred
  input/output type changes incompatibly. These are called out as
  `Breaking (type-only)` in the changelog.

Additive, backward-compatible API (new atoms, new schemas) is a patch — e.g.
`metadataFields` in 0.2.1.

## Verification requirements

A public API addition ships with:

- a single core implementation (against `zod/v4/core`), wired into **both** the
  classic and mini entry points;
- exact public-surface parity between the two flavors, and — for a root alias —
  its direct-reference identity to the canonical factory (asserted by the
  API-surface test);
- runtime tests in **both** flavors, including a preserve-or-reject assertion for
  every object schema (no silent strip);
- input/output **type** tests (precise-inference assertions in both flavors);
- updated `API.md` and `CHANGELOG.md`.

*Not yet enforced:* a compile fixture that imports the packed package the way an
external consumer would, and an automated release-surface comparison against the
last published version.

## Decision records

Longer-form records of specific past decisions live in
[decisions/](./decisions/), separate from this rule set:

- [0001 — Separate kind:0 metadata shape from its transport](./decisions/0001-metadata-shape-and-transport.md)
  — the worked example the *separate shape from transport* and *expose strict
  atoms* principles were derived from.
