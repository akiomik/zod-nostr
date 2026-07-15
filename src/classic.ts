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

export const zostr = {
  // NIP-01 field-level primitives (can be embedded directly in a z.object({...}) shape)
  pubkey: nip01.pubkey,
  eventId: nip01.eventId,
  signature: nip01.signature,
  timestamp: nip01.timestamp,
  kind: nip01.kind,
  tags: nip01.tags,

  // NIP-01 event schemas. Re-wrapped through classic's z.object() so .check() is available.
  eventTemplate: () => z.object(nip01.eventTemplate()._zod.def.shape),
  unsignedEvent: () => z.object(nip01.unsignedEvent()._zod.def.shape),
  event: () => z.object(nip01.event()._zod.def.shape),

  // Signature verification is check-composition only: zostr.event().check(zostr.signatureCheck())
  signatureCheck: nip01.signatureCheck,

  // NIP-05
  nip05: nip05.nip05IdentifierSchema,
  formatNip05Identifier: nip05.formatNip05Identifier,

  // NIP-19 / bech32 (lightweight version that only validates the prefix)
  bech32: nip19.bech32Schema,

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
