import { describe, expect, it } from "vitest";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

/**
 * Regression coverage for: zostr.nip05()/formatNip05Identifier() existed in
 * src/nip05.ts but were never wired into classic.ts/mini.ts's exported
 * `zostr` object. That kind of gap doesn't show up in tests that only
 * exercise individual functions someone remembered to test — it needs an
 * explicit inventory of the full public surface.
 */
const EXPECTED_TOP_LEVEL_KEYS = [
	"pubkey",
	"eventId",
	"signature",
	"timestamp",
	"kind",
	"tags",
	"eventTemplate",
	"unsignedEvent",
	"event",
	"signatureCheck",
	"nip05",
	"formatNip05Identifier",
	"bech32",
	"npub",
	"nsec",
	"note",
	"nprofile",
	"nevent",
	"naddr",
	"nip01",
].sort();

const EXPECTED_NIP01_KEYS = ["metadata", "textNote"].sort();

function keysOf(obj: object): string[] {
	return Object.keys(obj).sort();
}

describe.each([
	["classic", classicZostr],
	["mini", miniZostr],
])("%s zostr public API surface", (_flavor, zostr) => {
	it("exposes exactly the expected top-level keys", () => {
		expect(keysOf(zostr)).toEqual(EXPECTED_TOP_LEVEL_KEYS);
	});

	it("exposes exactly the expected zostr.nip01 keys", () => {
		expect(keysOf(zostr.nip01)).toEqual(EXPECTED_NIP01_KEYS);
	});

	it("every top-level key except nip01 is callable", () => {
		for (const key of EXPECTED_TOP_LEVEL_KEYS) {
			if (key === "nip01") continue;
			expect(typeof (zostr as Record<string, unknown>)[key]).toBe("function");
		}
	});

	it("every zostr.nip01 key is callable", () => {
		for (const key of EXPECTED_NIP01_KEYS) {
			expect(typeof (zostr.nip01 as Record<string, unknown>)[key]).toBe(
				"function",
			);
		}
	});
});

it("classic and mini expose identical key sets (dual-flavor parity)", () => {
	expect(keysOf(classicZostr)).toEqual(keysOf(miniZostr));
	expect(keysOf(classicZostr.nip01)).toEqual(keysOf(miniZostr.nip01));
});
