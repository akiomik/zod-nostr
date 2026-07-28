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

### Unknown-key handling is an explicit structural choice

How an object schema treats unknown keys — `strip`, `preserve`, or `reject` —
is part of its structural contract, chosen deliberately from the spec and its
forward-compatibility needs, not a per-value recovery fallback. For example
`nip05.nostrJsonDocument()` and `nip11.relayInformationDocument()` strip
unknown keys, matching each spec's treatment of forward-compatible fields. The
choice is documented in the API and covered by tests, and changing it is
runtime-breaking (see [Compatibility and versioning](#compatibility-and-versioning)).

### Checks beyond the structural contract are opt-in

Checks that fall outside the base schema's declared structural contract are
exposed as composable, opt-in `.check()`s rather than baked in. This covers
advisory conventions (spec "SHOULD"s) and separately-requested semantic or
cryptographic verification. Examples: signature verification
(`signatureCheck`) and the NIP-01 OK/CLOSED message-prefix convention
(`relayMessage.okMessagePrefixCheck` / `closedMessagePrefixCheck`). Cost may
justify moving a check to a separate layer, but cost alone does not override a
required invariant — a MUST-level structural rule stays in the base.

### Separate shape from transport

An object's **shape** (its field schema) is kept separate from the **transport**
that carries it (e.g. a JSON string ⇄ object codec). Expose the shape as a
reusable object schema and the transport as a generic, composable codec, so
consumers can reuse either independently instead of being handed only a fused
unit.

*(Applied to kind:0 profile metadata: the `metadataFields` atom set shipped in
0.2.1; the object schema, generic JSON codec, and convenience content codec are
planned for 0.3.0 — see the metadata worked example, added with that release.)*

### Put guarantees in schemas

Guarantees about output values are expressed in the schema/type, not in runtime
transport helpers ("parse, don't validate"). A generic JSON codec's `encode`
follows `JSON.stringify` semantics and converts only raw throws and a top-level
`undefined` into Zod issues; a consumer who needs a stronger JSON guarantee
models it in the output schema rather than relying on the serializer.

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
  (`jsonCodec(schema)`, planned for 0.3.0).
- **Entity codecs** — decode/encode a specific entity to a fixed output type
  (bech32 entities `npub` / `nsec` / `note` / `nprofile` / `nevent` / `naddr`).
- **Convenience codecs** — a specific transport + shape assembled for a common
  case (the `nip01.metadata` content codec; `metadataContent()` in 0.3.0).

Fields and schemas are named for the spec that defines them (e.g. `nip05`, and
the NIP-24 / LUD-16 / LUD-06 metadata fields), so the public surface reflects
provenance.

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
  rejected; changing object semantics (e.g. unknown-key strip vs. preserve); a
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
- exact public-surface parity between the two flavors (asserted by the
  API-surface test);
- runtime tests in **both** flavors;
- updated `API.md` and `CHANGELOG.md`.

*Intended, being introduced alongside the 0.3.0 work (not yet enforced):*
input/output **type** tests, and a compile fixture that imports the package the
way an external consumer would.

## Metadata API worked example

*Deferred.* The shape/transport separation for kind:0 metadata — the
`metadata()` object schema, a generic JSON codec, and the `metadataContent()`
convenience codec — lands in 0.3.0. This section (including the alternatives
considered and rejected, kept as short one-liners) will be added with that
release, and is expected to become the first record when `docs/decisions/` is
introduced.
