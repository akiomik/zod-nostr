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

### Canonical owner paths, with direct-reference re-exports

Every public schema, codec, check, and utility has exactly one **canonical
owner path** — the single documentation and compatibility source of truth for
it. Ownership follows the public API's shape, not a mechanical read of every
spec a schema touches:

- a spec-specific protocol concept is normally owned by its spec namespace
  (`nip50.filter`, `nip19.npub`, `nip05.identifier`);
- a cross-spec catalog that composes one consumer domain can be owned by that
  domain's namespace (`nip01.metadataFields.*` owns the kind:0 profile-field
  catalog, whose values draw on NIP-01/NIP-24/LUD);
- a cross-spec utility can be owned by the root (`jsonCodec`).

Provenance — which spec defines a value's format — is recorded as an attribute
in the API docs, spec evidence, and tests, **not** encoded into the path.
Otherwise the surface would grow a namespace per standards body (a `lud`
namespace beside `nip24`, and so on) just to display provenance.

Every other appearance of an API is a **direct reference** to its canonical
factory — never a separate wrapper — so identity holds and the two cannot drift
in behavior or inferred type. This covers both the ergonomic **root aliases**
(`zostr.event === zostr.nip01.event`; a curated set of Nostr-wide primitives and
the globally unique NIP-19 entities) and any **in-catalog re-export**
(`nip01.metadataFields.nip05` is a direct reference to the canonical
`nip05.identifier`). A re-export must not delegate through a wrapper, add or omit
checks, change types, carry its own behavior docs, or become the source the
canonical path is implemented from. Adding a root alias is an explicit API
decision, not the output of an eligibility algorithm; message namespaces and
kind-specific content (`metadata`, `textNote`, …) are not aliased at the root.

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
  `nip11.relayInformationDocument()` (and its nested objects).
- **reject** — the object is a fixed protocol shape where an unknown key is not
  part of the represented value and could change its meaning. Enforced with a
  `catchall` of `never`. Examples: the event schemas (`event`, `eventTemplate`,
  `unsignedEvent`, `nip10.textNote`, `nip42.authEvent`), the `nip45.count`
  response body, and the NIP-19 pointer outputs.

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
(`signatureCheck`), the NIP-01 OK/CLOSED message-prefix convention
(`nip01.relayMessage.okMessagePrefixCheck` / `closedMessagePrefixCheck`), and
the NIP-10 reply/thread conventions that depend on context the schema can't see
(`nip10.threadCheck` for marked `e`-tag usage, `nip10.participantsCheck` for the
`p`-tag participant set). Cost may
justify moving a check to a separate layer, but cost alone does not override a
required invariant — a MUST-level structural rule stays in the base.

The `.check()` layer also holds MUST-level rules that are **not structural** —
ones whose verdict depends on connection or session context the value itself
doesn't carry. These take that context as a **parameter** (a resolved value, not
the live session), so the check stays a pure function of its inputs: NIP-42's
relay-side steps (`nip42.challengeTagCheck`, `nip42.relayTagCheck`,
`nip42.createdAtCheck`) and NIP-70's protected-event authorization
(`nip70.protectedCheck`, which takes the connection's authenticated pubkeys) are
MUSTs, but a relay MUST, evaluated against state outside the schema — so they are
opt-in checks rather than base-schema rules. The boundary is *structural vs.
contextual*, not *MUST vs. SHOULD*: a MUST that a lone value can be judged
against stays in the base; a MUST that needs outside context becomes a
parameterized check.

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
  A related wire form of the same entities can add a parallel set — the NIP-21
  `nostr:` **URI-form** entity codecs (`nip21.npub` … `nip21.naddr`) are the
  NIP-19 set **minus `nsec`** (which NIP-21 excludes; `nrelay`/`ncryptsec` are
  unmodeled), reusing the NIP-19 decoded shapes. A union-typed entity codec
  (`nip21.any`) decodes any of them to a `{ type, data }` discriminated union.
- **Convenience codecs** — a specific transport + shape assembled for a common
  case (`nip01.metadataContent()`, built on `jsonCodec(nip01.metadata())`).

Fields and schemas live under their canonical owner path (see *Canonical owner
paths*); their spec provenance is recorded in the docs and tests rather than
forced into the path (e.g. the NIP-24 / LUD-16 / LUD-01 profile fields live in
the `nip01.metadataFields` catalog, with their defining spec noted per field).

### Naming

Public names follow ownership and the protocol's own wire vocabulary:

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
  `nip67.relayMessage.eose` ⊃ `nip01.relayMessage.eose`. The same leaf reuse
  applies to a **related wire form** of an existing entity, not only a superset:
  the NIP-21 `nostr:` URI codecs reuse the wrapped entity's leaf
  (`nip21.npub` ↔ `nip19.npub`) to signal that relationship, disambiguated by
  the namespace.
- An **`any` leaf** denotes the union of a namespace's **variant factories**
  (not all its siblings — `uri`, checks, and helpers are excluded), and takes
  the **same kind** as those variants: a union *schema* where they are schemas
  (`nip01.relayMessage.any`), a *codec* where they are codecs (`nip21.any`,
  which unions the entity codecs into a `{ type, data }`-decoding codec).

## Composition

The field atoms are strict and additive-only: `optional`/`catch`/`default` can be
added but never removed (see
[Controllability is the axis](#controllability-is-the-axis-not-strict-vs-lenient)).
So a consumer composes the exact recovery policy they need on top of a strict
base — a strict URL atom becomes an always-present, never-throwing field:

```ts
import { zostr } from "zod-nostr";

const f = zostr.nip01.metadataFields;
const picture = f.picture().catch("").default(""); // strict URL → lenient, never throws
```

The same additivity assembles a whole application schema — e.g. a lenient profile
with per-field policy — from the atoms, in either flavor.

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
- passing the release gates below;
- updated `API.md` and `CHANGELOG.md`;
- for a new spec module (`src/nipXX.ts`, `src/ludXX.ts`), its entry in
  `spec-baseline.json`, and a mention of the document in `README.md` outside
  the `Supported NIPs` table — plus, for a NIP, a row in that table.
  `npm run test:spec-baseline` fails the build otherwise; see
  [decision 0004](./decisions/0004-spec-baselines.md) for why provenance is
  recorded per document.

Two release-surface gates run in CI:

- **External consumer compile** (`npm run test:consumer`, `test/consumer/`) —
  compiles a fixture that imports the package by its published specifiers
  (`zod-nostr` / `zod-nostr/mini`), resolved to the built declarations in
  `dist/`, so it exercises the emitted `.d.ts` a consumer actually sees rather
  than source-relative types.
- **Release-surface comparison** (`src/release-surface.test.ts`) — diffs the
  current public path set against a frozen record of the last published release
  (v0.5.0) and requires every removed/renamed path to be listed in an
  intentional-breaking manifest; additive paths are always allowed, an
  unclassified removal fails. This baseline is deliberately independent of the
  API-surface test's editable expectation: a PR that deletes a public path and
  updates that expectation in the same change passes the API-surface test but is
  still caught here, so a shipped path can't be dropped without declaring it
  breaking.

## Decision records

Longer-form records of specific past decisions live in
[decisions/](./decisions/), separate from this rule set:

- [0001 — Separate kind:0 metadata shape from its transport](./decisions/0001-metadata-shape-and-transport.md)
  — the worked example the *separate shape from transport* and *expose strict
  atoms* principles were derived from.
- [0002 — Documentation altitudes and one-way references](./decisions/0002-documentation-altitudes.md)
  — how the reference, how-to, and rationale docs are split, and why references
  flow one way (how-to → reference → rationale).
- [0003 — JSDoc on the public surface](./decisions/0003-jsdoc-on-the-public-surface.md)
  — editor hover text as an altitude below the reference, required on every
  public path in both flavors and enforced over the built declarations.
- [0004 — Spec baselines](./decisions/0004-spec-baselines.md)
  — recording, per specification, the exact revision the schemas are written
  against, and why that lives in one machine-readable file rather than in
  comments.
