import { describe, expect, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

/**
 * Field-level schemas for kind:0 profile metadata. Each atom is strict and
 * non-optional so consumers can compose their own optional/catch/default
 * policy on top (D3: a pre-weakened field can't be recovered).
 *
 * Fields whose value format is owned by another spec (nip05, lud16, lud06) are
 * only smoke-tested here for correct delegation; their exhaustive validation
 * lives in that spec's own test file.
 */

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
      expect(parse(f.birthday(), { year: 1990, month: 1, day: 31 })).toEqual({
        year: 1990,
        month: 1,
        day: 31,
      });
      expect(parse(f.birthday(), {})).toEqual({});
      expect(accepts(f.birthday(), { year: "1990" })).toBe(false);
    });

    it("preserves unknown keys on birthday (forward-compatible, never stripped)", () => {
      // birthday is part of kind:0 profile content, which is forward-compatible:
      // its catchall is `unknown`, matching the enclosing metadata() object.
      expect(
        parse(f.birthday(), { year: 1990, calendar: "gregorian" }),
      ).toEqual({ year: 1990, calendar: "gregorian" });
    });

    it("delegates nip05 to the NIP-05 identifier schema", () => {
      expect(parse(f.nip05(), "alice@example.com")).toBe("alice@example.com");
      expect(accepts(f.nip05(), "nope")).toBe(false);
      // NIP-05 local-part is lowercase-only ("MUST only use characters a-z0-9-_.").
      expect(accepts(f.nip05(), "Alice@example.com")).toBe(false);
    });

    it("delegates lud16 to the LUD-16 lightning-address schema", () => {
      expect(parse(f.lud16(), "alice@example.com")).toBe("alice@example.com");
      expect(accepts(f.lud16(), "no-at-sign")).toBe(false);
    });

    it("delegates lud06 to the LUD-01 LNURL schema", () => {
      // A short but valid bech32 lnurl; the plain-string default would accept
      // "not-bech32", so its rejection confirms the LUD-01 schema is wired in.
      expect(parse(f.lud06(), "lnurl1qypqxadgqpq")).toBe("lnurl1qypqxadgqpq");
      expect(accepts(f.lud06(), "not-bech32")).toBe(false);
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

  // Recipe from API.md: tolerate an empty-string URL field losslessly (some
  // clients write "" to clear a field instead of removing the key). Preserving
  // "" adds no one-way transform, so the schema still round-trips through
  // jsonCodec — see docs/API.md "Recipe: empty-string fields".
  it("classic: empty-string field is accepted, preserved, and codec-safe", () => {
    const f = classicZostr.nip01.metadataFields;
    const schema = classicZostr.nip01
      .metadata()
      .extend({ website: f.website().or(zc.literal("")).optional() });

    expect(schema.parse({ website: "" })).toEqual({ website: "" });
    expect(schema.parse({ website: "https://example.com" })).toEqual({
      website: "https://example.com",
    });
    // a non-empty invalid URL is still rejected
    expect(() => schema.parse({ website: "not a url" })).toThrow();

    const codec = classicZostr.jsonCodec(schema);
    expect(codec.decode('{"website":""}')).toEqual({ website: "" });
    expect(codec.decode('{"website":"https://example.com"}')).toEqual({
      website: "https://example.com",
    });
    expect(codec.encode({ website: "" })).toBe('{"website":""}');
    expect(codec.encode({ website: "https://example.com" })).toBe(
      '{"website":"https://example.com"}',
    );
  });

  it("mini: empty-string field is accepted, preserved, and codec-safe", () => {
    const f = miniZostr.nip01.metadataFields;
    const schema = zm.extend(miniZostr.nip01.metadata(), {
      website: zm.optional(zm.union([f.website(), zm.literal("")])),
    });

    expect(zm.parse(schema, { website: "" })).toEqual({ website: "" });
    expect(zm.parse(schema, { website: "https://example.com" })).toEqual({
      website: "https://example.com",
    });
    // a non-empty invalid URL is still rejected
    expect(() => zm.parse(schema, { website: "not a url" })).toThrow();

    const codec = miniZostr.jsonCodec(schema);
    expect(zm.decode(codec, '{"website":""}')).toEqual({ website: "" });
    expect(zm.decode(codec, '{"website":"https://example.com"}')).toEqual({
      website: "https://example.com",
    });
    expect(zm.encode(codec, { website: "" })).toBe('{"website":""}');
    expect(zm.encode(codec, { website: "https://example.com" })).toBe(
      '{"website":"https://example.com"}',
    );
  });
});
