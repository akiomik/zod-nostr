import { nip19 } from "nostr-tools";
import type * as core from "zod/v4/core";
import { makeCheck } from "./core/checks.js";
import { makeCodec } from "./core/codecs.js";
import { hexStringSchema } from "./core/hex.js";
import {
	zodArray,
	zodNumber,
	zodObject,
	zodOptional,
	zodString,
	zodUnknown,
} from "./core/primitives.js";

export type Bech32Prefix =
	| "npub"
	| "nsec"
	| "note"
	| "nprofile"
	| "nevent"
	| "naddr";

export interface ProfilePointer {
	[key: string]: unknown;
	pubkey: string;
	relays?: string[];
}

export interface EventPointer {
	[key: string]: unknown;
	id: string;
	relays?: string[];
	author?: string;
	kind?: number;
}

export interface AddressPointer {
	[key: string]: unknown;
	identifier: string;
	pubkey: string;
	kind: number;
	relays?: string[];
}

/** Lightweight schema that only validates the prefix (for cases that don't need the decoded value) */
export function bech32Schema<P extends Bech32Prefix>(
	prefix: P,
): core.$ZodString<string> {
	return zodString([
		makeCheck<string>((payload) => {
			try {
				if (nip19.decode(payload.value).type !== prefix) {
					throw new Error("prefix mismatch");
				}
			} catch {
				payload.issues.push({
					code: "invalid_format",
					format: "regex",
					input: payload.value,
					message: `Invalid ${prefix}`,
				});
			}
		}),
	]);
}

function secretKeySchema(): core.$ZodType<Uint8Array, Uint8Array> {
	return zodUnknown<Uint8Array>([
		makeCheck<Uint8Array>((payload) => {
			if (
				!(payload.value instanceof Uint8Array) ||
				payload.value.length !== 32
			) {
				payload.issues.push({
					code: "custom",
					input: payload.value,
					message: "Invalid secret key (expected 32-byte Uint8Array)",
				});
			}
		}),
	]);
}

function profilePointerSchema() {
	return zodObject({
		pubkey: hexStringSchema(64),
		relays: zodOptional(zodArray(zodString())),
	});
}

function eventPointerSchema() {
	return zodObject({
		id: hexStringSchema(64),
		relays: zodOptional(zodArray(zodString())),
		author: zodOptional(hexStringSchema(64)),
		kind: zodOptional(zodNumber()),
	});
}

function addressPointerSchema() {
	return zodObject({
		identifier: zodString(),
		pubkey: hexStringSchema(64),
		kind: zodNumber(),
		relays: zodOptional(zodArray(zodString())),
	});
}

export const npubCodec = makeCodec(bech32Schema("npub"), hexStringSchema(64), {
	decode: (npub) => nip19.decode(npub).data as string,
	encode: (pubkey) => nip19.npubEncode(pubkey),
});

export const nsecCodec = makeCodec(bech32Schema("nsec"), secretKeySchema(), {
	decode: (nsec) => nip19.decode(nsec).data as Uint8Array,
	encode: (sk) => nip19.nsecEncode(sk),
});

export const noteCodec = makeCodec(bech32Schema("note"), hexStringSchema(64), {
	decode: (note) => nip19.decode(note).data as string,
	encode: (id) => nip19.noteEncode(id),
});

export const nprofileCodec = makeCodec(
	bech32Schema("nprofile"),
	profilePointerSchema(),
	{
		decode: (nprofile) => nip19.decode(nprofile).data as ProfilePointer,
		encode: (profile) => nip19.nprofileEncode(profile),
	},
);

export const neventCodec = makeCodec(
	bech32Schema("nevent"),
	eventPointerSchema(),
	{
		decode: (nevent) => nip19.decode(nevent).data as EventPointer,
		encode: (event) => nip19.neventEncode(event),
	},
);

export const naddrCodec = makeCodec(
	bech32Schema("naddr"),
	addressPointerSchema(),
	{
		decode: (naddr) => nip19.decode(naddr).data as AddressPointer,
		encode: (addr) => nip19.naddrEncode(addr),
	},
);
