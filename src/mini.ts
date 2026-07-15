import * as z from "zod/mini";
import type * as core from "zod/v4/core";
import * as nip01 from "./nip01.js";
import * as nip05 from "./nip05.js";
import * as nip19 from "./nip19.js";

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

export const zostr = {
  // NIP-01 field-level primitives (can be embedded directly in a z.object({...}) shape)
  pubkey: () => miniSchema(z.ZodMiniString, nip01.pubkey()),
  eventId: () => miniSchema(z.ZodMiniString, nip01.eventId()),
  signature: () => miniSchema(z.ZodMiniString, nip01.signature()),
  timestamp: () => miniSchema(z.ZodMiniNumber, nip01.timestamp()),
  kind: () => miniSchema(z.ZodMiniNumber, nip01.kind()),
  tags: () => miniSchema(z.ZodMiniArray, nip01.tags()),

  // NIP-01 event schemas. Re-wrapped through mini's z.object() so .check() is available.
  eventTemplate: () => z.object(nip01.eventTemplate()._zod.def.shape),
  unsignedEvent: () => z.object(nip01.unsignedEvent()._zod.def.shape),
  event: () => z.object(nip01.event()._zod.def.shape),

  // Signature verification is check-composition only: zostr.event().check(zostr.signatureCheck())
  signatureCheck: nip01.signatureCheck,

  // NIP-01 REQ/COUNT filter object
  subscriptionId: () => miniSchema(z.ZodMiniString, nip01.subscriptionId()),
  filter: () => miniSchema(z.ZodMiniObject, nip01.filter()),

  // NIP-01 relay-to-client / client-to-relay messages (tuple/union schemas)
  relayMessage: {
    event: () => miniSchema(z.ZodMiniTuple, nip01.relayMessage.event()),
    ok: () => miniSchema(z.ZodMiniTuple, nip01.relayMessage.ok()),
    eose: () => miniSchema(z.ZodMiniTuple, nip01.relayMessage.eose()),
    closed: () => miniSchema(z.ZodMiniTuple, nip01.relayMessage.closed()),
    notice: () => miniSchema(z.ZodMiniTuple, nip01.relayMessage.notice()),
    any: () => miniSchema(z.ZodMiniUnion, nip01.relayMessage.any()),

    // Opt-in checks for NIP-01's OK/CLOSED "<prefix>: <message>" convention:
    // zostr.relayMessage.ok().check(zostr.relayMessage.okMessagePrefixCheck())
    okMessagePrefixCheck: nip01.relayMessage.okMessagePrefixCheck,
    closedMessagePrefixCheck: nip01.relayMessage.closedMessagePrefixCheck,
  },
  clientMessage: {
    event: () => miniSchema(z.ZodMiniTuple, nip01.clientMessage.event()),
    req: () => miniSchema(z.ZodMiniTuple, nip01.clientMessage.req()),
    close: () => miniSchema(z.ZodMiniTuple, nip01.clientMessage.close()),
    any: () => miniSchema(z.ZodMiniUnion, nip01.clientMessage.any()),
  },

  // NIP-05
  nip05: () => miniSchema(z.ZodMiniString, nip05.nip05IdentifierSchema()),
  formatNip05Identifier: nip05.formatNip05Identifier,

  // NIP-19 / bech32 (lightweight version that only validates the prefix)
  bech32: (prefix: nip19.Bech32Prefix) =>
    miniSchema(z.ZodMiniString, nip19.bech32Schema(prefix)),

  // NIP-19 codecs (decode/encode to the actual data)
  npub: () => miniCodec(nip19.npubCodec),
  nsec: () => miniCodec(nip19.nsecCodec),
  note: () => miniCodec(nip19.noteCodec),
  nprofile: () => miniCodec(nip19.nprofileCodec),
  nevent: () => miniCodec(nip19.neventCodec),
  naddr: () => miniCodec(nip19.naddrCodec),

  // Kind-specific content, namespaced by NIP number
  nip01: {
    metadata: () => miniCodec(nip01.nip01.metadata()),
    textNote: () => z.object(nip01.nip01.textNote()._zod.def.shape),
  },
};
