import * as z from "zod/mini";
import * as nip01 from "./nip01.js";
import * as nip19 from "./nip19.js";

export const zostr = {
	// NIP-01 field-level primitives (can be embedded directly in a z.object({...}) shape)
	pubkey: nip01.pubkey,
	eventId: nip01.eventId,
	signature: nip01.signature,
	timestamp: nip01.timestamp,
	kind: nip01.kind,
	tags: nip01.tags,

	// NIP-01 event schemas. Re-wrapped through mini's z.object() so .check() is available.
	eventTemplate: () => z.object(nip01.eventTemplate()._zod.def.shape),
	unsignedEvent: () => z.object(nip01.unsignedEvent()._zod.def.shape),
	event: () => z.object(nip01.event()._zod.def.shape),

	// Signature verification is check-composition only: zostr.event().check(zostr.signatureCheck())
	signatureCheck: nip01.signatureCheck,

	// NIP-19 / bech32 (lightweight version that only validates the prefix)
	bech32: nip19.bech32Schema,

	// NIP-19 codecs (decode/encode to the actual data)
	npub: () => nip19.npubCodec,
	nsec: () => nip19.nsecCodec,
	note: () => nip19.noteCodec,
	nprofile: () => nip19.nprofileCodec,
	nevent: () => nip19.neventCodec,
	naddr: () => nip19.naddrCodec,

	// Kind-specific content, namespaced by NIP number
	nip01: {
		metadata: nip01.nip01.metadata,
		textNote: () => z.object(nip01.nip01.textNote()._zod.def.shape),
	},
};
