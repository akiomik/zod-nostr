# Guides

Task-oriented recipes for composing zod-nostr in an application. For the full API
surface — every schema, codec, and check — see [API.md](./API.md); for the design
rationale behind these patterns see [design.md](./design.md).

Examples use classic zod. In zod/mini, `parse`/`encode`/`decode` are functional
(`z.parse(schema, value)`, `z.encode(codec, value)`, `z.decode(codec, value)`)
while `.check()` chains the same way; each guide notes the mini form where it
differs.

## Building a tunable profile schema

zod-nostr's field atoms are strict and non-optional by design, so an application
can loosen them exactly as far as it needs — the strict base is always
recoverable, a pre-loosened one is not (see
[Controllability is the axis](./design.md#controllability-is-the-axis-not-strict-vs-lenient)).
This builds a lenient kind:0 profile schema from the strict
[`metadataFields`](./API.md#zostrnip01metadatafields) atoms, adding a per-field
`catch`/`default` recovery policy the base deliberately omits.

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

zod/mini is equivalent via the functional API — the same `trim`/`min` checks and
`catch`/`default` policy, composed as functions:

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

### Accepting cleared (empty-string) fields

A value like `{ website: "" }` is rejected, because `""` is not a valid URL — the
field schema validates whatever is present. Some clients write `""` to *clear* a
kind:0 field instead of removing the key, so an application may want to accept it.
Whether `""` means "reject", "keep as-is", or "treat as absent" is an
application-level recovery decision, so the base stays strict and you compose the
policy you want (see
[Do not bake in recovery policy](./design.md#do-not-bake-in-recovery-policy)).

The safe, lossless form accepts and **preserves** `""` — it adds no one-way
transform, so it still round-trips through `jsonCodec`:

```ts
import { z } from "zod";
import { zostr } from "zod-nostr";

const f = zostr.nip01.metadataFields;
const Metadata = zostr.nip01.metadata().extend({
  website: f.website().or(z.literal("")).optional(),
});

Metadata.parse({ website: "" }); // { website: "" }

const tolerantContent = zostr.jsonCodec(Metadata); // decodes/encodes "" and real URLs
```

The same pattern applies to the other validated fields — `picture`, `banner`,
`nip05`, `lud16`, `lud06`. An application that treats `""` as a cleared field
removes or normalizes it after decoding, keeping that policy out of the schema.

In zod/mini, compose the field the same way with the functional API:

```ts
import * as z from "zod/mini";
import { zostr } from "zod-nostr/mini";

const f = zostr.nip01.metadataFields;
const Metadata = z.extend(zostr.nip01.metadata(), {
  website: z.optional(z.union([f.website(), z.literal("")])),
});
```

## Composing opt-in checks

Base schemas validate **structure** only. Verification that is expensive or
depends on context the value can't carry — signatures, proof of work, expiration,
authentication — is exposed as opt-in [checks](https://zod.dev/api#checks) you add
with `.check()`, rather than baked into every `parse` (see
[Checks beyond the structural contract are opt-in](./design.md#checks-beyond-the-structural-contract-are-opt-in)).
Compose as many as a path needs onto an event schema:

```ts
zostr.event().check(zostr.signatureCheck()).parse(event);
```

Each check is independent, so stack them. Full NIP-13 validation — structure,
signature, achieved difficulty, and committed target:

```ts
const verified = zostr
  .event()
  .check(zostr.signatureCheck())
  .check(zostr.nip13.powCheck(20)) // actual difficulty >= 20
  .check(zostr.nip13.commitmentCheck(20)); // committed target >= 20
verified.parse(minedEvent);
```

Context-dependent checks take that context as a **parameter** (a resolved value,
not the live session), so the check stays a pure function of its inputs. Dropping
expired events needs a reference time:

```ts
const now = Math.floor(Date.now() / 1000);
zostr.event().check(zostr.nip40.expirationCheck(now)).parse(event);
```

A NIP-42 auth event is verified the same way — the relay-side steps take the
challenge the relay sent, its own URL, and the current time as parameters:

```ts
const relay = "wss://relay.example.com/";
const now = Math.floor(Date.now() / 1000);

const verifiedAuth = zostr.nip42
  .authEvent()
  .check(zostr.signatureCheck())
  .check(zostr.nip42.challengeTagCheck(challenge))
  .check(zostr.nip42.relayTagCheck(relay))
  .check(zostr.nip42.createdAtCheck(now));
verifiedAuth.parse(signedAuthEvent);
```

Checks that guard a MUST fail **closed**: `createdAtCheck`, `powCheck`,
`commitmentCheck`, and `expirationCheck` throw at composition time on a bad
argument — a non-finite `now`, a negative difficulty — rather than silently
accepting every value.

In zod/mini the composition is identical — `.check()` chains the same way; only
`parse` differs (`z.parse(verified, event)` instead of `verified.parse(event)`).
