import { nip19 } from "nostr-tools";
import {
	finalizeEvent,
	generateSecretKey,
	getPublicKey,
} from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { zostr } from "./mini.js";

describe("zostr (mini)", () => {
	it("pubkey() embeds into z.object()", () => {
		const sk = generateSecretKey();
		const pk = getPublicKey(sk);
		const schema = z.object({ pubkey: zostr.pubkey() });

		expect(z.parse(schema, { pubkey: pk })).toEqual({ pubkey: pk });
		expect(() => z.parse(schema, { pubkey: "not-hex" })).toThrow();
	});

	it("event().check(signatureCheck()) verifies structure + signature", () => {
		const sk = generateSecretKey();
		const template = {
			kind: 1,
			created_at: Math.floor(Date.now() / 1000),
			tags: [],
			content: "hello nostr",
		};
		const signed = finalizeEvent(template, sk);
		const tampered = { ...signed, content: "tampered" };

		const schema = zostr.event().check(zostr.signatureCheck());

		expect(z.parse(schema, signed)).toBeTruthy();
		expect(() => z.parse(schema, tampered)).toThrow();
	});

	it("bech32(prefix) validates format only", () => {
		const sk = generateSecretKey();
		const npub = nip19.npubEncode(getPublicKey(sk));

		expect(z.parse(zostr.bech32("npub"), npub)).toBe(npub);
		expect(() => z.parse(zostr.bech32("nsec"), npub)).toThrow();
	});

	it("npub() codec round-trips pubkey <-> npub", () => {
		const sk = generateSecretKey();
		const pk = getPublicKey(sk);
		const codec = zostr.npub();

		const npub = z.encode(codec, pk);
		expect(npub.startsWith("npub1")).toBe(true);
		expect(z.decode(codec, npub)).toBe(pk);
	});

	it("nsec() codec round-trips secret key bytes <-> nsec", () => {
		const sk = generateSecretKey();
		const codec = zostr.nsec();

		const nsec = z.encode(codec, sk);
		expect(nsec.startsWith("nsec1")).toBe(true);
		expect(z.decode(codec, nsec)).toEqual(sk);
	});

	it("note() codec round-trips event id <-> note", () => {
		const sk = generateSecretKey();
		const signed = finalizeEvent(
			{ kind: 1, created_at: 0, tags: [], content: "hi" },
			sk,
		);
		const codec = zostr.note();

		const note = z.encode(codec, signed.id);
		expect(note.startsWith("note1")).toBe(true);
		expect(z.decode(codec, note)).toBe(signed.id);
	});

	it("nprofile()/nevent()/naddr() codecs decode structured pointers", () => {
		const sk = generateSecretKey();
		const pk = getPublicKey(sk);

		const nprofile = nip19.nprofileEncode({
			pubkey: pk,
			relays: ["wss://relay.example"],
		});
		expect(z.decode(zostr.nprofile(), nprofile)).toEqual({
			pubkey: pk,
			relays: ["wss://relay.example"],
		});

		const nevent = nip19.neventEncode({ id: "a".repeat(64), kind: 1 });
		expect(z.decode(zostr.nevent(), nevent)).toEqual({
			id: "a".repeat(64),
			kind: 1,
			relays: [],
			author: undefined,
		});

		const naddr = nip19.naddrEncode({
			identifier: "foo",
			pubkey: pk,
			kind: 30023,
		});
		expect(z.decode(zostr.naddr(), naddr)).toEqual({
			identifier: "foo",
			pubkey: pk,
			kind: 30023,
			relays: [],
		});
	});

	it("nip01.metadata() decodes/validates kind:0 content JSON", () => {
		const content = JSON.stringify({
			name: "bob",
			display_name: "Bob",
			picture: "https://example.com/b.png",
			nip05: "bob@example.com",
		});

		const metadata = z.decode(zostr.nip01.metadata(), content);
		expect(metadata.name).toBe("bob");
	});

	it("nip01.textNote() enforces kind === 1", () => {
		const sk = generateSecretKey();
		const note = finalizeEvent(
			{ kind: 1, created_at: 0, tags: [], content: "hi" },
			sk,
		);
		const reaction = finalizeEvent(
			{ kind: 7, created_at: 0, tags: [], content: "+" },
			sk,
		);

		expect(z.parse(zostr.nip01.textNote(), note)).toBeTruthy();
		expect(() => z.parse(zostr.nip01.textNote(), reaction)).toThrow();
	});

	it("every wrapped event schema and codec exposes mini's native .check() (regression: raw core schemas lack it)", () => {
		const wrappedSchemas: Array<() => { check: unknown }> = [
			() => zostr.event(),
			() => zostr.unsignedEvent(),
			() => zostr.eventTemplate(),
			() => zostr.nip01.textNote(),
			() => zostr.npub(),
			() => zostr.nsec(),
			() => zostr.note(),
			() => zostr.nprofile(),
			() => zostr.nevent(),
			() => zostr.naddr(),
			() => zostr.nip01.metadata(),
		];

		for (const factory of wrappedSchemas) {
			expect(typeof factory().check).toBe("function");
		}
	});

	// Note: unlike classic zod, zod/mini never attaches .decode()/.encode() as
	// instance methods on any schema (only the top-level z.decode()/z.encode()
	// exist) — so there's no equivalent "instance method" assertion to make
	// here for codecs. The rewrap through mini's own z.codec() still matters
	// for .check() and for keeping a mini-native schema instance, see above.
});
