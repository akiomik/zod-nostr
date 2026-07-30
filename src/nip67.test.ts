import { describe, expect, expectTypeOf, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

describe.each(FLAVORS)(
  "zostr.nip67.relayMessage.eose() ($name)",
  ({ zostr, z }) => {
    it.each<[string, unknown[]]>([
      // The bare NIP-01 form (a NIP-67 relay still sends it).
      ["the bare two-element form", ["EOSE", "sub1"]],
      ["a single defined hint", ["EOSE", "sub1", ["finish"]]],
      // The array MAY be empty and MAY carry multiple hints.
      ["an empty hints array", ["EOSE", "sub1", []]],
      ["multiple hints", ["EOSE", "sub1", ["finish", "more"]]],
      // Unknown hint values are accepted as plain strings (no enum baked in).
      ["an unknown hint value", ["EOSE", "sub1", ["future"]]],
    ])("accepts %s", (_label, message) => {
      expect(z.parse(zostr.nip67.relayMessage.eose(), message)).toBeTruthy();
    });

    it.each<[string, unknown[]]>([
      // The hints must be an array of strings, not a bare string...
      ["a bare-string hint", ["EOSE", "sub1", "finish"]],
      // ...nor an array containing non-strings.
      ["a non-string hint element", ["EOSE", "sub1", [1]]],
      // An explicit `undefined` third element is not a JSON wire shape.
      ["an explicit undefined third element", ["EOSE", "sub1", undefined]],
      ["a fourth element", ["EOSE", "sub1", ["finish"], "extra"]],
      // The subscription id still applies (non-empty).
      ["an empty subscription id", ["EOSE", "", ["finish"]]],
    ])("rejects %s", (_label, message) => {
      expect(
        z.safeParse(zostr.nip67.relayMessage.eose(), message).success,
      ).toBe(false);
    });

    it("round-trips the two- and three-element shapes verbatim", () => {
      expect(
        z.parse(zostr.nip67.relayMessage.eose(), ["EOSE", "sub1"]),
      ).toEqual(["EOSE", "sub1"]);
      expect(
        z.parse(zostr.nip67.relayMessage.eose(), ["EOSE", "sub1", ["finish"]]),
      ).toEqual(["EOSE", "sub1", ["finish"]]);
    });

    it("NIP-01 relayMessage.any() rejects a NIP-67 EOSE; a composed union accepts it", () => {
      // relayMessage.any() is NIP-01-only, so the three-element form is rejected.
      expect(
        z.safeParse(zostr.nip01.relayMessage.any(), [
          "EOSE",
          "sub1",
          ["finish"],
        ]).success,
      ).toBe(false);
      // The documented composition accepts both NIP-01 messages and NIP-67 EOSE.
      const relayMessage = z.union([
        zostr.nip01.relayMessage.any(),
        zostr.nip67.relayMessage.eose(),
      ]);
      expect(z.parse(relayMessage, ["EOSE", "sub1"])).toBeTruthy();
      expect(z.parse(relayMessage, ["EOSE", "sub1", ["finish"]])).toBeTruthy();
      expect(z.parse(relayMessage, ["NOTICE", "hi"])).toBeTruthy();
    });
  },
);

describe("zostr.nip67 output types", () => {
  it("infers the precise two-/three-element union type (classic)", () => {
    const eose = classicZostr.nip67.relayMessage
      .eose()
      .parse(["EOSE", "sub1", ["finish"]]);
    // The hints (when present) are string[].
    const hints = eose.length === 3 ? eose[2] : undefined;
    expectTypeOf(hints).toEqualTypeOf<string[] | undefined>();
  });

  it("infers the precise two-/three-element union type (mini)", () => {
    const eose = zm.parse(miniZostr.nip67.relayMessage.eose(), [
      "EOSE",
      "sub1",
      ["finish"],
    ]);
    const hints = eose.length === 3 ? eose[2] : undefined;
    expectTypeOf(hints).toEqualTypeOf<string[] | undefined>();
  });
});
