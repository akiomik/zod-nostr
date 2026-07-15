import { z } from "zod";
import type * as core from "zod/v4/core";
import * as nip01 from "./nip01.js";
import * as nip05 from "./nip05.js";
import * as nip19 from "./nip19.js";

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
  tags: () => classicSchema(z.ZodArray, nip01.tags()),

  // NIP-01 event schemas. Re-wrapped through classic's z.object() so .check() is available.
  eventTemplate: () => z.object(nip01.eventTemplate()._zod.def.shape),
  unsignedEvent: () => z.object(nip01.unsignedEvent()._zod.def.shape),
  event: () => z.object(nip01.event()._zod.def.shape),

  // Signature verification is check-composition only: zostr.event().check(zostr.signatureCheck())
  signatureCheck: nip01.signatureCheck,

  // NIP-05
  nip05: () => classicSchema(z.ZodString, nip05.nip05IdentifierSchema()),
  formatNip05Identifier: nip05.formatNip05Identifier,

  // NIP-19 / bech32 (lightweight version that only validates the prefix)
  bech32: (prefix: nip19.Bech32Prefix) =>
    classicSchema(z.ZodString, nip19.bech32Schema(prefix)),

  // NIP-19 codecs (decode/encode to the actual data)
  npub: () => classicCodec(nip19.npubCodec),
  nsec: () => classicCodec(nip19.nsecCodec),
  note: () => classicCodec(nip19.noteCodec),
  nprofile: () => classicCodec(nip19.nprofileCodec),
  nevent: () => classicCodec(nip19.neventCodec),
  naddr: () => classicCodec(nip19.naddrCodec),

  // Kind-specific content, namespaced by NIP number
  nip01: {
    metadata: () => classicCodec(nip01.nip01.metadata()),
    textNote: () => z.object(nip01.nip01.textNote()._zod.def.shape),
  },
};
