import { bech32 } from "@scure/base";
import { describe, expect, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

/**
 * Field-level schemas for kind:0 profile metadata. Each atom is strict and
 * non-optional so consumers can compose their own optional/catch/default
 * policy on top (D3: a pre-weakened field can't be recovered).
 */

// A real (long) LNURL from the LUD-01 spec example — well over @scure/base's
// default 90-char decode limit, so a naive `bech32.decode(v)` would reject it.
const LONG_LNURL =
  "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS".toLowerCase();
// Valid bech32 checksum but the wrong HRP (`note`, not `lnurl`).
const LNURL_WRONG_HRP = bech32.encode(
  "note",
  bech32.toWords(new Uint8Array(10)),
);
// A valid LNURL with its last character flipped, breaking the checksum.
const LNURL_BAD_CHECKSUM = `${LONG_LNURL.slice(0, -1)}${
  LONG_LNURL.endsWith("a") ? "z" : "a"
}`;

const LUD16_VALID = ["alice@example.com", "alice+tag@example.com", "a@b.onion"];
const LUD16_INVALID = [
  "+@example.com",
  "alice+@example.com",
  "alice++tag@example.com",
  "alice@example.com/path",
  "Alice@example.com",
  "no-at-sign",
];
const LUD06_INVALID: [string, string][] = [
  ["excess padding", "lnurl1leltelt"],
  ["mixed case", "LNURL1leltelt"],
  ["wrong hrp (valid checksum)", LNURL_WRONG_HRP],
  ["bad checksum", LNURL_BAD_CHECKSUM],
  ["garbage", "not-bech32"],
];

// Flavor adapters: classic exposes instance .parse/.safeParse; mini uses the
// top-level z.parse/z.safeParse functions.
const FLAVORS = [
  {
    name: "classic",
    fields: classicZostr.nip01.metadataFields,
    parse: (schema: unknown, value: unknown) =>
      (schema as { parse: (v: unknown) => unknown }).parse(value),
    accepts: (schema: unknown, value: unknown) =>
      (schema as { safeParse: (v: unknown) => { success: boolean } }).safeParse(
        value,
      ).success,
  },
  {
    name: "mini",
    fields: miniZostr.nip01.metadataFields,
    // biome-ignore lint/suspicious/noExplicitAny: mini's z.parse is typed per-schema; tests pass heterogeneous field schemas.
    parse: (schema: unknown, value: unknown) => zm.parse(schema as any, value),
    accepts: (schema: unknown, value: unknown) =>
      // biome-ignore lint/suspicious/noExplicitAny: see above.
      zm.safeParse(schema as any, value).success,
  },
] as const;

describe.each(FLAVORS)(
  "zostr.nip01.metadataFields ($name)",
  ({ fields: f, parse, accepts }) => {
    it("validates plain string fields (name/about/displayName)", () => {
      expect(parse(f.name(), "alice")).toBe("alice");
      expect(parse(f.about(), "hi")).toBe("hi");
      expect(parse(f.displayName(), "Alice")).toBe("Alice");
    });

    it("validates URL fields (picture/website/banner) and rejects non-URLs", () => {
      for (const field of [f.picture, f.website, f.banner]) {
        expect(parse(field(), "https://example.com/a.png")).toBe(
          "https://example.com/a.png",
        );
        expect(accepts(field(), "not a url")).toBe(false);
      }
    });

    it("validates bot as boolean", () => {
      expect(parse(f.bot(), true)).toBe(true);
      expect(accepts(f.bot(), "true")).toBe(false);
    });

    it("validates birthday as an object with optional year/month/day", () => {
      expect(parse(f.birthday(), { year: 1990 })).toEqual({ year: 1990 });
      expect(parse(f.birthday(), {})).toEqual({});
      expect(accepts(f.birthday(), { year: "1990" })).toBe(false);
    });

    it("delegates nip05 to the NIP-05 identifier schema", () => {
      expect(parse(f.nip05(), "alice@example.com")).toBe("alice@example.com");
      expect(accepts(f.nip05(), "nope")).toBe(false);
      // NIP-05 local-part is lowercase-only ("MUST only use characters a-z0-9-_.").
      expect(accepts(f.nip05(), "Alice@example.com")).toBe(false);
    });

    it.each(LUD16_VALID)("lud16 accepts %s", (value) => {
      expect(parse(f.lud16(), value)).toBe(value);
    });

    it.each(LUD16_INVALID)("lud16 rejects %s", (value) => {
      expect(accepts(f.lud16(), value)).toBe(false);
    });

    it("lud06 accepts a real (long) LNURL", () => {
      expect(parse(f.lud06(), LONG_LNURL)).toBe(LONG_LNURL);
    });

    it.each(LUD06_INVALID)("lud06 rejects %s", (_label, value) => {
      expect(accepts(f.lud06(), value)).toBe(false);
    });
  },
);

// Consumer composition (the nosey use case): fall back to "" for both missing
// and invalid values. The atom is non-optional, so catch + default fire.
describe("metadataFields composition", () => {
  it("classic: catch + default via instance methods", () => {
    const f = classicZostr.nip01.metadataFields;
    const schema = zc.object({
      name: f.name().trim().min(1).catch("").default(""),
    });
    expect(schema.parse({}).name).toBe("");
    expect(schema.parse({ name: "   " }).name).toBe("");
    expect(schema.parse({ name: "alice" }).name).toBe("alice");
  });

  it("mini: catch + default via function API", () => {
    const f = miniZostr.nip01.metadataFields;
    const schema = zm.object({
      name: zm._default(
        zm.catch(f.name().check(zm.trim(), zm.minLength(1)), ""),
        "",
      ),
    });
    expect(zm.parse(schema, {}).name).toBe("");
    expect(zm.parse(schema, { name: "   " }).name).toBe("");
    expect(zm.parse(schema, { name: "alice" }).name).toBe("alice");
  });
});
