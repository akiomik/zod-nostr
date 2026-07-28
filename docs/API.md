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

## NIP-01 — events

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

A `string[][]` schema for the `tags` field.

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

Field-level schemas for kind:0 profile metadata, grouped by NIP/LUD origin.
Use these to compose your **own** profile schema (add per-field fallbacks,
reuse a subset, or tighten a field) — from scratch or by extending
[`metadata()`](#zostrnip01metadata).

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

### `zostr.nip01.textNote()`

Same shape as `zostr.event()`, with `kind` constrained to the literal value
`1`. Structure only, same as `event()` — compose `.check(zostr.signatureCheck())`
if you need signature verification.

### `zostr.subscriptionId()`

A string schema for a NIP-01 subscription id: non-empty, at most 64 chars.
Used as the second element of `REQ`/`CLOSE`/`EVENT` (relay→client)/`EOSE`/
`CLOSED` messages.

### `zostr.filter()`

The NIP-01 `REQ`/`COUNT` filter object: `ids`, `authors`, `kinds`, `since`,
`until`, `limit`, plus any number of `#<a-zA-Z>` tag-value filters (e.g.
`#e`, `#p`). Unknown keys outside this set are rejected. `since`/`until` are
integer timestamps and `limit` is a non-negative integer (an event count);
non-integer, negative, and non-finite values are rejected.

```ts
zostr.filter().parse({
  kinds: [1],
  authors: ["3bf0c63f..."],
  "#e": ["000000..."],
  limit: 50,
});
```

### `zostr.relayMessage`

Tuple schemas for NIP-01 relay→client messages. Each validates structure
only — `event()` does not verify the embedded event's signature (compose
`.check(zostr.signatureCheck())` on `zostr.event()` separately if needed).

| function | wire shape |
| --- | --- |
| `zostr.relayMessage.event()` | `["EVENT", subscriptionId, event]` |
| `zostr.relayMessage.ok()` | `["OK", eventId, boolean, message]` |
| `zostr.relayMessage.eose()` | `["EOSE", subscriptionId]` |
| `zostr.relayMessage.closed()` | `["CLOSED", subscriptionId, message]` |
| `zostr.relayMessage.notice()` | `["NOTICE", message]` |
| `zostr.relayMessage.any()` | union of the five above |

The `message` field of `ok()`/`closed()` is validated as a plain `string` by
default; NIP-01's `<prefix>: <text>` convention is not enforced, since many
relays don't follow it strictly.

```ts
zostr.relayMessage.any().parse(["EOSE", "sub1"]);
zostr.relayMessage.ok().parse(["OK", eventId, true, ""]);
```

### `zostr.relayMessage.okMessagePrefixCheck()` / `zostr.relayMessage.closedMessagePrefixCheck()`

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
const ok = zostr.relayMessage.ok().check(zostr.relayMessage.okMessagePrefixCheck());
ok.parse(["OK", eventId, false, "duplicate: already have this event"]); // ok
ok.parse(["OK", eventId, false, "nope"]); // throws — no prefix

const closed = zostr.relayMessage
  .closed()
  .check(zostr.relayMessage.closedMessagePrefixCheck());
closed.parse(["CLOSED", "sub1", "error: could not connect to the database"]); // ok
```

### `zostr.clientMessage`

Tuple schemas for NIP-01 client→relay messages.

| function | wire shape |
| --- | --- |
| `zostr.clientMessage.event()` | `["EVENT", event]` |
| `zostr.clientMessage.req()` | `["REQ", subscriptionId, ...filter[]]` |
| `zostr.clientMessage.close()` | `["CLOSE", subscriptionId]` |
| `zostr.clientMessage.any()` | union of the three above |

```ts
zostr.clientMessage.req().parse(["REQ", "sub1", { kinds: [1] }]);
zostr.clientMessage.close().parse(["CLOSE", "sub1"]);
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
array of relay URLs). Unknown top-level keys are stripped rather than
rejected, matching NIP-11's treatment of forward-compatible fields.

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

## NIP-11 — relay information document

### `zostr.nip11.relayInformationDocument()`

The NIP-11 relay information document: `name`, `description`, `banner`,
`icon`, `pubkey`, `self`, `contact`, `supported_nips`, `software`, `version`,
`terms_of_service`, `payments_url`, `limitation`, `fees`. Every field is
optional, matching the spec ("Any field may be omitted, and clients MUST
ignore any additional fields they do not understand") — unknown keys are
stripped rather than rejected.

`pubkey`/`self` are validated as 64-character lowercase hex strings (same as
[`zostr.pubkey()`](#zostrpubkey)); `supported_nips` as an array of non-negative
integers; `banner`/`icon`/`terms_of_service`/`payments_url` as URLs (any scheme,
not just `http`/`https`); `limitation` and `fees` as nested objects with their
own optional/required fields (`fees.*[].amount`/`.unit` are required,
`.period`/`.kinds` are optional). `software`/`contact` are left as plain
strings — `software` is documented as a URL but not always one in practice,
and `contact` may be a bare email address rather than a URL.

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
them.

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
