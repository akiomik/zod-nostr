# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Spec baselines for every specification the schemas are built on.**
  `spec-baseline.json` records, per document, the exact revision these schemas
  are written against: the commit in its source repository, that commit's date,
  and the SHA-256 of the document's Markdown at that commit. It covers the 14
  NIPs and, because the kind:0 profile fields are not all defined by NIPs,
  LUD-06 and LUD-16 from `lnurl/luds`. The `Supported NIPs` table in `README.md`
  gains a `Spec baseline` column linking each NIP at its recorded revision, so
  the text a schema was built for is one click away instead of being implicit.
  The SHA-256 is what makes the file more than documentation — it lets upstream
  edits be detected mechanically rather than noticed by accident. An entry moves
  only when the document is re-read and the schemas are confirmed against it;
  git history and this file record when that happened.

- **`npm run test:spec-baseline`**, which holds four copies of the same list
  together: the spec modules under `src/`, `spec-baseline.json`, the
  `Supported NIPs` table, and the `Covers …` sentence above it. The module
  filenames decide what must be baselined (`src/nip67.ts` demands a `nips.67`
  entry, and an entry with no module is dead weight), the table must quote the
  recorded revision cell by cell, and every check runs in both directions — so a
  spec added to one place and forgotten in another fails the build instead of
  shipping with no recorded provenance. A document from a family with no table
  row (LUD-06, LUD-16) is held to what the README can carry: the family's
  repository and every one of its documents must be named in the prose. It runs
  in CI and before publish, and stays offline: whether upstream has moved since
  a baseline was recorded is a separate question from whether the repository
  agrees with itself.

- **NIP-24 in the `Supported NIPs` table.** Its extra kind:0 profile metadata
  fields (`display_name`, `website`, `banner`, `bot`, `birthday`) were already
  exposed as `zostr.nip01.metadataFields.*` and documented in `docs/API.md`, but
  the table listed only the NIPs with a namespace of their own, leaving NIP-24
  support undiscoverable from the README.

- **`docs/decisions/0004-spec-baselines.md`**, recording why provenance lives in
  one machine-readable file rather than in per-module comments, why an entry
  carries no review date, and why the check stays offline.

### Fixed

- **NIP-67 documentation listed only two of the three defined hints.** NIP-67
  added an `"auth"` hint (the relay may hold more stored events for a client
  that completes NIP-42 authentication) alongside `"finish"` and `"more"`. The
  JSDoc on `zostr.nip67.relayMessage.eose()` and the NIP-67 section of
  `docs/API.md` still described the earlier two-value set. No schema change: the
  hints array is validated as plain strings precisely because NIP-67 requires
  clients to accept unknown hint values, so `"auth"` already parsed.

- **LUD-16's default identifier was undocumented.** LUD-16 added a `@<domain>`
  shorthand for the canonical `_@<domain>` default identifier. `lud16()` accepts
  `_@<domain>` like any other username and rejects the shorthand, which the spec
  permits (a wallet that does not implement it MAY reject the address); that
  reading is now stated in the JSDoc, in `docs/API.md`, and pinned by tests
  rather than left implicit. No schema change.

## [0.5.2] - 2026-08-01

### Added

- **JSDoc across the whole public surface.** Every `zostr` path — each schema,
  codec, and check factory, each namespace, and the root object itself — now
  carries a doc comment, so editors show a summary on hover and in completion.
  Previously the built declarations carried none, and the explanations only
  existed in `docs/API.md`. The comments lead with what a name can't carry:
  whether unknown keys are rejected or preserved, which arguments fail closed at
  composition time, where encode and decode are asymmetric, and how
  similarly-named siblings differ (`metadata()` vs. `metadataContent()`,
  `nip13.powCheck()` vs. `nip13.commitmentCheck()`). `docs/API.md` remains the
  full reference; a hover summary is a lossy view of it.

  Both entry points document every path identically. `npm run test:jsdoc`
  checks that over the built declarations — no path undocumented, no path in one
  flavor only, no two comments disagreeing — and runs in CI and before publish.
  The rationale is recorded in
  `docs/decisions/0003-jsdoc-on-the-public-surface.md`.

## [0.5.1] - 2026-07-31

### Added

- **NIP-70 protected-event support.** `zostr.nip70` models the `["-"]` protected
  marker and keeps its structure separate from the relay-side authorization:
  - `zostr.nip70.protectedTag()` — schema for the `["-"]` marker tag. The marker
    carries no value, so it is a fixed single-element tuple (a second element is
    rejected).
  - `zostr.nip70.protectedCheck(authenticatedPubkeys?)` — opt-in check that a
    protected event's author is among the connection's authenticated pubkeys.
    Takes the **set** of authenticated pubkeys (NIP-42 allows several per
    connection), defaults to `[]` (unauthenticated → NIP-70's default reject),
    and detects any `"-"`-led tag as a marker so a malformed `["-", "x"]` can't
    bypass the check. Composes onto an event schema like `zostr.signatureCheck()`.

- **NIP-40 expiration-timestamp support.** `zostr.nip40` models the `expiration`
  tag and keeps its structure separate from the time comparison:
  - `zostr.nip40.expirationTag()` — schema for the
    `["expiration", <unix timestamp in seconds>]` tag. The value is validated as
    an integer unix-seconds string (same format as `created_at`).
  - `zostr.nip40.expirationCheck(now)` — opt-in check that the event is not
    expired at `now`. It inspects every `expiration` tag (NIP-40 sets no limit on
    their number) and fails on the earliest expiry, compares with `BigInt` so
    out-of-safe-range timestamps stay exact, and fails closed on a non-finite
    `now`. Composes onto an event schema like `zostr.signatureCheck()`.

- **NIP-13 proof-of-work support.** `zostr.nip13` models NIP-13's `nonce` tag
  and separates verifying a note's achieved difficulty from its committed
  target:
  - `zostr.nip13.nonceTag()` — schema for the `["nonce", <nonce>, <target>?]`
    tag. The committed target is optional (NIP-13 makes it a SHOULD) and
    validated as a non-negative integer string when present.
  - `zostr.nip13.powCheck(minDifficulty)` — opt-in check that the event id has
    at least `minDifficulty` leading zero bits (achieved difficulty).
  - `zostr.nip13.commitmentCheck(minDifficulty)` — opt-in check that the `nonce`
    tag commits to a target of at least `minDifficulty` (NIP-13's anti-spam
    guard against a note that merely got lucky at a low target).
  - Both checks compose onto an event schema like `zostr.signatureCheck()`, and
    fail closed on a non-integer/negative `minDifficulty`.

- **NIP-10 reply/thread tag support.** `zostr.nip10` now models NIP-10's
  threading conventions beyond the kind:1 event shape:
  - `zostr.nip10.eTag()` — schema for the marked `e` reply tag
    (`["e", id, relay, marker?, pubkey?]`, marker `"root"` / `"reply"` / `""`).
  - `zostr.nip10.qTag()` — schema for the `q` citation tag, a union of a
    regular-event branch (`["q", event-id, relay, pubkey?]`) and an
    event-address branch (`["q", "<kind>:<pubkey>:<d>", relay]`) that accepts
    only addressable (`30000..39999`) and normal replaceable (`0`, `3`,
    `10000..19999`, empty `<d>`) kinds.
  - `zostr.nip10.threadCheck()` — opt-in check enforcing the marked `e`-tag
    conventions (only `"root"`/`"reply"` markers; at most one of each; `"root"`
    before `"reply"`).
  - `zostr.nip10.participantsCheck(expected)` — opt-in check that the note's
    `p` tags include every expected participant pubkey.
- **NIP-21 `nostr:` URI support.** `zostr.nip21` wraps the supported NIP-19
  entities (`npub` / `note` / `nprofile` / `nevent` / `naddr`; `nsec` is
  excluded, along with the unmodeled `nrelay` and NIP-49 `ncryptsec`) in a
  `nostr:` URI, reusing NIP-19's validation and decoded shapes:
  - `zostr.nip21.uri(prefix?)` — validation-only string schema for a `nostr:`
    URI; with no `prefix` it accepts any supported entity, a `prefix` narrows it
    to one.
  - `zostr.nip21.npub()` / `note()` / `nprofile()` / `nevent()` / `naddr()` —
    per-entity codecs (`nostr:<entity>` ⇄ the NIP-19 decoded value).
  - `zostr.nip21.any()` — codec over all supported entities, decoding to a
    `{ type, data }` discriminated union.
  - The `nostr:` scheme is matched case-insensitively on decode/validate and
    always emitted lowercase on encode (RFC 3986 §3.1); whitespace, a query, a
    fragment, a trailing suffix, and a doubled scheme are rejected.

### Fixed

- **`zostr.nip42.challengeTagCheck` / `relayTagCheck` fail closed on a non-string
  expected value.** A non-string `challenge`/`relayUrl` (e.g. an `undefined`
  reaching the factory through untyped JavaScript, outside the `string` type
  contract) previously let an auth event carrying no matching tag compare
  `undefined !== undefined` and silently pass, disabling the check. The factory
  now throws at composition time, the same fail-closed guard `createdAtCheck`
  applies. Callers passing a real string (every type-checked use) are unaffected.

## [0.5.0] - 2026-07-29

This release reorganizes the public API around **canonical owner paths**. Every
schema, codec, check, and utility now has exactly one canonical owner — usually
its spec namespace (`zostr.nip19.npub`, `zostr.nip05.identifier`), a domain
namespace for a cross-spec catalog (`zostr.nip01.metadataFields.*`), or the root
for a cross-spec utility (`zostr.jsonCodec`). A small, curated set of Nostr-wide
concepts is re-exposed at the root as an **ergonomic alias** that is a _direct
reference_ to its canonical factory, so `zostr.event === zostr.nip01.event`.
Message direction is now carried by a `relayMessage`/`clientMessage` namespace
under each NIP instead of by collision-specific name suffixes.

### Added

- **`zostr.nip01`** is now the canonical home for every base Nostr concept:
  the field primitives (`pubkey`/`eventId`/`signature`/`timestamp`/`kind`/`tags`/
  `subscriptionId`), the event schemas (`eventTemplate`/`unsignedEvent`/`event`),
  `signatureCheck`, the REQ/COUNT `filter`, the relay/client message namespaces,
  and the kind:0 profile content (`metadata`/`metadataContent`/
  `metadataFields.*`). `metadataFields.nip05` is a direct reference to the
  canonical `nip05.identifier`.
- **`zostr.nip10`** is the canonical home for the kind:1 text note:
  `nip10.textNote()` (moved from `nip01.textNote`, see _Removed_) — NIP-10
  defines kind 1 as a plaintext note. Structure only, same as `event()`; it does
  not model NIP-10's reply/thread tag conventions.
- **`zostr.nip19`** is now the canonical home for the bech32 entities:
  `bech32`, `npub`, `nsec`, `note`, `nprofile`, `nevent`, `naddr`.
- **Root ergonomic aliases** (unchanged names, now direct references into the
  canonical namespaces, so identity holds — e.g. `zostr.event ===
  zostr.nip01.event`): `pubkey`, `eventId`, `signature`, `timestamp`, `kind`,
  `tags`, `eventTemplate`, `unsignedEvent`, `event`, `signatureCheck`,
  `subscriptionId`, `filter` (from `nip01`); `bech32`, `npub`, `nsec`, `note`,
  `nprofile`, `nevent`, `naddr` (from `nip19`). `zostr.jsonCodec` stays root-only
  (it is a cross-spec utility, not a NIP concept). No message namespace or
  kind-specific content (`metadata`, `textNote`, …) is aliased at the root.
- `zostr.nip42` — NIP-42 authentication (`AUTH`). `nip42.authEvent()` is the
  canonical ephemeral auth event fixed to `kind: 22242` (structure only, like
  `event()`); `nip42.relayMessage.auth()` is the relay-to-client `["AUTH",
  challenge]` and `nip42.clientMessage.auth()` is the client-to-relay `["AUTH",
  signedAuthEvent]` (answered by an `OK` message). The relay-side verification
  steps are opt-in checks composed onto `authEvent()`, the same way as
  `signatureCheck()`: `nip42.challengeTagCheck(challenge)` (the `"challenge"` tag
  matches), `nip42.relayTagCheck(relayUrl)` (the `"relay"` tag matches, exact
  string), and `nip42.createdAtCheck(now, toleranceSeconds?)` (`created_at`
  within `toleranceSeconds`, default 600, of `now`). The signature is verified
  with the existing `zostr.signatureCheck()`.
- `zostr.nip45` — NIP-45 event counts (`COUNT`). `nip45.clientMessage.count()` is
  the client-to-relay `["COUNT", queryId, filter, ...filter[]]` message, carrying
  the same NIP-01 `REQ`/`COUNT` filters (at least one required, matching REQ's
  grammar; count-everything sends a single empty `{}`);
  `nip45.relayMessage.count()` is the relay-to-client `["COUNT", queryId, count]`
  message; and `nip45.count()` is the response body object schema — `count`
  (non-negative integer), optional `approximate` (boolean), and optional `hll`
  (512-char hex, either case, the 256 HyperLogLog registers). The `queryId`
  reuses the NIP-01 subscription-id format. Structure only; a relay refusing a
  `COUNT` replies with the existing NIP-01 `CLOSED` message.
- `zostr.nip50` — NIP-50 search. `zostr.nip50.filter()` is `zostr.filter()`
  extended with an optional `search` string (a plain optional string, no
  `.min`/recovery policy baked in; empty strings are spec-valid, and the
  `key:value` search extensions live inside the string, not as extra fields). It
  inherits the base filter's fields and `"#<letter>"` tag-filter handling, so it
  tracks NIP-01 automatically. `zostr.nip50.clientMessage.req()` is the
  client-to-relay `["REQ", subscriptionId, searchFilter, ...searchFilter[]]`
  message — an intentional superset of `zostr.nip01.clientMessage.req()` (it also
  accepts plain NIP-01 filters) that keeps the at-least-one-filter requirement of
  NIP-01's `REQ` grammar. `zostr.nip01.clientMessage.req()`/`any()` stay
  NIP-01-only (they reject `search`), as does `zostr.nip45.clientMessage.count()`
  (NIP-50 adds `search` to `REQ`, not `COUNT`), so compose
  `z.union([zostr.nip01.clientMessage.any(), zostr.nip50.clientMessage.req()])`
  to accept a NIP-50 `REQ` alongside the other client messages.
- `zostr.nip67` — NIP-67 EOSE completeness hint. `nip67.relayMessage.eose()` is
  the relay-to-client `EOSE` message extended with an optional third element, an
  array of hint strings: `["EOSE", subscriptionId]` or `["EOSE", subscriptionId,
  hints]`. It's a union of the exact two- and three-element wire shapes (so an
  explicit `undefined` third element is rejected) and infers `["EOSE", string] |
  ["EOSE", string, string[]]`. The hints are plain strings — NIP-67 defines
  `"finish"` and `"more"` but requires clients to accept unknown values, so no
  enum is baked in; interpreting them is the consumer's job.
  `zostr.nip67.relayMessage.eose()` is a strict superset of
  `zostr.nip01.relayMessage.eose()`; `zostr.nip01.relayMessage.any()` stays
  NIP-01-only, so compose `z.union([zostr.nip01.relayMessage.any(),
  zostr.nip67.relayMessage.eose()])` to accept a NIP-67 `EOSE` alongside the
  other relay messages.

### Changed

- **Breaking:** `zostr.nip01.clientMessage.req()` (was
  `zostr.clientMessage.req()`, see _Removed_) requires **at least one** filter,
  matching NIP-01's `REQ` grammar (`["REQ", <subscription_id>, <filters1>,
  <filters2>...]`, where `<filters1>` is mandatory). A bare `["REQ", subId]` with
  no filters is now rejected; to subscribe to everything, send a single empty
  `{}` filter. This also tightens `zostr.nip01.clientMessage.any()`, which
  includes the `REQ` message.

  ```ts
  // before → after
  ["REQ", "sub"]  →  ["REQ", "sub", {}]
  ```

- **Breaking:** every NIP-01 event tag must now be a **non-empty** array of
  strings (its first element is the tag name). An empty tag `[]` is rejected;
  the outer `tags` array may still be empty. Applies to `event()`,
  `eventTemplate()`, `unsignedEvent()`, `textNote()`, and the messages that
  embed them.

  ```ts
  // before → after
  { tags: [[]] }  →  { tags: [["e", id]] }
  ```

- **Breaking:** a `filter()`'s `ids`, `authors`, `kinds`, and each `"#<letter>"`
  tag filter must be **non-empty** when present, matching NIP-01's grammar (an
  array field, when present, lists at least one value). A previously-accepted
  empty array `[]` is now rejected. The empty filter object `{}` (match anything)
  is still valid. Applies wherever the filter is reused
  (`nip01.clientMessage.req()`/`any()`, `nip45.clientMessage.count()`,
  `nip50.filter()`/`clientMessage.req()`).

  There is no drop-in replacement for an empty array, because it never had a
  defined meaning — migrate by intent: to place **no** constraint on that
  dimension, **omit the field** (this widens the match, so do it deliberately);
  to select **nothing**, there is no single-filter form — remove that filter from
  the `REQ`/`COUNT` (if it is one OR-branch among several) or don't send the
  request at all (if it is the only filter).

- **Breaking:** the event schemas (`event()`, `eventTemplate()`,
  `unsignedEvent()`, `textNote()`, `nip42.authEvent()`), the NIP-45 COUNT
  response body (`nip45.count()`), and the NIP-19 pointer schemas (the
  `nprofile`/`nevent`/`naddr` codecs' value side) now **reject** unknown keys
  instead of silently stripping them — they are fixed protocol shapes. For the
  NIP-19 pointers this also means `encode()` throws on an extra object key rather
  than dropping it, since the TLV encoding can only carry the known fields.
  Forward-compatible event metadata belongs in `tags`.
- **Breaking:** `nip11.relayInformationDocument()`'s `software` field is now
  validated as a **URL** (NIP-11 defines it as "URL to the relay's software
  homepage"), instead of accepting any string. `contact` stays a plain string
  (it may be a bare email address).
- **Breaking (type-only):** the object schemas that preserve unknown keys now
  carry a `[key: string]: unknown` index signature in their inferred output type,
  reflecting that unknown keys are kept rather than stripped:
  `nip05.nostrJsonDocument()`, `nip11.relayInformationDocument()` (and its nested
  `limitation`/`fees` objects), and `nip01.metadataFields.birthday()`.
  (`nip01.metadata()` already carried this.) No runtime change for these — they
  already preserved unknown keys.
- **Breaking (type-only):** object schemas that reject unknown keys now infer a
  **strict** output type (no index signature), including when embedded in a
  message tuple/union. Previously an embedded event/count element (e.g.
  `nip01.relayMessage.event()[2]`, `nip45.relayMessage.count()[2]`, the NIP-19
  pointer codecs' decoded value) inferred an open `Record<string, unknown>`, so
  unknown-key access type-checked even though it was rejected at runtime; the
  inferred type now matches the runtime contract.

### Removed

- **Breaking:** the root `zostr.relayMessage.*` and `zostr.clientMessage.*`
  namespaces are removed. NIP-01 relay/client messages now live at
  `zostr.nip01.relayMessage.*` and `zostr.nip01.clientMessage.*`. The unqualified
  root names implied an aggregate of every supported NIP but only ever meant
  NIP-01; the NIP-01-scoped path makes that explicit and leaves room for other
  NIPs' messages (NIP-42/45/50/67) under their own namespaces. The curated root
  aliases (`event`, `filter`, `npub`, …) are unaffected — they remain as direct
  references into the canonical namespaces.

  ```ts
  // before → after
  zostr.relayMessage.ok()    →  zostr.nip01.relayMessage.ok()
  zostr.clientMessage.req()  →  zostr.nip01.clientMessage.req()
  ```

- **Breaking:** `zostr.nip01.textNote()` is removed; the kind:1 text note now
  lives at `zostr.nip10.textNote()` (its canonical owner — NIP-10 defines kind 1
  as a plaintext note), see _Added_. Behavior is unchanged.

  ```ts
  // before → after
  zostr.nip01.textNote()  →  zostr.nip10.textNote()
  ```


## [0.4.0] - 2026-07-29

### Changed

- **Breaking:** `zostr.filter()`'s `limit` now enforces a non-negative integer,
  matching NIP-01's `<maximum number of events ...>` (an event count). It
  previously accepted any number; non-integers, negatives, and non-finite values
  (`NaN`/`Infinity`, which `JSON.stringify` would emit as `null`) are now
  rejected. `0` is still accepted and no upper bound is imposed (relay-side
  `max_limit`/`default_limit` are NIP-11 policy, not part of this shape). This
  also tightens `limit` wherever the filter is reused
  (`clientMessage.req()`/`clientMessage.any()`).
- **Breaking:** `zostr.nip11.relayInformationDocument()` now validates its
  numeric fields to their spec-defined form instead of accepting any number.
  Negative and non-finite values are rejected, as are fractions on the integer
  fields:
  - Count/length fields — `limitation.max_message_length`, `max_subscriptions`,
    `max_subid_length`, `max_limit`, `max_event_tags`, `max_content_length`,
    `min_pow_difficulty`, `default_limit`, `fees.*[].period`, and
    `supported_nips[]` — are now **non-negative integers** (`0` allowed, no upper
    bound).
  - `limitation.created_at_lower_limit`/`created_at_upper_limit` are now
    **non-negative integers** too: they are relative offsets in seconds (how far
    in the past/future an event's `created_at` may be), not absolute timestamps —
    the spec's example values (`94608000` ≈ 3y, `300` = 5min) only make sense as
    durations.
  - `fees.*[].amount` is now a **non-negative finite number** (not required to be
    an integer, since `unit` is free-form and may be sub-unit).
  - `fees.*[].kinds[]` are now NIP-01 event kinds (via `kind()`, `0..65535`).
- **Breaking:** `zostr.nevent()`/`zostr.naddr()` now validate the pointer `kind`
  as a **32-bit unsigned integer** (`0..4294967295`), matching NIP-19's
  big-endian `uint32` encoding. It previously accepted any number; non-integers,
  negatives, and values above `2^32 - 1` are now rejected. The range is **not**
  narrowed to NIP-01's `0..65535`, since NIP-19 does not — compose `kind()`
  yourself for event-kind validation.

## [0.3.0] - 2026-07-28

### Added

- `zostr.nip01.metadataContent()`: codec between a kind:0 `content` string and
  the `metadata()` profile object (same decode/encode behavior as
  `zostr.jsonCodec(zostr.nip01.metadata())`).
- `ProfileMetadata` type export (the output type of `zostr.nip01.metadata()`):
  optional known fields plus an `unknown`-typed catchall for extra keys.
- Generic JSON codec: `zostr.jsonCodec(schema)`. Decodes a JSON string through
  the given schema (`JSON.parse` + schema; invalid JSON or a schema mismatch is
  a Zod issue, not a raw throw). Encodes a value back to a JSON string when the
  schema is backward-encodable (schema + `JSON.stringify`; a one-way
  `.transform()` throws per zod's codec rules, while `JSON.stringify`'s own raw
  errors and a top-level `undefined` become Zod issues). Additive; decode
  composes with any output schema.

### Changed

- **Breaking:** `zostr.nip01.metadata()` now returns an **object schema** for a
  parsed kind:0 profile, not a codec. The string ⇄ object codec moved to the
  new `zostr.nip01.metadataContent()`:

  ```ts
  // before
  zostr.nip01.metadata().decode(content);
  zostr.nip01.metadata().encode(profile);
  // after
  zostr.nip01.metadataContent().decode(content);
  zostr.nip01.metadataContent().encode(profile);
  // new — metadata() is the object schema:
  zostr.nip01.metadata().parse(profileObject);
  ```

  The object's shape also changed: every known field is now **optional** (was
  all-required) and covers NIP-01/NIP-24/NIP-05/LUD fields
  (`name`/`about`/`picture`/`display_name`/`website`/`banner`/`bot`/`birthday`/`nip05`/`lud16`/`lud06`),
  each validated strictly when present (e.g. `picture` as a URL) with no
  baked-in fallback, and **unknown keys are preserved** (was stripped) so a
  `metadataContent()` round-trip doesn't drop forward-compatible fields.
- **Breaking:** `zostr.kind()` now enforces NIP-01's `<integer between 0 and
  65535>` constraint. It previously accepted any number (non-integers, negatives,
  and values above 65535); those are now rejected. This also tightens `kind`
  wherever it is reused (`event()`, `eventTemplate()`, `unsignedEvent()`,
  `filter().kinds`).
- **Breaking:** `zostr.timestamp()` now requires an integer, matching NIP-01's
  `<unix timestamp in seconds>` (and the `integer` filter `since`/`until`
  compared against `created_at`) and POSIX "Seconds Since the Epoch". It
  previously accepted any number; non-integers are now rejected. No range bound
  is imposed and negative (pre-Epoch) values are still accepted. This also
  tightens the field wherever it is reused (`event()`, `eventTemplate()`,
  `unsignedEvent()`, `filter().since`, `filter().until`).
- **Breaking:** NIP-05 local-part validation is now lowercase-only, matching
  the spec's "the `<local-part>` part MUST only use characters `a-z0-9-_.`".
  It previously accepted uppercase (e.g. `Bob@example.com`); those are now
  rejected. This also tightens `.well-known/nostr.json` `names` key validation
  (`zostr.nip05.nostrJsonDocument()`), which shares the same rule.

## [0.2.1] - 2026-07-28

### Added

- Field-level schemas for kind:0 profile metadata:
  `zostr.nip01.metadataFields.*`. Each factory is a strict, non-optional
  schema for one metadata field, grouped by NIP/LUD origin — `name`, `about`,
  `picture` (NIP-01); `displayName`, `website`, `banner`, `bot`, `birthday`
  (NIP-24); `nip05` (NIP-05); `lud16` (LUD-16); `lud06` (LUD-06). They let you
  compose your own profile schema (relax it for messy data, reuse a subset, or
  apply per-field fallbacks) instead of the all-or-nothing `nip01.metadata()`
  codec, and are deliberately strict so you can layer your own
  `optional`/`catch`/`default` on top. Additive and fully backward compatible:
  the existing `nip01.metadata()` codec is unchanged.
- `@scure/base` (`^2.0.0`) as a direct dependency, used by
  `metadataFields.lud06()` to validate LNURL bech32 strings.

## [0.2.0] - 2026-07-16

### Added

- NIP-05 `.well-known/nostr.json` document schema:
  `zostr.nip05.nostrJsonDocument()`. Validates `names` (required —
  local-part to lowercase 64-char hex pubkey) and `relays` (optional —
  pubkey to an array of relay URLs), per the NIP-05 well-known document
  format.

### Changed

- **Breaking:** `zostr.nip05` is now a namespace, matching how
  `zostr.nip11.relayInformationDocument()` is namespaced under `nip11`:
  - `zostr.nip05()` → `zostr.nip05.identifier()`
  - `zostr.formatNip05Identifier()` → `zostr.nip05.formatIdentifier()`

### Fixed

- **Breaking (type-only):** `zostr.tags()`, `zostr.filter()`, and all
  `zostr.relayMessage.*`/`zostr.clientMessage.*` schemas now infer their
  precise structural output type from `.parse()` (e.g.
  `zostr.filter().parse(f).ids` is `string[] | undefined`, not `unknown`;
  `zostr.relayMessage.ok().parse(m)[3]` is `string`, not `unknown`).
  Previously `classic.ts`/`mini.ts` re-wrapped these through a generic
  helper that inferred its type parameter from a bare schema-class
  reference rather than the actual schema, so the output type fell back to
  each class's loose default. Runtime validation behavior is unchanged.
- **Breaking (type-only):** `zostr.nip11.relayInformationDocument()` and
  `zostr.nip05.nostrJsonDocument()` now infer their precise field types
  from `.parse()` (e.g. `.parse(doc).name` is `string | undefined`, not
  `unknown`), for the same reason as above. Runtime validation behavior is
  unchanged.

## [0.1.2] - 2026-07-15

### Added

- NIP-01 `REQ`/`COUNT` filter object: `zostr.filter()`.
- NIP-01 subscription id: `zostr.subscriptionId()` (non-empty string, max 64
  chars).
- NIP-01 relay-to-client message schemas: `zostr.relayMessage.event()`,
  `.ok()`, `.eose()`, `.closed()`, `.notice()`, and the combined union
  `.any()`.
- NIP-01 client-to-relay message schemas: `zostr.clientMessage.event()`,
  `.req()`, `.close()`, and the combined union `.any()`.
- Opt-in checks for NIP-01's `OK`/`CLOSED` `"<prefix>: <message>"` message
  convention: `zostr.relayMessage.okMessagePrefixCheck()` and
  `.closedMessagePrefixCheck()`. Compose with `.check()`, same as
  `signatureCheck()`.
- NIP-11 relay information document schema: `zostr.nip11.relayInformationDocument()`.
  `banner`/`icon`/`terms_of_service`/`payments_url` are validated as URLs by
  default; `pubkey`/`self` as 64-char hex.

## [0.1.1] - 2026-07-15

### Changed

- `.github/workflows/publish.yml` now authenticates to npm via
  [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC)
  instead of the `NPM_TOKEN` repository secret, which has been removed.
  `npm publish` no longer needs `NODE_AUTH_TOKEN`; provenance is generated
  automatically as part of trusted publishing, so the explicit `--provenance`
  flag was dropped (`--access public` is kept).
- Enable dependabot for updating npm packages and GitHub Actions.

### Fixed

- `zostr.pubkey()`, `eventId()`, `signature()`, `timestamp()`, `kind()`,
  `tags()`, `nip05()`, and `bech32()` now return schemas re-wrapped through
  each flavor's own constructor, matching how event schemas and codecs were
  already re-wrapped. Previously these returned an unwrapped
  `core.$ZodType` with none of classic zod's instance methods — not even
  `.parse()`, let alone `.optional()`/`.catch()`/`.safeParse()` — contrary to
  what `docs/API.md` documented. Embedding them directly in a
  `z.object({...})` shape (as shown in `README.md`) still works as before.

## [0.1.0] - 2026-07-15

### Added

- Shared validation core (`src/core/`) built directly against `zod/v4/core`
  (checks, codecs, and schema primitives), with no dependency on `zod` or
  `zod/mini` themselves.
- `zod-nostr` entry point (classic zod): `zostr.pubkey()`, `eventId()`,
  `signature()`, `timestamp()`, `kind()`, `tags()`, `eventTemplate()`,
  `unsignedEvent()`, `event()`, `signatureCheck()`, `nip05()`,
  `formatNip05Identifier()`, `bech32()`, `npub()`, `nsec()`, `note()`,
  `nprofile()`, `nevent()`, `naddr()`, `nip01.metadata()`, `nip01.textNote()`.
- `zod-nostr/mini` entry point (zod/mini) exposing the same `zostr` API,
  built from the same shared core so both flavors validate identically.
- NIP-01 event structure validation, with signature verification available
  as an explicit, composable check (`zostr.event().check(zostr.signatureCheck())`)
  rather than baked into the schema.
- NIP-05 identifier validation.
- NIP-19 bech32 support: lightweight prefix-only validation (`bech32()`) and
  full decode/encode codecs for `npub`, `nsec`, `note`, `nprofile`, `nevent`,
  and `naddr`.
- `README.md`, `docs/API.md`, and this changelog.
- [Biome](https://biomejs.dev) for linting and formatting (`npm run check`,
  `npm run check:write`).
- GitHub Actions CI (`.github/workflows/ci.yml`) running typecheck, lint/format
  check, tests, and build on every push and pull request to `main`.
- GitHub Actions publish workflow (`.github/workflows/publish.yml`), triggered
  by GitHub Releases, that verifies the release tag matches `package.json`'s
  version, runs the full check suite, and publishes to npm with provenance
  using an `NPM_TOKEN` repository secret (trusted publishing isn't set up
  yet). A matching `prepublishOnly` script provides the same safety net for
  local `npm publish`.
- `src/api-surface.test.ts`: asserts the exact set of public keys on `zostr`
  (and `zostr.nip01`) for both entry points, and that classic/mini expose
  identical key sets. Regression coverage for schemas/functions that exist
  internally but are never wired into the public `zostr` object.
- `src/classic.test.ts` / `src/mini.test.ts`: assert every event schema and
  codec exposes its flavor's native `.check()`, and (classic only) every
  codec exposes native `.decode()`/`.encode()`. Regression coverage for
  `zostr` members that accidentally return an unwrapped `core.$ZodType`/
  `core.$ZodCodec` instead of being re-wrapped through the flavor's own
  constructor.

### Fixed

- `zostr.nip05()` / `formatNip05Identifier()` are now exposed from both entry
  points (previously only used internally by `nip01.metadata()`).
- `zostr.npub()`, `nsec()`, `note()`, `nprofile()`, `nevent()`, `naddr()`, and
  `nip01.metadata()` now return codecs re-wrapped through each flavor's own
  `codec()`. In classic zod this unlocks `.decode()`/`.encode()`/`.check()`
  instance methods; in zod/mini it unlocks `.check()` (zod/mini never attaches
  `.decode()`/`.encode()` as instance methods on any schema — use the
  top-level `z.decode()`/`z.encode()` there instead).
- `.github/workflows/publish.yml`: `npm publish` now passes `--access public`
  explicitly. npm requires this when generating provenance for a package that
  has never been published before, even when the package is unscoped (and
  thus defaults to public access already) — the first release attempt failed
  at the publish step with `Can't generate provenance for new or private
  package, you must set access to public` before anything was written to the
  registry.
- Added a `workflow_dispatch` trigger to `publish.yml` so a failed publish
  can be retried by re-running the workflow against the existing tag, without
  having to delete and recreate the GitHub Release.

[Unreleased]: https://github.com/akiomik/zod-nostr/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/akiomik/zod-nostr/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/akiomik/zod-nostr/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/akiomik/zod-nostr/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/akiomik/zod-nostr/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/akiomik/zod-nostr/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/akiomik/zod-nostr/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/akiomik/zod-nostr/releases/tag/v0.2.0
[0.1.2]: https://github.com/akiomik/zod-nostr/releases/tag/v0.1.2
[0.1.1]: https://github.com/akiomik/zod-nostr/releases/tag/v0.1.1
[0.1.0]: https://github.com/akiomik/zod-nostr/releases/tag/v0.1.0
