import { verifyEvent } from "nostr-tools/pure";
import * as core from "zod/v4/core";
import {
	signatureCheck as coreSignatureCheck,
	makeCheck,
	type NostrEventLike,
} from "./core/checks.js";
import { makeCodec } from "./core/codecs.js";
import { hexStringSchema } from "./core/hex.js";
import {
	zodArray,
	zodNumber,
	zodObject,
	zodString,
} from "./core/primitives.js";
import { nip05IdentifierSchema } from "./nip05.js";

export function pubkey(): core.$ZodString<string> {
	return hexStringSchema(64);
}

export function eventId(): core.$ZodString<string> {
	return hexStringSchema(64);
}

export function signature(): core.$ZodString<string> {
	return hexStringSchema(128);
}

export function timestamp(): core.$ZodNumber<number> {
	return zodNumber();
}

export function kind(): core.$ZodNumber<number> {
	return zodNumber();
}

export function tags(): core.$ZodArray<
	core.$ZodArray<core.$ZodString<string>>
> {
	return zodArray(zodArray(zodString()));
}

/** Before signing, only kind/content/tags/created_at (equivalent to nostr-tools' EventTemplate) */
export function eventTemplate() {
	return zodObject({
		created_at: timestamp(),
		kind: kind(),
		tags: tags(),
		content: zodString(),
	});
}

/** Before signing, + pubkey (equivalent to nostr-tools' UnsignedEvent) */
export function unsignedEvent() {
	return zodObject({
		pubkey: pubkey(),
		created_at: timestamp(),
		kind: kind(),
		tags: tags(),
		content: zodString(),
	});
}

/** Validates structure only; does not verify the signature (compose `.check(signatureCheck())` for that) */
export function event() {
	return zodObject({
		id: eventId(),
		pubkey: pubkey(),
		created_at: timestamp(),
		kind: kind(),
		tags: tags(),
		content: zodString(),
		sig: signature(),
	});
}

/** Signature verification check bound to nostr-tools' verifyEvent */
export function signatureCheck(): core.$ZodCheck<NostrEventLike> {
	return coreSignatureCheck(verifyEvent);
}

function kindLiteralCheck(value: number): core.$ZodCheck<number> {
	return makeCheck<number>((payload) => {
		if (payload.value !== value) {
			payload.issues.push({
				code: "custom",
				input: payload.value,
				message: `Invalid kind (expected ${value})`,
			});
		}
	});
}

export interface ProfileMetadata {
	name: string;
	display_name: string;
	picture: string;
	nip05: string;
}

function profileMetadataObjectSchema() {
	return zodObject({
		name: zodString(),
		display_name: zodString(),
		picture: zodString(),
		nip05: nip05IdentifierSchema(),
	});
}

export const nip01 = {
	/** Codec for kind:0 content (JSON string) <-> parsed profile object */
	metadata: () =>
		makeCodec(zodString(), profileMetadataObjectSchema(), {
			decode: (content, payload) => {
				try {
					return JSON.parse(content);
				} catch {
					payload.issues.push({
						code: "custom",
						input: content,
						message: "Invalid Nostr profile content",
					});
					return core.NEVER;
				}
			},
			encode: (metadata) => JSON.stringify(metadata),
		}),
	/** Event schema fixed to kind:1 (structure only; compose `.check(signatureCheck())` for the signature) */
	textNote: () =>
		zodObject({
			id: eventId(),
			pubkey: pubkey(),
			created_at: timestamp(),
			kind: zodNumber([kindLiteralCheck(1)]),
			tags: tags(),
			content: zodString(),
			sig: signature(),
		}),
};

export type { NostrEventLike };
