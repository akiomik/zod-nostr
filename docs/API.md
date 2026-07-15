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

A non-negative integer schema for `created_at` (Unix seconds). No coercion.

### `zostr.kind()`

A non-negative integer schema for `kind`. No coercion.

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

A **codec** between a kind:0 `content` string (JSON) and a parsed, validated
profile object `{ name, display_name, picture, nip05 }`. All four fields are
required strings; `nip05` is additionally validated as a NIP-05 identifier
(see [`zostr.nip05()`](#zostrnip05)).

```ts
const profile = zostr.nip01.metadata().decode(event.content);
// { name: "...", display_name: "...", picture: "...", nip05: "..." }

const content = zostr.nip01.metadata().encode(profile);
```

Decoding throws if `content` isn't valid JSON or doesn't match the shape
above. There is no `.catch()`/fallback behavior built in — handle malformed
profiles the way that suits your application (e.g. `.safeDecode()`).

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
`#e`, `#p`). Unknown keys outside this set are rejected.

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

### `zostr.nip05()`

Validates a NIP-05 identifier string (`<local-part>@<domain>`):

- exactly one `@`, not at position 0
- local part matches `[a-z0-9._-]+` (case-insensitive)
- domain is a syntactically valid host (no path, query, or fragment)

```ts
zostr.nip05().parse("bob@example.com");   // ok
zostr.nip05().parse("_@example.com");     // ok (root identifier)
zostr.nip05().parse("bob@example.com/x"); // throws
```

### `zostr.formatNip05Identifier(identifier)`

Plain utility (not a schema) for display purposes: strips a leading `_@`
root-identifier prefix, per [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md#showing-just-the-domain-as-an-identifier).

```ts
zostr.formatNip05Identifier("_@example.com"); // "example.com"
zostr.formatNip05Identifier("bob@example.com"); // "bob@example.com"
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
[`zostr.pubkey()`](#zostrpubkey)); `supported_nips` as an array of numbers;
`banner`/`icon`/`terms_of_service`/`payments_url` as URLs (any scheme, not
just `http`/`https`); `limitation` and `fees` as nested objects with their
own optional/required fields (`fees.*[].amount`/`.unit` are required,
`.period`/`.kinds` are optional). `software`/`contact` are left as plain
strings — `software` is documented as a URL but not always one in practice,
and `contact` may be a bare email address rather than a URL.

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
