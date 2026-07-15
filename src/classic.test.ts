import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zostr } from "./classic.js";

describe("zostr (classic)", () => {
	it("pubkey() embeds into z.object()", () => {
		const sk = generateSecretKey();
		const pk = getPublicKey(sk);
		const schema = z.object({ pubkey: zostr.pubkey() });

		expect(schema.parse({ pubkey: pk })).toEqual({ pubkey: pk });
		expect(() => schema.parse({ pubkey: "not-hex" })).toThrow();
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

		expect(schema.parse(signed)).toBeTruthy();
		expect(() => schema.parse(tampered)).toThrow();
		expect(() => schema.parse({ ...signed, pubkey: "not-hex" })).toThrow();
	});

	it("eventTemplate() / unsignedEvent() validate structure only", () => {
		expect(
			zostr.eventTemplate().parse({
				kind: 1,
				created_at: 0,
				tags: [],
				content: "hi",
			}),
		).toBeTruthy();

		const sk = generateSecretKey();
		expect(
			zostr.unsignedEvent().parse({
				pubkey: getPublicKey(sk),
				kind: 1,
				created_at: 0,
				tags: [],
				content: "hi",
			}),
		).toBeTruthy();
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

		const nprofile = nip19.nprofileEncode({ pubkey: pk, relays: ["wss://relay.example"] });
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

		const naddr = nip19.naddrEncode({ identifier: "foo", pubkey: pk, kind: 30023 });
		expect(z.decode(zostr.naddr(), naddr)).toEqual({
			identifier: "foo",
			pubkey: pk,
			kind: 30023,
			relays: [],
		});
	});

	it("nip01.metadata() decodes/validates kind:0 content JSON", () => {
		const content = JSON.stringify({
			name: "alice",
			display_name: "Alice",
			picture: "https://example.com/a.png",
			nip05: "alice@example.com",
		});

		const metadata = z.decode(zostr.nip01.metadata(), content);
		expect(metadata.name).toBe("alice");
		expect(metadata.nip05).toBe("alice@example.com");

		expect(() => z.decode(zostr.nip01.metadata(), "not json")).toThrow();
	});

	it("nip01.textNote() enforces kind === 1", () => {
		const sk = generateSecretKey();
		const note = finalizeEvent({ kind: 1, created_at: 0, tags: [], content: "hi" }, sk);
		const reaction = finalizeEvent({ kind: 7, created_at: 0, tags: [], content: "+" }, sk);

		expect(zostr.nip01.textNote().parse(note)).toBeTruthy();
		expect(() => zostr.nip01.textNote().parse(reaction)).toThrow();
	});
});
