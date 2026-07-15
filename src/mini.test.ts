import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
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
		const note = finalizeEvent({ kind: 1, created_at: 0, tags: [], content: "hi" }, sk);
		const reaction = finalizeEvent({ kind: 7, created_at: 0, tags: [], content: "+" }, sk);

		expect(z.parse(zostr.nip01.textNote(), note)).toBeTruthy();
		expect(() => z.parse(zostr.nip01.textNote(), reaction)).toThrow();
	});
});
