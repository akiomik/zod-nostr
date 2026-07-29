# API Reference

Both entry points expose an identical `zostr` object:

```ts
import { zostr } from "zod-nostr";       // classic zod
import { zostr } from "zod-nostr/mini";  // zod/mini
```

Examples below use classic zod (`.parse()`, `.check()`, `.encode()`/`.decode()`
methods). With `zod/mini`, use the functional equivalents instead:
`z.parse(schema, value)`, `schema.check(...)`, `z.encode(codec, value)`,
`z.decode(codec, value)`.

## Canonical paths and root aliases

Every schema, codec, check, and utility has exactly one **canonical owner
path** — usually its spec namespace (`zostr.nip01.*`, `zostr.nip19.*`,
`zostr.nip05.*`, …). A cross-spec catalog is owned by its domain namespace (the
kind:0 profile-field atoms live under `zostr.nip01.metadataFields.*`), and a
cross-spec utility by the root (`zostr.jsonCodec`). A small, curated set of
Nostr-wide concepts is also re-exposed at the **root** as an ergonomic alias:

```ts
zostr.event === zostr.nip01.event; // true — the alias is a direct reference
zostr.npub === zostr.nip19.npub; // true
```

Because each alias is the _same factory_ as its canonical entry (not a separate
wrapper), the two are identical in behavior and inferred types. The root aliases
are: `pubkey`, `eventId`, `signature`, `timestamp`, `kind`, `tags`,
`eventTemplate`, `unsignedEvent`, `event`, `signatureCheck`, `subscriptionId`,
`filter` (→ `nip01`); `bech32`, `npub`, `nsec`, `note`, `nprofile`, `nevent`,
`naddr` (→ `nip19`). `zostr.jsonCodec` is root-only (a cross-spec utility). The
sections below document each API under its canonical name; a root alias is just
the shorter spelling of the same thing.

Message direction is carried by a `relayMessage`/`clientMessage` namespace under
each NIP (e.g. `zostr.nip01.clientMessage.req()`,
`zostr.nip42.relayMessage.auth()`), not by name suffixes.

## NIP-01 — events

The primitives, event schemas, filter, and messages below live under
`zostr.nip01.*`. The curated ones (`pubkey`, `event`, `filter`, …) are also
available at the root as aliases (see [Canonical paths and root
aliases](#canonical-paths-and-root-aliases)); the examples use the shorter root
spelling.

### `zostr.pubkey()`

A 64-character lowercase hex string schema for a public key.

```ts
zostr.pubkey().parse("3bf0c63f...");
```

### `zostr.eventId()`

A 64-character lowercase hex string schema for an event id.

### `zostr.signature()`

A 128-character lowercase hex string schema for a Schnorr signature.

### `zostr.timestamp()`

An integer schema for `created_at` (Unix seconds), matching NIP-01's
`<unix timestamp in seconds>` and its `integer` filter `since`/`until`. No
range bound and no coercion (negative, pre-Epoch values are not rejected).

### `zostr.kind()`

An integer schema for `kind`, constrained to `0`–`65535` as NIP-01 defines it
(`<integer between 0 and 65535>`). No coercion.

### `zostr.tags()`

A `string[][]` schema for the `tags` field. Every tag must be a **non-empty**
array of strings — its first element is the tag name, so an empty `[]` tag is
rejected. The outer array may be empty (an event can carry no tags).

### `zostr.eventTemplate()`

Structure of an unsigned, un-authored event: `kind`, `created_at`, `tags`,
`content`. Equivalent to nostr-tools' `EventTemplate`.

```ts
zostr.eventTemplate().parse({
  kind: 1,
  created_at: 1700000000,
  tags: [],
  content: "hello",
});
```

### `zostr.unsignedEvent()`

`eventTemplate()` plus `pubkey`. Equivalent to nostr-tools' `UnsignedEvent`.

### `zostr.event()`

Full NIP-01 event shape: `id`, `pubkey`, `created_at`, `kind`, `tags`,
`content`, `sig`. **Validates structure only** — it does not verify the
signature. Compose `zostr.signatureCheck()` when you need that:

```ts
zostr.event().check(zostr.signatureCheck()).parse(event);
```

The event shape is fixed: **unknown keys are rejected**, not silently stripped
(the same for `eventTemplate()`, `unsignedEvent()`, `nip10.textNote()`, and
`nip42.authEvent()`). Forward-compatible metadata belongs in `tags`.

### `zostr.signatureCheck()`

A [check](https://zod.dev/api#checks) (not a schema) that verifies a NIP-01
event's signature using `nostr-tools`' `verifyEvent`. Pass it to `.check()`
on an object schema shaped like an event (normally `zostr.event()`):

```ts
const verifiedEvent = zostr.event().check(zostr.signatureCheck());
verifiedEvent.parse(event); // throws if id/sig don't match
```

### `zostr.nip01.metadata()`

An **object schema** for a parsed kind:0 profile. Every known field is
**optional** and validated strictly when present, grouped by originating spec
(see [`zostr.nip01.metadataFields`](#zostrnip01metadatafields) for the field
list); unknown keys are **preserved** as `unknown` (a forward-compatible
catchall), not stripped. No `.catch()`/fallback is baked in — a present-but-
invalid field fails, so layer your own recovery policy on top (or reuse the
field atoms from `metadataFields`).

```ts
zostr.nip01.metadata().parse({ name: "alice", nip05: "alice@example.com" });
// { name: "alice", nip05: "alice@example.com" }

// unknown keys are kept, not stripped:
zostr.nip01.metadata().parse({ name: "a", custom: 1 }); // { name: "a", custom: 1 }
```

The output type is exported as `ProfileMetadata`. For the JSON `content`
**string** carried by a kind:0 event, use
[`zostr.nip01.metadataContent()`](#zostrnip01metadatacontent).

### `zostr.nip01.metadataContent()`

A **codec** between a kind:0 `content` string (JSON) and the `metadata()`
profile object, with the same decode/encode behavior as
`zostr.jsonCodec(zostr.nip01.metadata())`.

```ts
const profile = zostr.nip01.metadataContent().decode(event.content);
const content = zostr.nip01.metadataContent().encode(profile);
```

Invalid JSON, or a field that fails validation, is reported as a Zod issue (see
[`zostr.jsonCodec(schema)`](#zostrjsoncodecschema) for the encode/decode
contract). Because `metadata()` preserves unknown keys, a decode → encode
round-trip keeps forward-compatible and non-standard fields rather than
dropping them.

### `zostr.nip01.metadataFields`

The canonical catalog of field-level schemas for kind:0 profile metadata. The
value formats come from several specs (`origin` below); that provenance is an
attribute, not a path — the catalog is owned here because it composes one
consumer domain (the profile). Use these to compose your **own** profile schema
(add per-field fallbacks, reuse a subset, or tighten a field) — from scratch or
by extending [`metadata()`](#zostrnip01metadata).

| factory | origin | validates |
| --- | --- | --- |
| `metadataFields.name()` | NIP-01 | `string` |
| `metadataFields.about()` | NIP-01 | `string` |
| `metadataFields.picture()` | NIP-01 | URL |
| `metadataFields.displayName()` | NIP-24 | `string` |
| `metadataFields.website()` | NIP-24 | URL |
| `metadataFields.banner()` | NIP-24 | URL |
| `metadataFields.bot()` | NIP-24 | `boolean` |
| `metadataFields.birthday()` | NIP-24 | `{ year?, month?, day? }` (numbers) |
| `metadataFields.nip05()` | NIP-05 | NIP-05 identifier |
| `metadataFields.lud16()` | LUD-16 | `<username>[+<tag>]@<domain>` lightning address |
| `metadataFields.lud06()` | LUD-06 | bech32 `lnurl` string (checksum + data words) |

`metadataFields.nip05()` is a **direct reference** to
[`zostr.nip05.identifier()`](#zostrnip05identifier) (the NIP-05 identifier's
canonical home) — the profile field and the general schema are the same factory,
not two copies.

Each schema is **strict and non-optional** — a deliberate choice so you can add
`optional`/`catch`/`default` yourself (a pre-weakened field can't be recovered).
`lud06()` validates the bech32 checksum and `lnurl` HRP only; it does not decode
to a LUD-01 URL.

```ts
// classic — build a lenient profile schema from the strict field atoms
const f = zostr.nip01.metadataFields;
const Profile = z.object({
  name: f.name().trim().min(1).catch("").default(""),
  picture: f.picture().catch("").default(""),
  nip05: f.nip05().catch("").default(""),
});
```

In zod/mini, compose with the functional API instead
(`z._default(z.catch(f.name(), ""), "")`).

### `zostr.subscriptionId()`

A string schema for a NIP-01 subscription id: non-empty, at most 64 chars.
Used as the second element of `REQ`/`CLOSE`/`EVENT` (relay→client)/`EOSE`/
`CLOSED` messages.

### `zostr.filter()`

The NIP-01 `REQ`/`COUNT` filter object: `ids`, `authors`, `kinds`, `since`,
`until`, `limit`, plus any number of `#<a-zA-Z>` tag-value filters (e.g.
`#e`, `#p`). Unknown keys outside this set are rejected. `since`/`until` are
integer timestamps and `limit` is a non-negative integer (an event count);
non-integer, negative, and non-finite values are rejected. `ids`, `authors`,
`kinds`, and each `#<letter>` array must be **non-empty** when present, matching
NIP-01's grammar (an array field, when present, lists at least one value); a
previously-accepted empty `[]` is now rejected. The empty filter object `{}`
(match anything) stays valid. An empty array had no defined meaning, so there is
no drop-in replacement: **omit** the field to place no constraint on that
dimension (this widens the match), or drop the filter / don't send the request
to select nothing.

```ts
zostr.filter().parse({
  kinds: [1],
  authors: ["3bf0c63f..."],
  "#e": ["000000..."],
  limit: 50,
});
```

### `zostr.nip01.relayMessage`

Tuple schemas for NIP-01 relay→client messages. Each validates structure
only — `event()` does not verify the embedded event's signature (compose
`.check(zostr.signatureCheck())` on `zostr.event()` separately if needed).

| function | wire shape |
| --- | --- |
| `zostr.nip01.relayMessage.event()` | `["EVENT", subscriptionId, event]` |
| `zostr.nip01.relayMessage.ok()` | `["OK", eventId, boolean, message]` |
| `zostr.nip01.relayMessage.eose()` | `["EOSE", subscriptionId]` |
| `zostr.nip01.relayMessage.closed()` | `["CLOSED", subscriptionId, message]` |
| `zostr.nip01.relayMessage.notice()` | `["NOTICE", message]` |
| `zostr.nip01.relayMessage.any()` | union of the five above |

The `message` field of `ok()`/`closed()` is validated as a plain `string` by
default; NIP-01's `<prefix>: <text>` convention is not enforced, since many
relays don't follow it strictly.

```ts
zostr.nip01.relayMessage.any().parse(["EOSE", "sub1"]);
zostr.nip01.relayMessage.ok().parse(["OK", eventId, true, ""]);
```

### `zostr.nip01.relayMessage.okMessagePrefixCheck()` / `zostr.nip01.relayMessage.closedMessagePrefixCheck()`

Opt-in [checks](https://zod.dev/api#checks) that enforce NIP-01's
`"<prefix>: <message>"` shape for `OK`/`CLOSED` messages (a single-word
machine-readable prefix, `": "`, then human-readable text). The prefix isn't
restricted to NIP-01's "standardized" list (`duplicate`, `pow`, `blocked`,
`rate-limited`, `invalid`, `restricted`, `mute`, `error`) — relays may use
others (NIP-01's own `CLOSED` example uses `unsupported:`), so only the shape
is checked, not membership in that list.

For `OK`, the format is only required when the event was **rejected** (3rd
element `false`); NIP-01 allows the message to be an empty string when
accepted. Compose explicitly, the same way as `signatureCheck()`:

```ts
const ok = zostr.nip01.relayMessage.ok().check(zostr.nip01.relayMessage.okMessagePrefixCheck());
ok.parse(["OK", eventId, false, "duplicate: already have this event"]); // ok
ok.parse(["OK", eventId, false, "nope"]); // throws — no prefix

const closed = zostr.nip01.relayMessage
  .closed()
  .check(zostr.nip01.relayMessage.closedMessagePrefixCheck());
closed.parse(["CLOSED", "sub1", "error: could not connect to the database"]); // ok
```

### `zostr.nip01.clientMessage`

Tuple schemas for NIP-01 client→relay messages.

| function | wire shape |
| --- | --- |
| `zostr.nip01.clientMessage.event()` | `["EVENT", event]` |
| `zostr.nip01.clientMessage.req()` | `["REQ", subscriptionId, filter, ...filter[]]` |
| `zostr.nip01.clientMessage.close()` | `["CLOSE", subscriptionId]` |
| `zostr.nip01.clientMessage.any()` | union of the three above |

`req()` requires **at least one** filter, matching NIP-01's grammar
(`<filters1>` then `<filters2>...`); to subscribe to everything, send a single
empty `{}` filter.

```ts
zostr.nip01.clientMessage.req().parse(["REQ", "sub1", { kinds: [1] }]);
zostr.nip01.clientMessage.req().parse(["REQ", "sub1", {}]); // everything
zostr.nip01.clientMessage.close().parse(["CLOSE", "sub1"]);
```

## NIP-05 — identifiers

### `zostr.nip05.identifier()`

Validates a NIP-05 identifier string (`<local-part>@<domain>`):

- exactly one `@`, not at position 0
- local part matches `[a-z0-9._-]+` (case-insensitive)
- domain is a syntactically valid host (no path, query, or fragment)

```ts
zostr.nip05.identifier().parse("bob@example.com");   // ok
zostr.nip05.identifier().parse("_@example.com");     // ok (root identifier)
zostr.nip05.identifier().parse("bob@example.com/x"); // throws
```

### `zostr.nip05.nostrJsonDocument()`

The `.well-known/nostr.json` document a NIP-05 domain serves in response to
`GET /.well-known/nostr.json?name=<local-part>`: `names` (required — a
mapping of local-part to lowercase 64-character hex pubkey) and `relays`
(the spec's "recommended" optional attribute — a mapping of pubkey to an
array of relay URLs). Unknown top-level keys are **preserved** rather than
stripped — the served document is forward-compatible and may carry extension
fields, matching NIP-11's treatment.

`names` keys use the same local-part character check as
[`zostr.nip05.identifier()`](#zostrnip05identifier); `names` values and
`relays` keys are validated as 64-character lowercase hex strings (same as
[`zostr.pubkey()`](#zostrpubkey)). Relay URLs in `relays` are left as plain
strings, matching how relay URLs are handled elsewhere in this library (e.g.
`zostr.nprofile()`'s `relays` field).

```ts
zostr.nip05.nostrJsonDocument().parse({
  names: { bob: "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459" },
  relays: {
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459": [
      "wss://relay.example.com",
    ],
  },
});
```

### `zostr.nip05.formatIdentifier(identifier)`

Plain utility (not a schema) for display purposes: strips a leading `_@`
root-identifier prefix, per [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md#showing-just-the-domain-as-an-identifier).

```ts
zostr.nip05.formatIdentifier("_@example.com"); // "example.com"
zostr.nip05.formatIdentifier("bob@example.com"); // "bob@example.com"
```

## NIP-10 — text notes

### `zostr.nip10.textNote()`

The kind:1 text note: the same shape as `zostr.event()` with `kind` constrained
to `1` (the definition of kind 1 as a plaintext note belongs to NIP-10). It
validates the minimum **structural** form only — like `event()` it does not
verify the signature (compose `.check(zostr.signatureCheck())`), and it does
**not** validate NIP-10's reply/thread `e`/`p` tag conventions. Unknown keys are
rejected, the same as `event()`.

```ts
zostr.nip10.textNote().parse(signedKind1Event);
```

## NIP-11 — relay information document

### `zostr.nip11.relayInformationDocument()`

The NIP-11 relay information document: `name`, `description`, `banner`,
`icon`, `pubkey`, `self`, `contact`, `supported_nips`, `software`, `version`,
`terms_of_service`, `payments_url`, `limitation`, `fees`. Every field is
optional, matching the spec ("Any field may be omitted, and clients MUST
ignore any additional fields they do not understand") — unknown keys are
**preserved** rather than stripped, at the top level and in the nested
`limitation`/`fees` objects.

`pubkey`/`self` are validated as 64-character lowercase hex strings (same as
[`zostr.pubkey()`](#zostrpubkey)); `supported_nips` as an array of non-negative
integers; `banner`/`icon`/`terms_of_service`/`payments_url`/`software` as URLs
(any scheme, not just `http`/`https`) — NIP-11 defines `software` as "URL to the
relay's software homepage"; `limitation` and `fees` as nested objects with their
own optional/required fields (`fees.*[].amount`/`.unit` are required,
`.period`/`.kinds` are optional). `contact` is left as a plain string — it may be
a bare email address rather than a URL.

Numeric fields are validated to their spec-defined form. Count and length
fields (`limitation.max_*`, `default_limit`, `min_pow_difficulty`,
`fees.*[].period`) are non-negative integers. `limitation.created_at_*_limit`
are also non-negative integers — they are relative offsets in seconds (how far
in the past/future an event's `created_at` may be), not absolute timestamps, so
the spec's example values (`94608000` ≈ 3 years, `300` = 5 minutes) only make
sense as durations. `fees.*[].amount` is a non-negative **finite number** (not
required to be an integer, since `unit` is free-form and may be sub-unit). And
`fees.*[].kinds` are NIP-01 event kinds (same as [`zostr.kind()`](#zostrkind),
`0..65535`). Negative and non-finite values are rejected, as are fractions on
the integer fields.

```ts
zostr.nip11.relayInformationDocument().parse({
  name: "relay.example",
  pubkey: "3bf0c63f...",
  supported_nips: [1, 11, 42],
  limitation: { max_message_length: 16384, auth_required: false },
  fees: { admission: [{ amount: 1000000, unit: "msats" }] },
});
```

## NIP-19 — bech32 entities

These live under `zostr.nip19.*` and are also aliased at the root (`zostr.npub`
=== `zostr.nip19.npub`, etc.); the examples use the root spelling.

### `zostr.bech32(prefix)`

Lightweight format check: validates that a string decodes to a bech32 entity
with the given `prefix`, without exposing the decoded value. Useful when you
just need to know "is this a valid npub-shaped string" without paying for
(or needing) the decoded payload.

`prefix` is one of `"npub" | "nsec" | "note" | "nprofile" | "nevent" | "naddr"`.

```ts
zostr.bech32("npub").parse("npub1..."); // returns the string unchanged
zostr.bech32("nsec").parse("npub1..."); // throws (wrong prefix)
```

### NIP-19 codecs

Each of the following returns a **codec**: `.decode(bech32String)` produces
the underlying value, `.encode(value)` produces the bech32 string. Codecs can
also be used with the top-level `z.decode()`/`z.encode()` (or
`z.parse()`/`z.encode()` in `zod/mini`) and composed with `.pipe()` like any
other schema.

| function | decodes to |
| --- | --- |
| `zostr.npub()` | hex pubkey (`string`) |
| `zostr.nsec()` | secret key (`Uint8Array`, 32 bytes) |
| `zostr.note()` | hex event id (`string`) |
| `zostr.nprofile()` | `{ pubkey: string, relays?: string[] }` |
| `zostr.nevent()` | `{ id: string, relays?: string[], author?: string, kind?: number }` |
| `zostr.naddr()` | `{ identifier: string, pubkey: string, kind: number, relays?: string[] }` |

The `kind` in `nevent()`/`naddr()` is validated as a **32-bit unsigned
integer** (`0..4294967295`), matching how NIP-19 encodes it (big-endian
`uint32`) — it is not narrowed to NIP-01's `0..65535` event-kind range, since
NIP-19 does not. Layer [`zostr.kind()`](#zostrkind) on top yourself if you want
NIP-01 event-kind validation.

```ts
import { getPublicKey } from "nostr-tools/pure";

const pubkey = getPublicKey(secretKey);
const npub = zostr.npub().encode(pubkey);   // "npub1..."
zostr.npub().decode(npub);                  // pubkey (hex string)

zostr.nsec().decode("nsec1...");            // Uint8Array(32)
```

Note the asymmetry: `npub()`/`note()` decode to hex **strings**, while
`nsec()` decodes to a **`Uint8Array`** — this matches how `nostr-tools`
represents secret keys elsewhere (`generateSecretKey`, `finalizeEvent`, ...),
rather than an arbitrary choice specific to this library.

`nprofile()`/`nevent()`/`naddr()` decode to plain objects reflecting exactly
what `nostr-tools`' `nip19.decode()` returns, including default `relays: []`
and `author: undefined` fields when the source bech32 string didn't encode
them. A pointer is a fixed TLV shape, so these schemas **reject** unknown keys
(their output type has no index signature): `encode()` throws on an extra object
key rather than dropping it, since the TLV encoding carries only the known
fields — preserving it in the type would be a lie a `decode(encode(x))`
round-trip can't honor.

## NIP-42 — authentication

Schemas for the NIP-42 `AUTH` handshake (a client authenticating to a relay by
signing an ephemeral `kind: 22242` event), plus opt-in checks for the relay-side
verification steps.

| function | wire shape |
| --- | --- |
| `zostr.nip42.authEvent()` | canonical auth event `{ ..., kind: 22242 }` |
| `zostr.nip42.relayMessage.auth()` | `["AUTH", challenge]` (relay → client) |
| `zostr.nip42.clientMessage.auth()` | `["AUTH", signedAuthEvent]` (client → relay) |

Both directions use the `AUTH` message name; they're distinguished by the
payload — the relay sends a `challenge` string
(`nip42.relayMessage.auth`), the client replies with the signed `authEvent()`
to request authentication (`nip42.clientMessage.auth`), and the relay answers
that with an `OK` message.

### `zostr.nip42.authEvent()`

The canonical authentication event, fixed to `kind: 22242`. Structure only, the
same as `zostr.event()` — it does **not** verify the signature. The
`"relay"`/`"challenge"` tags are not required by the schema: NIP-42 only says the
event *should* carry them, and matching them (and the timestamp) is a relay-side
step that depends on the connection's context. Those are exposed as opt-in
checks rather than baked in:

- `zostr.nip42.challengeTagCheck(challenge)` — the `"challenge"` tag matches the
  challenge the relay sent.
- `zostr.nip42.relayTagCheck(relayUrl)` — the `"relay"` tag matches the relay
  URL. Compared as **exact strings**; NIP-42 allows URL normalization, so a
  consumer wanting a looser match (e.g. by domain) normalizes both sides first.
- `zostr.nip42.createdAtCheck(now, toleranceSeconds?)` — `created_at` is within
  `toleranceSeconds` of `now` (both in unix seconds). `toleranceSeconds` defaults
  to `600` (~10 minutes, the window NIP-42 gives as an example) and can be
  overridden. Because NIP-42 makes the relay's time check a MUST, this fails
  **closed** on misconfiguration: the factory throws if `now` isn't finite or
  `toleranceSeconds` isn't finite and non-negative (which would otherwise make
  the comparison silently accept every timestamp), rather than quietly disabling
  the check.

Compose them the same way as `zostr.signatureCheck()` (which verifies the
signature — reuse it, there's no NIP-42-specific signature check):

```ts
const relay = "wss://relay.example.com/";
const nowInSeconds = Math.floor(Date.now() / 1000);

const verifiedAuth = zostr.nip42
  .authEvent()
  .check(zostr.signatureCheck())
  .check(zostr.nip42.challengeTagCheck(challenge))
  .check(zostr.nip42.relayTagCheck(relay))
  .check(zostr.nip42.createdAtCheck(nowInSeconds));

zostr.nip42.relayMessage.auth().parse(["AUTH", challenge]); // relay → client
zostr.nip42.clientMessage.auth().parse(["AUTH", signedAuthEvent]); // client → relay
```

`AUTH` messages sent by clients are answered with the existing NIP-01 `OK`
message (`zostr.nip01.relayMessage.ok()`); NIP-42's `auth-required:`/`restricted:`
prefixes on `OK`/`CLOSED` are ordinary prefixes accepted by
`zostr.nip01.relayMessage.okMessagePrefixCheck()`/`closedMessagePrefixCheck()`.

## NIP-45 — event counts

Tuple schemas for the NIP-45 `COUNT` request/response, plus the response body
object. Each validates structure only.

| function | wire shape |
| --- | --- |
| `zostr.nip45.clientMessage.count()` | `["COUNT", queryId, filter, ...filter[]]` |
| `zostr.nip45.relayMessage.count()` | `["COUNT", queryId, count]` |
| `zostr.nip45.count()` | `{ count, approximate?, hll? }` |

NIP-45 names the id `query_id` on the wire (its HLL section also calls it
`subscription_id`); it is validated with the same format as a NIP-01
subscription id — a non-empty string of at most 64 chars (see
[`zostr.subscriptionId()`](#zostrsubscriptionid)) — which also lets a `CLOSED`
refusal reuse the same constraints.

`nip45.clientMessage.count()` carries the same NIP-01 `REQ`/`COUNT` filters (see
[`zostr.filter()`](#zostrfilter)), OR'd together. **At least one** filter is
required, matching NIP-01's `REQ` grammar (`<filters1>` then `<filters2>...`);
to count everything, send a single empty `{}` filter.

### `zostr.nip45.count()`

The COUNT response body object:

- `count` — a **non-negative integer**. Relays may return a probabilistic
  estimate, but it's still an event count, so fractional, negative, and
  non-finite values are rejected.
- `approximate?` — optional `boolean` flagging a probabilistic count.
- `hll?` — optional HyperLogLog value: a **512-char hex** string (256 `uint8`
  registers concatenated). NIP-45 doesn't mandate lowercase, so upper/mixed
  case is accepted.

The COUNT response body is a fixed shape: **unknown keys are rejected** (as in
`zostr.event()`), not silently stripped, and no recovery policy
(`.catch`/`.default`) is baked in.

```ts
zostr.nip45.clientMessage.count().parse(["COUNT", "sub1", { kinds: [7], "#e": [id] }]);
zostr.nip45.relayMessage.count().parse(["COUNT", "sub1", { count: 93412452, approximate: true }]);
zostr.nip45.count().parse({ count: 2044, hll: "01ef0705..." /* 512 hex chars */ });
```

A relay refusing a `COUNT` request replies with NIP-01's `CLOSED` message
(`zostr.nip01.relayMessage.closed()`), not a `COUNT`.

## NIP-50 — search

NIP-50 adds a `search` field to the `REQ` filter: a human-readable query string
the relay interprets to return matching events.

| function | wire shape |
| --- | --- |
| `zostr.nip50.filter()` | the NIP-01 filter plus an optional `search` string |
| `zostr.nip50.clientMessage.req()` | `["REQ", subscriptionId, searchFilter, ...searchFilter[]]` |

`nip50.filter()` is [`zostr.filter()`](#zostrfilter) extended with `search`; it
inherits the base filter's fields and `"#<letter>"` tag-filter handling, so it
tracks NIP-01 automatically. `search` is a plain optional string with no
`.min`/recovery policy baked in — NIP-50 places no format constraint on it and
doesn't forbid an empty string. A consumer requiring a non-empty query replaces
the `search` field with a stricter schema; use `.safeExtend()` (not `.extend()`)
because the object carries a filter-key check:

```ts
// classic
const strict = zostr.nip50.filter().safeExtend({ search: z.string().min(1) });
// mini
// z.safeExtend(zostr.nip50.filter(), { search: z.string().check(z.minLength(1)) })
```

The `key:value` search extensions (`include:spam`,
`domain:`, `language:`, ...) live **inside** the `search` string, not as extra
filter fields, so they need no schema modeling. Ranking results by score and
advertising support via `supported_nips` are relay concerns outside this schema.

`nip50.clientMessage.req()` is an **intentional superset** of
[`zostr.nip01.clientMessage.req()`](#zostrnip01clientmessage): a search filter is a NIP-01
filter plus optional `search`, so it also accepts plain filters, and it keeps
the **at least one filter** requirement of NIP-01's `REQ` grammar.
`zostr.nip01.clientMessage.req()`/`any()` stay NIP-01-only (they reject `search`), as
does `zostr.nip45.clientMessage.count()` — NIP-50 introduces `search` on `REQ`, not
`COUNT`. To accept a NIP-50 `REQ` alongside the other client messages, compose a
union:

```ts
zostr.nip50.filter().parse({ kinds: [1], search: "best nostr apps" });
zostr.nip50.clientMessage.req().parse(["REQ", "sub1", { search: "orange" }, { kinds: [1] }]);

// clientMessage.any() alone rejects a search filter:
const clientMessage = z.union([zostr.nip01.clientMessage.any(), zostr.nip50.clientMessage.req()]);
clientMessage.parse(["REQ", "sub1", { search: "purple" }]);
```

## NIP-67 — EOSE completeness hint

NIP-67 extends NIP-01's `EOSE` with an optional third element: an array of hint
strings.

| function | wire shape |
| --- | --- |
| `zostr.nip67.relayMessage.eose()` | `["EOSE", subscriptionId]` or `["EOSE", subscriptionId, hints]` |

`eose()` is a union of the exact two- and three-element wire shapes (not a tuple
with an optional third item), so it accepts only the shapes that appear on the
JSON wire — an explicit `undefined` third element is rejected — and infers the
precise `["EOSE", string] | ["EOSE", string, string[]]`.

The `hints` are plain strings, not a fixed enum. NIP-67 defines `"finish"` (the
relay has sent every stored event matching the filters — do not paginate) and
`"more"` (the relay holds more — paginate), but requires clients to accept
unknown hint values without error, so no enum is baked in. The array MAY be
empty and MAY carry multiple hints. Only the **presence** of `"finish"`/`"more"`
is definitive; a missing third element, an empty array, or unknown-only hints
leave completeness unknown, in which case NIP-67 says the client SHOULD paginate
with `until` set to the oldest received event's `created_at`. Interpreting the
hints is the consumer's job — the schema validates structure only.

`zostr.nip67.relayMessage.eose()` is a strict superset of
[`zostr.nip01.relayMessage.eose()`](#zostrnip01relaymessage) (it also accepts the bare
two-element form). `zostr.nip01.relayMessage.any()` stays NIP-01-only — like the
NIP-42/45 messages, it isn't folded in — so to accept a NIP-67 `EOSE` alongside
the other relay messages, compose a union:

```ts
zostr.nip67.relayMessage.eose().parse(["EOSE", "sub1"]); // bare NIP-01 form still accepted
zostr.nip67.relayMessage.eose().parse(["EOSE", "sub1", ["finish"]]);

// relayMessage.any() alone rejects the three-element form:
const relayMessage = z.union([zostr.nip01.relayMessage.any(), zostr.nip67.relayMessage.eose()]);
relayMessage.parse(["EOSE", "sub1", ["more"]]);
```

## Generic codecs

### `zostr.jsonCodec(schema)`

A **codec** between a JSON string and the given `schema`'s value — the generic
transport for any JSON-encoded content.

```ts
const codec = zostr.jsonCodec(z.object({ a: z.number() }));

z.decode(codec, '{"a":1}'); // { a: 1 }
z.encode(codec, { a: 1 });  // '{"a":1}'
```

- **decode** accepts any schema. It runs `JSON.parse` then the schema; invalid
  JSON, or a value that doesn't match the schema, is reported as a Zod issue
  (via `z.safeDecode`) rather than throwing a raw `SyntaxError`.
- **encode** requires a schema that can be encoded backward (no one-way
  `.transform()`). Zod encodes the value through the schema first, so a
  unidirectional transform throws `$ZodEncodeError` there — a zod codec property
  the codec does not convert to an issue (it throws even under `z.safeEncode`).
  After that succeeds, `JSON.stringify` runs, following its usual semantics:
  only its own raw error (a `BigInt`, a circular reference) or a top-level
  `undefined` result is turned into a Zod issue; other conversions (dropping
  nested `undefined`/functions, `NaN`/`Infinity` → `null`, `Date` → ISO string,
  ...) apply as usual. For a stronger JSON guarantee, express it in the output
  `schema` rather than relying on the codec.

Its decode side composes with any output schema — e.g.
`zostr.jsonCodec(zostr.nip11.relayInformationDocument())` decodes a NIP-11
document served as a JSON string.
