import * as z from "zod/mini";
import type * as core from "zod/v4/core";
import * as json from "./json.js";
import * as nip01 from "./nip01.js";

export type { ProfileMetadata } from "./nip01.js";

import * as nip05 from "./nip05.js";
import * as nip10 from "./nip10.js";
import * as nip11 from "./nip11.js";
import * as nip13 from "./nip13.js";
import * as nip19 from "./nip19.js";
import * as nip21 from "./nip21.js";
import * as nip40 from "./nip40.js";
import * as nip42 from "./nip42.js";
import * as nip45 from "./nip45.js";
import * as nip50 from "./nip50.js";
import * as nip67 from "./nip67.js";
import * as nip70 from "./nip70.js";

/**
 * Re-wraps a core.$ZodCodec (shared, flavor-agnostic) through mini's own
 * z.codec() so the result has mini's native .decode()/.encode() methods,
 * the same way event schemas are re-wrapped to unlock .check().
 */
function miniCodec<A extends core.SomeType, B extends core.SomeType>(
  coreCodec: core.$ZodCodec<A, B>,
): z.ZodMiniCodec<A, B> {
  const def = coreCodec._zod.def;
  return z.codec(def.in, def.out, {
    decode: def.transform,
    encode: def.reverseTransform,
  });
}

/**
 * Re-wraps a flavor-agnostic core schema (field-level primitives from
 * nip01.ts/nip05.ts/nip19.ts) through mini's own constructor, the same way
 * miniCodec() re-wraps codecs, so the result has mini's instance methods
 * (.check()/...) instead of being unusable outside a z.object({...}) shape
 * or the top-level z.* functions.
 */
function miniSchema<T extends core.SomeType>(
  Ctor: core.$constructor<T>,
  coreSchema: core.SomeType,
): T {
  // `new` via $constructor doesn't preserve the def's type arguments, so
  // assert the result against Ctor's own T explicitly (same treatment as
  // makeCodec()).
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new Ctor(coreSchema._zod.def as any);
}

/**
 * Re-wraps a core object schema that rejects unknown keys (its core `catchall`
 * is `never`) through mini's z.strictObject(), so the result has mini's instance
 * methods and an accurate strict output type (no index signature). The core
 * `never` catchall stays the documented source of truth — classic re-wraps the
 * same way and a runtime test asserts both flavors reject unknown keys.
 */
function miniStrictObject<Shape extends core.$ZodShape>(
  coreObject: core.$ZodObject<Shape>,
) {
  return z.strictObject(coreObject._zod.def.shape);
}

/**
 * Re-wraps a core object schema that preserves unknown keys (its core `catchall`
 * is `unknown`) through mini's z.object(), carrying over the core `unknown`
 * catchall so the output type keeps its `[key: string]: unknown` index
 * signature. Preserve, never silent strip.
 */
function miniOpenObject<Shape extends core.$ZodShape>(
  coreObject: core.$ZodObject<Shape>,
) {
  return z.catchall(
    z.object(coreObject._zod.def.shape),
    coreObject._zod.def.catchall as core.SomeType,
  );
}

// NIP-05 identifiers. Defined ahead of nip01 so the kind:0 profile's `nip05`
// field can be a direct reference to the canonical `nip05.identifier`.
const nip05Namespace = {
  /**
   * A NIP-05 identifier string (`<local-part>@<domain>`): exactly one `@` not
   * at position 0, a case-insensitive `[a-z0-9._-]+` local part, and a
   * syntactically valid host with no path, query, or fragment.
   */
  identifier: () => miniSchema(z.ZodMiniString, nip05.nip05.identifier()),

  /**
   * The `.well-known/nostr.json` document: a required `names` map (local part
   * to lowercase hex pubkey) and the optional `relays` map. Unknown top-level
   * keys are preserved rather than stripped, since the served document is
   * forward-compatible.
   */
  nostrJsonDocument: () => miniOpenObject(nip05.nip05.nostrJsonDocument()),

  /**
   * A plain utility (not a schema) for display: strips a leading `_@`
   * root-identifier prefix, per NIP-05.
   */
  formatIdentifier: nip05.nip05.formatIdentifier,
};

const nip01Namespace = {
  // Field-level primitives (can be embedded directly in a z.object({...}) shape)

  /** A 64-character lowercase hex string schema for a public key. */
  pubkey: () => miniSchema(z.ZodMiniString, nip01.pubkey()),

  /** A 64-character lowercase hex string schema for an event id. */
  eventId: () => miniSchema(z.ZodMiniString, nip01.eventId()),

  /** A 128-character lowercase hex string schema for a Schnorr signature. */
  signature: () => miniSchema(z.ZodMiniString, nip01.signature()),

  /**
   * An integer schema for `created_at` (unix seconds), also used by the
   * filter's `since`/`until`. No range bound and no coercion, so negative,
   * pre-Epoch values are accepted.
   */
  timestamp: () => miniSchema(z.ZodMiniNumber, nip01.timestamp()),

  /**
   * An integer schema for `kind`, constrained to NIP-01's `0`–`65535`. No
   * coercion.
   */
  kind: () => miniSchema(z.ZodMiniNumber, nip01.kind()),

  /**
   * A `string[][]` schema for an event's `tags`. Every tag must be a non-empty
   * array of strings (its first element is the tag name), while the outer
   * array may be empty.
   */
  tags: () => z.array(nip01.tags()._zod.def.element),

  // Event schemas. Re-wrapped through mini's z.object() so .check() is available.

  /**
   * An unsigned, un-authored event: `kind`, `created_at`, `tags`, `content`.
   * Unknown keys are rejected, never silently stripped.
   */
  eventTemplate: () => miniStrictObject(nip01.eventTemplate()),

  /**
   * `eventTemplate()` plus `pubkey`. Unknown keys are rejected, never silently
   * stripped.
   */
  unsignedEvent: () => miniStrictObject(nip01.unsignedEvent()),

  /**
   * The full NIP-01 event: `id`, `pubkey`, `created_at`, `kind`, `tags`,
   * `content`, `sig`. Validates structure only — compose `signatureCheck()` to
   * verify the signature. Unknown keys are rejected, so forward-compatible
   * metadata belongs in `tags`.
   */
  event: () => miniStrictObject(nip01.event()),

  /**
   * A check (not a schema) that verifies an event's signature with
   * nostr-tools' `verifyEvent`. Compose it onto an event-shaped object schema;
   * signature, proof-of-work, expiration, and auth checks all compose the same
   * way.
   */
  signatureCheck: nip01.signatureCheck,

  // REQ/COUNT filter object

  /**
   * A string schema for a subscription id: non-empty, at most 64 characters.
   */
  subscriptionId: () => miniSchema(z.ZodMiniString, nip01.subscriptionId()),

  /**
   * The NIP-01 REQ/COUNT filter: `ids`, `authors`, `kinds`, `since`, `until`,
   * `limit`, plus any number of `#<a-zA-Z>` tag-value filters. Unknown keys
   * outside that set are rejected, and an array field, when present, must be
   * non-empty — omit it instead to place no constraint on that dimension.
   */
  filter: () =>
    z
      .catchall(
        z.object(nip01.filter()._zod.def.shape),
        // nip01.filter() always sets catchall (to an array-of-strings schema
        // for "#<letter>" tag filters); zod core's own $ZodObjectDef types
        // `catchall` as `$ZodType | undefined` regardless, so this is never
        // actually undefined at runtime.
        nip01.filter()._zod.def.catchall as core.SomeType,
      )
      .check(nip01.filterTagKeysCheck()),

  /**
   * Tuple schemas for NIP-01 relay-to-client messages. Each validates
   * structure only — `event()` does not verify the embedded event's signature.
   */
  relayMessage: {
    /** `["EVENT", subscriptionId, event]`. */
    event: () => z.tuple(nip01.relayMessage.event()._zod.def.items),

    /**
     * `["OK", eventId, boolean, message]`. `message` is a plain string by
     * default; NIP-01's `<prefix>: <text>` convention is opt-in via
     * `okMessagePrefixCheck()`.
     */
    ok: () => z.tuple(nip01.relayMessage.ok()._zod.def.items),

    /** `["EOSE", subscriptionId]`. */
    eose: () => z.tuple(nip01.relayMessage.eose()._zod.def.items),

    /**
     * `["CLOSED", subscriptionId, message]`. `message` is a plain string by
     * default; NIP-01's `<prefix>: <text>` convention is opt-in via
     * `closedMessagePrefixCheck()`.
     */
    closed: () => z.tuple(nip01.relayMessage.closed()._zod.def.items),

    /** `["NOTICE", message]`. */
    notice: () => z.tuple(nip01.relayMessage.notice()._zod.def.items),

    /** A union of the five NIP-01 relay-to-client messages. */
    any: () => z.union(nip01.relayMessage.any()._zod.def.options),

    /**
     * An opt-in check that an `OK` message follows NIP-01's
     * `"<prefix>: <message>"` shape. It is only required when the event was
     * rejected — NIP-01 allows an empty message on acceptance — and the prefix
     * is not restricted to the standardized list, since relays use others.
     */
    okMessagePrefixCheck: nip01.relayMessage.okMessagePrefixCheck,

    /**
     * An opt-in check that a `CLOSED` message follows NIP-01's
     * `"<prefix>: <message>"` shape. The prefix is not restricted to the
     * standardized list, since relays use others.
     */
    closedMessagePrefixCheck: nip01.relayMessage.closedMessagePrefixCheck,
  },

  /** Tuple schemas for NIP-01 client-to-relay messages. */
  clientMessage: {
    /** `["EVENT", event]`. */
    event: () => z.tuple(nip01.clientMessage.event()._zod.def.items),

    /**
     * `["REQ", subscriptionId, filter, ...filter[]]`. At least one filter is
     * required — send a single empty `{}` filter to subscribe to everything.
     */
    req: () =>
      z.tuple(
        nip01.clientMessage.req()._zod.def.items,
        nip01.clientMessage.req()._zod.def.rest,
      ),

    /** `["CLOSE", subscriptionId]`. */
    close: () => z.tuple(nip01.clientMessage.close()._zod.def.items),

    /** A union of the three NIP-01 client-to-relay messages. */
    any: () => z.union(nip01.clientMessage.any()._zod.def.options),
  },

  /**
   * An object schema for a parsed kind:0 profile. Every known field is
   * optional and validated strictly when present; unknown keys are preserved
   * as `unknown`, never stripped. No recovery policy is baked in, so a
   * present-but-invalid field fails — layer your own on top. For the JSON
   * `content` string, use `metadataContent()`.
   */
  metadata: () => miniOpenObject(nip01.nip01.metadata()),

  /**
   * A codec between a kind:0 `content` string (JSON) and the `metadata()`
   * profile object. Because `metadata()` preserves unknown keys, a
   * decode-then-encode round-trip keeps non-standard fields rather than
   * dropping them.
   */
  metadataContent: () => miniCodec(nip01.nip01.metadataContent()),

  /**
   * The canonical catalog of field-level schemas for kind:0 profile metadata.
   * Each is strict and non-optional on purpose, so you can add
   * `optional`/`catch`/`default` yourself — a pre-weakened field can't be
   * recovered. The value formats come from several specs (NIP-01/NIP-24/LUD);
   * that provenance is an attribute, not a path.
   */
  metadataFields: {
    /** The kind:0 `name` field (NIP-01): a plain string. */
    name: () => miniSchema(z.ZodMiniString, nip01.metadataFields.name()),

    /** The kind:0 `about` field (NIP-01): a plain string. */
    about: () => miniSchema(z.ZodMiniString, nip01.metadataFields.about()),

    /** The kind:0 `picture` field (NIP-01): a URL. */
    picture: () => miniSchema(z.ZodMiniURL, nip01.metadataFields.picture()),

    /** The kind:0 `display_name` field (NIP-24): a plain string. */
    displayName: () =>
      miniSchema(z.ZodMiniString, nip01.metadataFields.displayName()),

    /** The kind:0 `website` field (NIP-24): a URL. */
    website: () => miniSchema(z.ZodMiniURL, nip01.metadataFields.website()),

    /** The kind:0 `banner` field (NIP-24): a URL. */
    banner: () => miniSchema(z.ZodMiniURL, nip01.metadataFields.banner()),

    /** The kind:0 `bot` field (NIP-24): a boolean. */
    bot: () => miniSchema(z.ZodMiniBoolean, nip01.metadataFields.bot()),

    /**
     * The kind:0 `birthday` field (NIP-24): `{ year?, month?, day? }` numbers.
     */
    birthday: () => miniOpenObject(nip01.metadataFields.birthday()),

    /**
     * The kind:0 `nip05` field: a direct reference to `zostr.nip05.identifier`
     * — the profile field and the general schema are the same factory, not two
     * copies.
     */
    nip05: nip05Namespace.identifier,

    /**
     * The kind:0 `lud16` field (LUD-16): a `<username>[+<tag>]@<domain>`
     * lightning address.
     */
    lud16: () => miniSchema(z.ZodMiniString, nip01.metadataFields.lud16()),

    /**
     * The kind:0 `lud06` field (LUD-06): a bech32 `lnurl` string. It validates
     * the checksum and HRP only; it does not decode to a LUD-01 URL.
     */
    lud06: () => miniSchema(z.ZodMiniString, nip01.metadataFields.lud06()),
  },
};

const nip19Namespace = {
  /**
   * A lightweight format check: validates that a string decodes to a bech32
   * entity with the given prefix, without exposing the decoded value.
   */
  bech32: (prefix: nip19.Bech32Prefix) =>
    miniSchema(z.ZodMiniString, nip19.bech32Schema(prefix)),

  /** A codec between an `npub` string and a hex pubkey. */
  npub: () => miniCodec(nip19.npubCodec),

  /**
   * A codec between an `nsec` string and a 32-byte `Uint8Array` secret key.
   * The `Uint8Array` (rather than hex, as `npub`/`note` decode to) matches how
   * nostr-tools represents secret keys elsewhere.
   */
  nsec: () => miniCodec(nip19.nsecCodec),

  /** A codec between a `note` string and a hex event id. */
  note: () => miniCodec(nip19.noteCodec),

  /**
   * A codec between an `nprofile` string and `{ pubkey, relays? }`. A pointer
   * is a fixed TLV shape, so unknown keys are rejected: encode throws on an
   * extra key rather than dropping it.
   */
  nprofile: () => miniCodec(nip19.nprofileCodec),

  /**
   * A codec between an `nevent` string and `{ id, relays?, author?, kind? }`.
   * `kind` is a 32-bit unsigned integer, matching NIP-19's uint32 encoding
   * rather than NIP-01's `0`–`65535` event-kind range. Unknown keys are
   * rejected.
   */
  nevent: () => miniCodec(nip19.neventCodec),

  /**
   * A codec between an `naddr` string and
   * `{ identifier, pubkey, kind, relays? }`. `kind` is a 32-bit unsigned
   * integer, matching NIP-19's uint32 encoding rather than NIP-01's
   * `0`–`65535` event-kind range. Unknown keys are rejected.
   */
  naddr: () => miniCodec(nip19.naddrCodec),
};

const nip21Namespace = {
  /**
   * A validation-only string schema: checks that a string is a supported
   * `nostr:` URI and returns it unchanged, without decoding. With no prefix it
   * accepts any supported entity; passing one narrows it to that entity.
   */
  uri: (prefix?: nip21.Nip21Prefix) =>
    miniSchema(z.ZodMiniString, nip21.uriSchema(prefix)),

  /** A codec between a `nostr:npub…` URI and a hex pubkey. */
  npub: () => miniCodec(nip21.npubUriCodec),

  /** A codec between a `nostr:note…` URI and a hex event id. */
  note: () => miniCodec(nip21.noteUriCodec),

  /** A codec between a `nostr:nprofile…` URI and `{ pubkey, relays? }`. */
  nprofile: () => miniCodec(nip21.nprofileUriCodec),

  /**
   * A codec between a `nostr:nevent…` URI and
   * `{ id, relays?, author?, kind? }`.
   */
  nevent: () => miniCodec(nip21.neventUriCodec),

  /**
   * A codec between a `nostr:naddr…` URI and
   * `{ identifier, pubkey, kind, relays? }`.
   */
  naddr: () => miniCodec(nip21.naddrUriCodec),

  /**
   * A codec over all supported entities. Decode produces a `{ type, data }`
   * discriminated union; encode uses that tag to pick the entity, so an `npub`
   * and a `note` — both carrying a string payload — are never ambiguous.
   */
  any: () => miniCodec(nip21.anyUriCodec),
};

/**
 * Spec-faithful Zod schemas, codecs, and checks for Nostr — strict by default,
 * loosened deliberately.
 *
 * Every API has one canonical owner path, usually its spec namespace
 * (`zostr.nip01.*`, `zostr.nip19.*`, …). A curated set of Nostr-wide concepts
 * is also re-exposed at the root as a direct reference to the same factory, so
 * `zostr.event === zostr.nip01.event`.
 *
 * The full reference is in docs/API.md; the rules this surface follows are in
 * docs/design.md.
 */
export const zostr = {
  /**
   * A codec between a JSON string and the given schema's value — the generic
   * transport for any JSON-encoded content. Decode accepts any schema and
   * reports invalid JSON as a Zod issue rather than throwing a raw
   * `SyntaxError`. Encode requires a schema that can be encoded backward: a
   * one-way `.transform()` throws `$ZodEncodeError` even under a safe-encode
   * call, because zod raises it before the codec can turn it into an issue.
   */
  jsonCodec: <T extends core.SomeType>(schema: T) =>
    miniCodec(json.jsonCodec(schema)),

  /**
   * NIP-01: primitives, event schemas, the REQ/COUNT filter, relay/client
   * messages, and kind:0 profile content — the canonical home for every base
   * Nostr concept. The root aliases below are direct references into this
   * namespace, never separate wrappers.
   */
  nip01: nip01Namespace,

  /**
   * NIP-19 bech32-encoded entities. These are globally unique concepts, so the
   * entity names are also exposed as root aliases.
   */
  nip19: nip19Namespace,

  /**
   * NIP-21 `nostr:` URIs — a scheme layer over the supported NIP-19 entities
   * (`nsec` is excluded, and secret-bearing prefixes are rejected before the
   * payload is decoded). The scheme is matched case-insensitively on decode,
   * while encode always emits the lowercase canonical `nostr:`. There are no
   * root aliases, keeping the URI form distinct from the bare entity.
   */
  nip21: nip21Namespace,

  /**
   * NIP-05: DNS-based identifiers and the `.well-known/nostr.json` document a
   * domain serves for them.
   */
  nip05: nip05Namespace,

  /**
   * NIP-10 text notes and threads: the kind:1 note, its reply and citation
   * tags, and opt-in checks for the reply/thread conventions.
   */
  nip10: {
    /**
     * The kind:1 text note — the same shape as `event()` with `kind` fixed to
     * `1`. Structural form only: it verifies neither the signature nor
     * NIP-10's reply/thread tag conventions, both of which are opt-in checks.
     * Unknown keys are rejected.
     */
    textNote: () => miniStrictObject(nip10.nip10.textNote()),

    /**
     * The marked `e` tag:
     * `["e", <event-id>, <relay-url>, <marker>?, <pubkey>?]`. The fields are
     * positional, so the relay-url position is required (`""` is allowed) and
     * `""` doubles as the "no marker" placeholder that lets a pubkey be
     * attached to an unmarked reference. A three-element `["e", id, relay]` is
     * accepted — it is indistinguishable from a deprecated positional tag.
     */
    eTag: () => z.tuple(nip10.nip10.eTag()._zod.def.items),

    /**
     * The citation `q` tag, a union of two exact shapes: a regular event by
     * hex id (`["q", <event-id>, <relay-url>, <pubkey>?]`) or an event by its
     * NIP-01 address (`["q", <kind>:<pubkey>:<d>, <relay-url>]`, with no
     * trailing pubkey — the coordinate already names the author). Only kinds
     * referenceable by address are accepted.
     */
    qTag: () => z.union(nip10.nip10.qTag()._zod.def.options),

    /**
     * An opt-in check that the marked `e` tags follow NIP-10's reply/thread
     * conventions: every marker is `"root"` or `"reply"` (the legacy
     * `"mention"` is rejected), the note carries at most one of each, and the
     * `"root"` tag comes before the `"reply"` tag. Unmarked positional tags
     * are left untouched.
     */
    threadCheck: nip10.nip10.threadCheck,

    /**
     * An opt-in check that the note's `p` tags include every expected
     * participant pubkey. NIP-10 asks a reply to carry the parent's
     * participants plus the replied-to authors — context the schema can't
     * know, so it is a parameter. Only presence is checked; order and extra
     * participants don't matter.
     */
    participantsCheck: nip10.nip10.participantsCheck,
  },

  /** NIP-11: the relay information document a relay serves about itself. */
  nip11: {
    /**
     * The NIP-11 relay information document. Every field is optional, matching
     * the spec, and unknown keys are preserved rather than stripped — at the
     * top level and inside the nested `limitation`/`fees` objects.
     * `limitation.created_at_*_limit` are relative offsets in seconds, not
     * absolute timestamps.
     */
    relayInformationDocument: () =>
      miniOpenObject(nip11.nip11.relayInformationDocument()),
  },

  /**
   * NIP-13 proof of work. The nonce tag's structure is kept separate from
   * verifying an event's achieved difficulty and its committed target, so each
   * composes independently.
   */
  nip13: {
    /**
     * The `nonce` tag: `["nonce", <nonce>, <target difficulty>?]`. NIP-13
     * places no format constraint on the nonce, so it is a plain string; the
     * target is a non-negative integer string and is optional, since the spec
     * only says the tag SHOULD carry the commitment.
     */
    nonceTag: () => z.tuple(nip13.nip13.nonceTag()._zod.def.items),

    /**
     * An opt-in check that the event's achieved proof of work meets
     * `minDifficulty` — its `id` has at least that many leading zero bits. It
     * inspects only the id, not the nonce tag, so compose it onto an
     * id-bearing event schema. A non-integer or negative `minDifficulty`
     * throws at composition time, failing closed rather than accepting every
     * event.
     */
    powCheck: nip13.nip13.powCheck,

    /**
     * An opt-in check that the event commits to a target of at least
     * `minDifficulty` in its `nonce` tag — NIP-13's anti-spam guard, which
     * rejects a note that merely got lucky at a low committed target. A
     * missing tag, a missing or invalid target, and a target below the minimum
     * all fail. It fails closed on a bad `minDifficulty`, like `powCheck()`.
     */
    commitmentCheck: nip13.nip13.commitmentCheck,
  },

  /**
   * NIP-40 expiration timestamps. The tag's structure is kept separate from
   * deciding whether an event is currently expired, because that comparison
   * depends on a reference time the schema cannot see. NIP-40 is an advisory
   * convention, not a delete guarantee.
   */
  nip40: {
    /**
     * The `expiration` tag: `["expiration", <unix timestamp in seconds>]`. The
     * timestamp is an integer unix-seconds string; NIP-40 defines no canonical
     * encoding, so leading zeros are accepted and negatives are not rejected.
     */
    expirationTag: () => z.tuple(nip40.nip40.expirationTag()._zod.def.items),

    /**
     * An opt-in check that the event is not expired at `now` (unix seconds,
     * supplied by the caller to keep the check pure). No `expiration` tag
     * passes; every tag is inspected, so the earliest expiry wins; and a
     * present-but-malformed value fails rather than being treated as
     * no-expiry. `now` must be finite — a non-finite value throws at
     * composition time, failing closed.
     */
    expirationCheck: nip40.nip40.expirationCheck,
  },

  /**
   * NIP-42 client-relay authentication: the AUTH handshake messages, the
   * canonical auth event, and opt-in checks for the relay-side verification
   * steps. Both directions use the AUTH message name and are distinguished by
   * their payload.
   */
  nip42: {
    /**
     * The canonical authentication event, fixed to `kind: 22242`. Structure
     * only, the same as `event()`. The `"relay"`/`"challenge"` tags are not
     * required by the schema: NIP-42 only says the event should carry them,
     * and matching them is a relay-side step exposed as opt-in checks.
     */
    authEvent: () => miniStrictObject(nip42.nip42.authEvent()),

    /** The relay-to-client half of the NIP-42 AUTH handshake. */
    relayMessage: {
      /** `["AUTH", challenge]` — the relay's challenge to the client. */
      auth: () => z.tuple(nip42.nip42.relayMessage.auth()._zod.def.items),
    },

    /** The client-to-relay half of the NIP-42 AUTH handshake. */
    clientMessage: {
      /**
       * `["AUTH", signedAuthEvent]` — the client's signed reply requesting
       * authentication. The relay answers it with an `OK` message.
       */
      auth: () => z.tuple(nip42.nip42.clientMessage.auth()._zod.def.items),
    },

    /**
     * An opt-in check that the auth event's `"challenge"` tag matches the
     * challenge the relay sent.
     */
    challengeTagCheck: nip42.nip42.challengeTagCheck,

    /**
     * An opt-in check that the auth event's `"relay"` tag matches the relay
     * URL, compared as exact strings. NIP-42 allows URL normalization, so a
     * consumer wanting a looser match normalizes both sides first.
     */
    relayTagCheck: nip42.nip42.relayTagCheck,

    /**
     * An opt-in check that the auth event's `created_at` is within
     * `toleranceSeconds` of `now` (both unix seconds), defaulting to the
     * 600-second window NIP-42 gives as an example. Because the spec makes the
     * relay's time check a MUST, a non-finite `now` or a negative or
     * non-finite tolerance throws at composition time rather than quietly
     * disabling the check.
     */
    createdAtCheck: nip42.nip42.createdAtCheck,
  },

  /**
   * NIP-45 event counts: the COUNT request and response messages plus the
   * response body. Each validates structure only.
   */
  nip45: {
    /**
     * The COUNT response body: a non-negative integer `count`, an optional
     * `approximate` flag, and an optional `hll` HyperLogLog value (512 hex
     * chars). NIP-45 doesn't mandate lowercase for `hll`, so upper and mixed
     * case are accepted — the one exception to this library's lowercase-hex
     * rule. Unknown keys are rejected.
     */
    count: () => miniStrictObject(nip45.nip45.count()),

    /** The client-to-relay half of NIP-45. */
    clientMessage: {
      /**
       * `["COUNT", queryId, filter, ...filter[]]`. It carries the same NIP-01
       * filters, OR'd together, and requires at least one — send a single
       * empty `{}` filter to count everything.
       */
      count: () =>
        z.tuple(
          nip45.nip45.clientMessage.count()._zod.def.items,
          nip45.nip45.clientMessage.count()._zod.def.rest,
        ),
    },

    /** The relay-to-client half of NIP-45. */
    relayMessage: {
      /**
       * `["COUNT", queryId, count]`. A relay refusing the request replies with
       * NIP-01's `CLOSED` message instead.
       */
      count: () => z.tuple(nip45.nip45.relayMessage.count()._zod.def.items),
    },
  },

  /**
   * NIP-50 search: the `search`-extended REQ/COUNT filter and the REQ that
   * carries it.
   */
  nip50: {
    /**
     * The NIP-01 filter extended with an optional `search` string, inheriting
     * the base filter's fields and tag-filter handling so it tracks NIP-01
     * automatically. `search` has no length or recovery policy baked in —
     * NIP-50 places no format constraint on it. Its `key:value` extensions
     * live inside the string, not as extra filter fields.
     */
    filter: () => {
      const f = nip50.nip50.filter();
      return z
        .catchall(
          z.object(f._zod.def.shape),
          f._zod.def.catchall as core.SomeType,
        )
        .check(nip01.filterTagKeysCheck(["search"]));
    },

    /** The client-to-relay half of NIP-50. */
    clientMessage: {
      /**
       * `["REQ", subscriptionId, searchFilter, ...searchFilter[]]` — an
       * intentional superset of NIP-01's REQ, since a search filter is a
       * NIP-01 filter plus an optional `search`. NIP-01's own REQ stays
       * NIP-01-only and rejects `search`.
       */
      req: () => {
        const r = nip50.nip50.clientMessage.req();
        return z.tuple(r._zod.def.items, r._zod.def.rest);
      },
    },
  },

  /**
   * NIP-67: NIP-01's EOSE extended with an optional array of completeness
   * hints.
   */
  nip67: {
    /** The relay-to-client half of NIP-67. */
    relayMessage: {
      /**
       * `["EOSE", subscriptionId]` or `["EOSE", subscriptionId, hints]` — a
       * union of the two exact wire shapes, so an explicit `undefined` third
       * element is rejected. It is a strict superset of NIP-01's EOSE. The
       * hints are plain strings, not an enum: NIP-67 defines `"finish"`,
       * `"more"`, and `"auth"` but requires clients to accept unknown values.
       */
      eose: () => z.union(nip67.nip67.relayMessage.eose()._zod.def.options),
    },
  },

  /**
   * NIP-70 protected events. The `["-"]` marker's structure is kept separate
   * from the author-authorization decision, which depends on the connection's
   * NIP-42 authentication state — context the schema cannot see.
   */
  nip70: {
    /**
     * The protected marker tag: `["-"]`. The marker carries no value, so it is
     * a fixed single-element tuple and a second element is rejected.
     */
    protectedTag: () => z.tuple(nip70.nip70.protectedTag()._zod.def.items),

    /**
     * An opt-in check that a protected event (one carrying a `["-"]` tag) is
     * published only by its author — its `pubkey` must be among the
     * connection's authenticated pubkeys. It defaults to an empty set, an
     * unauthenticated connection, which fails closed and rejects every
     * protected event; a non-protected event always passes. Detection is
     * deliberately broader than `protectedTag()`: any tag whose first element
     * is `"-"` marks the event protected, so appending junk to the marker
     * can't bypass the author check.
     */
    protectedCheck: nip70.nip70.protectedCheck,
  },

  // Ergonomic root aliases — direct references into the canonical namespaces
  // above (never separate wrappers), so identity holds: e.g.
  // `zostr.event === zostr.nip01.event`. Curated Nostr-wide primitives only.

  /**
   * A 64-character lowercase hex string schema for a public key. Root alias of
   * `zostr.nip01.pubkey`.
   */
  pubkey: nip01Namespace.pubkey,

  /**
   * A 64-character lowercase hex string schema for an event id. Root alias of
   * `zostr.nip01.eventId`.
   */
  eventId: nip01Namespace.eventId,

  /**
   * A 128-character lowercase hex string schema for a Schnorr signature. Root
   * alias of `zostr.nip01.signature`.
   */
  signature: nip01Namespace.signature,

  /**
   * An integer schema for `created_at` (unix seconds). Root alias of
   * `zostr.nip01.timestamp`.
   */
  timestamp: nip01Namespace.timestamp,

  /**
   * An integer schema for `kind`, constrained to NIP-01's `0`–`65535`. Root
   * alias of `zostr.nip01.kind`.
   */
  kind: nip01Namespace.kind,

  /**
   * A `string[][]` schema for an event's `tags`. Root alias of
   * `zostr.nip01.tags`.
   */
  tags: nip01Namespace.tags,

  /**
   * An unsigned, un-authored event. Root alias of
   * `zostr.nip01.eventTemplate`.
   */
  eventTemplate: nip01Namespace.eventTemplate,

  /**
   * `eventTemplate()` plus `pubkey`. Root alias of
   * `zostr.nip01.unsignedEvent`.
   */
  unsignedEvent: nip01Namespace.unsignedEvent,

  /**
   * The full NIP-01 event, validated structurally. Root alias of
   * `zostr.nip01.event`.
   */
  event: nip01Namespace.event,

  /**
   * A check that verifies an event's signature. Root alias of
   * `zostr.nip01.signatureCheck`.
   */
  signatureCheck: nip01Namespace.signatureCheck,

  /**
   * A string schema for a subscription id. Root alias of
   * `zostr.nip01.subscriptionId`.
   */
  subscriptionId: nip01Namespace.subscriptionId,

  /**
   * The NIP-01 REQ/COUNT filter. Root alias of `zostr.nip01.filter`.
   */
  filter: nip01Namespace.filter,

  /**
   * A lightweight bech32 format check for the given prefix. Root alias of
   * `zostr.nip19.bech32`.
   */
  bech32: nip19Namespace.bech32,

  /**
   * A codec between an `npub` string and a hex pubkey. Root alias of
   * `zostr.nip19.npub`.
   */
  npub: nip19Namespace.npub,

  /**
   * A codec between an `nsec` string and a 32-byte `Uint8Array` secret key.
   * Root alias of `zostr.nip19.nsec`.
   */
  nsec: nip19Namespace.nsec,

  /**
   * A codec between a `note` string and a hex event id. Root alias of
   * `zostr.nip19.note`.
   */
  note: nip19Namespace.note,

  /**
   * A codec between an `nprofile` string and `{ pubkey, relays? }`. Root alias
   * of `zostr.nip19.nprofile`.
   */
  nprofile: nip19Namespace.nprofile,

  /**
   * A codec between an `nevent` string and `{ id, relays?, author?, kind? }`.
   * Root alias of `zostr.nip19.nevent`.
   */
  nevent: nip19Namespace.nevent,

  /**
   * A codec between an `naddr` string and
   * `{ identifier, pubkey, kind, relays? }`. Root alias of
   * `zostr.nip19.naddr`.
   */
  naddr: nip19Namespace.naddr,
};
