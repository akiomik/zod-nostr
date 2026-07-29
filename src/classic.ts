import { z } from "zod";
import type * as core from "zod/v4/core";
import * as json from "./json.js";
import * as nip01 from "./nip01.js";

export type { ProfileMetadata } from "./nip01.js";

import * as nip05 from "./nip05.js";
import * as nip11 from "./nip11.js";
import * as nip19 from "./nip19.js";
import * as nip42 from "./nip42.js";
import * as nip45 from "./nip45.js";
import * as nip50 from "./nip50.js";
import * as nip67 from "./nip67.js";

/**
 * Re-wraps a core.$ZodCodec (shared, flavor-agnostic) through classic's own
 * z.codec() so the result has classic's native .decode()/.encode() methods,
 * the same way event schemas are re-wrapped to unlock .check().
 */
function classicCodec<A extends core.SomeType, B extends core.SomeType>(
  coreCodec: core.$ZodCodec<A, B>,
): z.ZodCodec<A, B> {
  const def = coreCodec._zod.def;
  return z.codec(def.in, def.out, {
    decode: def.transform,
    encode: def.reverseTransform,
  });
}

/**
 * Re-wraps a flavor-agnostic core schema (field-level primitives from
 * nip01.ts/nip05.ts/nip19.ts) through classic's own constructor, the same
 * way classicCodec() re-wraps codecs, so the result has classic's instance
 * methods (.parse()/.optional()/.catch()/.safeParse()/...) instead of being
 * unusable outside a z.object({...}) shape or the top-level z.* functions.
 */
function classicSchema<T extends core.SomeType>(
  Ctor: core.$constructor<T>,
  coreSchema: core.SomeType,
): T {
  // `new` via $constructor doesn't preserve the def's type arguments, so
  // assert the result against Ctor's own T explicitly (same treatment as
  // makeCodec()).
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new Ctor(coreSchema._zod.def as any);
}

export const zostr = {
  // NIP-01 field-level primitives (can be embedded directly in a z.object({...}) shape)
  pubkey: () => classicSchema(z.ZodString, nip01.pubkey()),
  eventId: () => classicSchema(z.ZodString, nip01.eventId()),
  signature: () => classicSchema(z.ZodString, nip01.signature()),
  timestamp: () => classicSchema(z.ZodNumber, nip01.timestamp()),
  kind: () => classicSchema(z.ZodNumber, nip01.kind()),
  tags: () => z.array(nip01.tags()._zod.def.element),

  // NIP-01 event schemas. Re-wrapped through classic's z.object() so .check() is available.
  eventTemplate: () => z.object(nip01.eventTemplate()._zod.def.shape),
  unsignedEvent: () => z.object(nip01.unsignedEvent()._zod.def.shape),
  event: () => z.object(nip01.event()._zod.def.shape),

  // Signature verification is check-composition only: zostr.event().check(zostr.signatureCheck())
  signatureCheck: nip01.signatureCheck,

  // NIP-01 REQ/COUNT filter object
  subscriptionId: () => classicSchema(z.ZodString, nip01.subscriptionId()),
  filter: () =>
    z
      .object(nip01.filter()._zod.def.shape)
      // nip01.filter() always sets catchall (to an array-of-strings schema
      // for "#<letter>" tag filters); zod core's own $ZodObjectDef types
      // `catchall` as `$ZodType | undefined` regardless, so this is never
      // actually undefined at runtime.
      .catchall(nip01.filter()._zod.def.catchall as core.SomeType)
      .check(nip01.filterTagKeysCheck()),

  // NIP-01 relay-to-client / client-to-relay messages (tuple/union schemas)
  relayMessage: {
    event: () => z.tuple(nip01.relayMessage.event()._zod.def.items),
    ok: () => z.tuple(nip01.relayMessage.ok()._zod.def.items),
    eose: () => z.tuple(nip01.relayMessage.eose()._zod.def.items),
    closed: () => z.tuple(nip01.relayMessage.closed()._zod.def.items),
    notice: () => z.tuple(nip01.relayMessage.notice()._zod.def.items),
    any: () => z.union(nip01.relayMessage.any()._zod.def.options),

    // Opt-in checks for NIP-01's OK/CLOSED "<prefix>: <message>" convention:
    // zostr.relayMessage.ok().check(zostr.relayMessage.okMessagePrefixCheck())
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

  // NIP-05
  nip05: {
    identifier: () => classicSchema(z.ZodString, nip05.nip05.identifier()),
    nostrJsonDocument: () =>
      z.object(nip05.nip05.nostrJsonDocument()._zod.def.shape),
    formatIdentifier: nip05.nip05.formatIdentifier,
  },

  // NIP-19 / bech32 (lightweight version that only validates the prefix)
  bech32: (prefix: nip19.Bech32Prefix) =>
    classicSchema(z.ZodString, nip19.bech32Schema(prefix)),

  // Generic codec: JSON string <-> the given schema's value
  jsonCodec: <T extends core.SomeType>(schema: T) =>
    classicCodec(json.jsonCodec(schema)),

  // NIP-19 codecs (decode/encode to the actual data)
  npub: () => classicCodec(nip19.npubCodec),
  nsec: () => classicCodec(nip19.nsecCodec),
  note: () => classicCodec(nip19.noteCodec),
  nprofile: () => classicCodec(nip19.nprofileCodec),
  nevent: () => classicCodec(nip19.neventCodec),
  naddr: () => classicCodec(nip19.naddrCodec),

  // Kind-specific content, namespaced by NIP number
  nip01: {
    // Object schema for a parsed kind:0 profile (optional known fields +
    // preserved unknown keys). For the JSON content string, use metadataContent().
    metadata: () =>
      z
        .object(nip01.nip01.metadata()._zod.def.shape)
        .catchall(nip01.nip01.metadata()._zod.def.catchall as core.SomeType),
    // Codec: kind:0 content string <-> the metadata() profile object.
    metadataContent: () => classicCodec(nip01.nip01.metadataContent()),
    textNote: () => z.object(nip01.nip01.textNote()._zod.def.shape),

    // Field-level schemas for kind:0 profile metadata (strict, non-optional;
    // compose your own optional/catch/default on top).
    metadataFields: {
      name: () => classicSchema(z.ZodString, nip01.metadataFields.name()),
      about: () => classicSchema(z.ZodString, nip01.metadataFields.about()),
      picture: () => classicSchema(z.ZodURL, nip01.metadataFields.picture()),
      displayName: () =>
        classicSchema(z.ZodString, nip01.metadataFields.displayName()),
      website: () => classicSchema(z.ZodURL, nip01.metadataFields.website()),
      banner: () => classicSchema(z.ZodURL, nip01.metadataFields.banner()),
      bot: () => classicSchema(z.ZodBoolean, nip01.metadataFields.bot()),
      birthday: () => z.object(nip01.metadataFields.birthday()._zod.def.shape),
      nip05: () => classicSchema(z.ZodString, nip01.metadataFields.nip05()),
      lud16: () => classicSchema(z.ZodString, nip01.metadataFields.lud16()),
      lud06: () => classicSchema(z.ZodString, nip01.metadataFields.lud06()),
    },
  },

  // NIP-11 relay information document
  nip11: {
    relayInformationDocument: () =>
      z.object(nip11.nip11.relayInformationDocument()._zod.def.shape),
  },

  // NIP-42 client-relay authentication (AUTH handshake messages + auth event + opt-in checks)
  nip42: {
    authEvent: () => z.object(nip42.nip42.authEvent()._zod.def.shape),
    authChallenge: () => z.tuple(nip42.nip42.authChallenge()._zod.def.items),
    authRequest: () => z.tuple(nip42.nip42.authRequest()._zod.def.items),

    // Opt-in verification checks composed onto authEvent(), the same way as
    // signatureCheck(): zostr.nip42.authEvent().check(zostr.nip42.challengeTagCheck(challenge))
    challengeTagCheck: nip42.nip42.challengeTagCheck,
    relayTagCheck: nip42.nip42.relayTagCheck,
    createdAtCheck: nip42.nip42.createdAtCheck,
  },

  // NIP-45 event counts (COUNT request/response messages + response body object)
  nip45: {
    count: () => z.object(nip45.nip45.count()._zod.def.shape),
    countRequest: () =>
      z.tuple(
        nip45.nip45.countRequest()._zod.def.items,
        nip45.nip45.countRequest()._zod.def.rest,
      ),
    countResponse: () => z.tuple(nip45.nip45.countResponse()._zod.def.items),
  },

  // NIP-50 search: the `search`-extended REQ/COUNT filter and the REQ that carries it
  nip50: {
    filter: () => {
      const f = nip50.nip50.filter();
      return z
        .object(f._zod.def.shape)
        .catchall(f._zod.def.catchall as core.SomeType)
        .check(nip01.filterTagKeysCheck(["search"]));
    },
    req: () => {
      const r = nip50.nip50.req();
      return z.tuple(r._zod.def.items, r._zod.def.rest);
    },
  },

  // NIP-67 EOSE completeness hint (relay→client EOSE with an optional hints array)
  nip67: {
    eose: () => z.union(nip67.nip67.eose()._zod.def.options),
  },
};
