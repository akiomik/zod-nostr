import * as z from "zod/mini";
import type * as core from "zod/v4/core";
import * as json from "./json.js";
import * as nip01 from "./nip01.js";

export type { ProfileMetadata } from "./nip01.js";

import * as nip05 from "./nip05.js";
import * as nip10 from "./nip10.js";
import * as nip11 from "./nip11.js";
import * as nip19 from "./nip19.js";
import * as nip42 from "./nip42.js";
import * as nip45 from "./nip45.js";
import * as nip50 from "./nip50.js";
import * as nip67 from "./nip67.js";

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
  identifier: () => miniSchema(z.ZodMiniString, nip05.nip05.identifier()),
  nostrJsonDocument: () => miniOpenObject(nip05.nip05.nostrJsonDocument()),
  formatIdentifier: nip05.nip05.formatIdentifier,
};

// NIP-01: primitives, event schemas, the REQ/COUNT filter, relay/client
// messages, and kind:0 profile content — the canonical home for every base
// Nostr concept. The root ergonomic aliases below are direct references into
// this namespace (never separate wrappers), so e.g. `zostr.event ===
// zostr.nip01.event`.
const nip01Namespace = {
  // Field-level primitives (can be embedded directly in a z.object({...}) shape)
  pubkey: () => miniSchema(z.ZodMiniString, nip01.pubkey()),
  eventId: () => miniSchema(z.ZodMiniString, nip01.eventId()),
  signature: () => miniSchema(z.ZodMiniString, nip01.signature()),
  timestamp: () => miniSchema(z.ZodMiniNumber, nip01.timestamp()),
  kind: () => miniSchema(z.ZodMiniNumber, nip01.kind()),
  tags: () => z.array(nip01.tags()._zod.def.element),

  // Event schemas. Re-wrapped through mini's z.object() so .check() is available.
  eventTemplate: () => miniStrictObject(nip01.eventTemplate()),
  unsignedEvent: () => miniStrictObject(nip01.unsignedEvent()),
  event: () => miniStrictObject(nip01.event()),

  // Signature verification is check-composition only: zostr.event().check(zostr.signatureCheck())
  signatureCheck: nip01.signatureCheck,

  // REQ/COUNT filter object
  subscriptionId: () => miniSchema(z.ZodMiniString, nip01.subscriptionId()),
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

  // Relay-to-client / client-to-relay messages (tuple/union schemas)
  relayMessage: {
    event: () => z.tuple(nip01.relayMessage.event()._zod.def.items),
    ok: () => z.tuple(nip01.relayMessage.ok()._zod.def.items),
    eose: () => z.tuple(nip01.relayMessage.eose()._zod.def.items),
    closed: () => z.tuple(nip01.relayMessage.closed()._zod.def.items),
    notice: () => z.tuple(nip01.relayMessage.notice()._zod.def.items),
    any: () => z.union(nip01.relayMessage.any()._zod.def.options),

    // Opt-in checks for NIP-01's OK/CLOSED "<prefix>: <message>" convention:
    // zostr.nip01.relayMessage.ok().check(zostr.nip01.relayMessage.okMessagePrefixCheck())
    okMessagePrefixCheck: nip01.relayMessage.okMessagePrefixCheck,
    closedMessagePrefixCheck: nip01.relayMessage.closedMessagePrefixCheck,
  },
  clientMessage: {
    event: () => z.tuple(nip01.clientMessage.event()._zod.def.items),
    req: () =>
      z.tuple(
        nip01.clientMessage.req()._zod.def.items,
        nip01.clientMessage.req()._zod.def.rest,
      ),
    close: () => z.tuple(nip01.clientMessage.close()._zod.def.items),
    any: () => z.union(nip01.clientMessage.any()._zod.def.options),
  },

  // Kind:0 profile content
  // Object schema for a parsed kind:0 profile (optional known fields +
  // preserved unknown keys). For the JSON content string, use metadataContent().
  metadata: () => miniOpenObject(nip01.nip01.metadata()),
  // Codec: kind:0 content string <-> the metadata() profile object.
  metadataContent: () => miniCodec(nip01.nip01.metadataContent()),

  // Field-level schemas for kind:0 profile metadata (strict, non-optional;
  // compose your own optional/catch/default on top). This is the canonical
  // owner of the profile-field catalog; the value formats come from several
  // specs (NIP-01/NIP-24/LUD), tracked in the docs, not the path. The one
  // exception is `nip05`, a general concept whose canonical home is
  // `nip05.identifier` — here it is a direct reference to it.
  metadataFields: {
    name: () => miniSchema(z.ZodMiniString, nip01.metadataFields.name()),
    about: () => miniSchema(z.ZodMiniString, nip01.metadataFields.about()),
    picture: () => miniSchema(z.ZodMiniURL, nip01.metadataFields.picture()),
    displayName: () =>
      miniSchema(z.ZodMiniString, nip01.metadataFields.displayName()),
    website: () => miniSchema(z.ZodMiniURL, nip01.metadataFields.website()),
    banner: () => miniSchema(z.ZodMiniURL, nip01.metadataFields.banner()),
    bot: () => miniSchema(z.ZodMiniBoolean, nip01.metadataFields.bot()),
    birthday: () => miniOpenObject(nip01.metadataFields.birthday()),
    nip05: nip05Namespace.identifier,
    lud16: () => miniSchema(z.ZodMiniString, nip01.metadataFields.lud16()),
    lud06: () => miniSchema(z.ZodMiniString, nip01.metadataFields.lud06()),
  },
};

// NIP-19 / bech32-encoded entities. Globally unique concepts, so the entity
// names are also exposed as root aliases (direct references into here).
const nip19Namespace = {
  // Lightweight schema that only validates the prefix
  bech32: (prefix: nip19.Bech32Prefix) =>
    miniSchema(z.ZodMiniString, nip19.bech32Schema(prefix)),

  // Codecs (decode/encode to the actual data)
  npub: () => miniCodec(nip19.npubCodec),
  nsec: () => miniCodec(nip19.nsecCodec),
  note: () => miniCodec(nip19.noteCodec),
  nprofile: () => miniCodec(nip19.nprofileCodec),
  nevent: () => miniCodec(nip19.neventCodec),
  naddr: () => miniCodec(nip19.naddrCodec),
};

export const zostr = {
  // Generic codec: JSON string <-> the given schema's value (cross-spec utility)
  jsonCodec: <T extends core.SomeType>(schema: T) =>
    miniCodec(json.jsonCodec(schema)),

  // Canonical spec namespaces
  nip01: nip01Namespace,
  nip19: nip19Namespace,

  // NIP-05
  nip05: nip05Namespace,

  // NIP-10 text notes and threads (kind:1 event + reply/quote tags + opt-in thread checks)
  nip10: {
    textNote: () => miniStrictObject(nip10.nip10.textNote()),
    eTag: () => z.tuple(nip10.nip10.eTag()._zod.def.items),
    qTag: () => z.tuple(nip10.nip10.qTag()._zod.def.items),

    // Opt-in reply/thread conventions composed onto textNote() — see design.md
    // "Checks beyond the structural contract are opt-in".
    threadCheck: nip10.nip10.threadCheck,
    participantsCheck: nip10.nip10.participantsCheck,
  },

  // NIP-11 relay information document
  nip11: {
    relayInformationDocument: () =>
      miniOpenObject(nip11.nip11.relayInformationDocument()),
  },

  // NIP-42 client-relay authentication (AUTH handshake messages + auth event + opt-in checks)
  nip42: {
    authEvent: () => miniStrictObject(nip42.nip42.authEvent()),
    relayMessage: {
      auth: () => z.tuple(nip42.nip42.relayMessage.auth()._zod.def.items),
    },
    clientMessage: {
      auth: () => z.tuple(nip42.nip42.clientMessage.auth()._zod.def.items),
    },

    // Opt-in verification checks composed onto authEvent(), the same way as
    // signatureCheck(): zostr.nip42.authEvent().check(zostr.nip42.challengeTagCheck(challenge))
    challengeTagCheck: nip42.nip42.challengeTagCheck,
    relayTagCheck: nip42.nip42.relayTagCheck,
    createdAtCheck: nip42.nip42.createdAtCheck,
  },

  // NIP-45 event counts (COUNT request/response messages + response body object)
  nip45: {
    count: () => miniStrictObject(nip45.nip45.count()),
    clientMessage: {
      count: () =>
        z.tuple(
          nip45.nip45.clientMessage.count()._zod.def.items,
          nip45.nip45.clientMessage.count()._zod.def.rest,
        ),
    },
    relayMessage: {
      count: () => z.tuple(nip45.nip45.relayMessage.count()._zod.def.items),
    },
  },

  // NIP-50 search: the `search`-extended REQ/COUNT filter and the REQ that carries it
  nip50: {
    filter: () => {
      const f = nip50.nip50.filter();
      return z
        .catchall(
          z.object(f._zod.def.shape),
          f._zod.def.catchall as core.SomeType,
        )
        .check(nip01.filterTagKeysCheck(["search"]));
    },
    clientMessage: {
      req: () => {
        const r = nip50.nip50.clientMessage.req();
        return z.tuple(r._zod.def.items, r._zod.def.rest);
      },
    },
  },

  // NIP-67 EOSE completeness hint (relay→client EOSE with an optional hints array)
  nip67: {
    relayMessage: {
      eose: () => z.union(nip67.nip67.relayMessage.eose()._zod.def.options),
    },
  },

  // Ergonomic root aliases — direct references into the canonical namespaces
  // above (never separate wrappers), so identity holds: e.g.
  // `zostr.event === zostr.nip01.event`. Curated Nostr-wide primitives only.
  pubkey: nip01Namespace.pubkey,
  eventId: nip01Namespace.eventId,
  signature: nip01Namespace.signature,
  timestamp: nip01Namespace.timestamp,
  kind: nip01Namespace.kind,
  tags: nip01Namespace.tags,
  eventTemplate: nip01Namespace.eventTemplate,
  unsignedEvent: nip01Namespace.unsignedEvent,
  event: nip01Namespace.event,
  signatureCheck: nip01Namespace.signatureCheck,
  subscriptionId: nip01Namespace.subscriptionId,
  filter: nip01Namespace.filter,
  bech32: nip19Namespace.bech32,
  npub: nip19Namespace.npub,
  nsec: nip19Namespace.nsec,
  note: nip19Namespace.note,
  nprofile: nip19Namespace.nprofile,
  nevent: nip19Namespace.nevent,
  naddr: nip19Namespace.naddr,
};
