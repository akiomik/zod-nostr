import { describe, expect, expectTypeOf, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr, type ProfileMetadata } from "./classic.js";
import {
  type ProfileMetadata as MiniProfileMetadata,
  zostr as miniZostr,
} from "./mini.js";

const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

describe.each(FLAVORS)("zostr.nip01.metadata() ($name)", ({ zostr, z }) => {
  const schema = () => zostr.nip01.metadata();

  it("parses a partial profile — every known field is optional", () => {
    expect(z.parse(schema(), { name: "alice" })).toEqual({ name: "alice" });
    expect(z.parse(schema(), {})).toEqual({});
  });

  it("validates known fields strictly, with no baked-in fallback", () => {
    expect(z.safeParse(schema(), { picture: "not-a-url" }).success).toBe(false);
    expect(z.safeParse(schema(), { nip05: "nope" }).success).toBe(false);
    expect(z.safeParse(schema(), { name: 123 }).success).toBe(false);
  });

  it("preserves unknown keys", () => {
    expect(z.parse(schema(), { name: "a", customField: 123 })).toEqual({
      name: "a",
      customField: 123,
    });
  });

  it("accepts an explicit undefined for a known field", () => {
    expect(z.parse(schema(), { name: undefined })).toEqual({ name: undefined });
  });
});

describe.each(FLAVORS)(
  "zostr.nip01.metadataContent() ($name)",
  ({ zostr, z }) => {
    const codec = () => zostr.nip01.metadataContent();

    it("decodes kind:0 content and encodes it back", () => {
      const profile = { name: "alice", nip05: "alice@example.com" };
      expect(z.decode(codec(), JSON.stringify(profile))).toEqual(profile);
      expect(JSON.parse(z.encode(codec(), profile))).toEqual(profile);
    });

    it("preserves unknown keys across a decode -> encode round-trip", () => {
      const decoded = z.decode(codec(), '{"name":"a","customField":123}');
      expect(decoded).toEqual({ name: "a", customField: 123 });
      expect(JSON.parse(z.encode(codec(), decoded))).toEqual({
        name: "a",
        customField: 123,
      });
    });

    it("reports invalid JSON as an issue", () => {
      expect(z.safeDecode(codec(), "not json").success).toBe(false);
    });

    it("round-trips an explicit-undefined field to '{}' (self-consistent with metadata())", () => {
      // metadata() returns `{ name: undefined }`; encoding it must succeed and
      // drop the key (this is the case that ruled out `catchall(z.json())`).
      const parsed = z.parse(zostr.nip01.metadata(), { name: undefined });
      expect(z.encode(codec(), parsed)).toBe("{}");
    });
  },
);

// The point of the object schema: build a custom profile schema on top of it.
describe("zostr.nip01.metadata() composition", () => {
  it("classic: .extend() replaces a field and keeps unknown keys", () => {
    const schema = classicZostr.nip01
      .metadata()
      .extend({ picture: zc.string() });
    expect(schema.parse({ picture: "not-a-url", custom: 1 })).toEqual({
      picture: "not-a-url",
      custom: 1,
    });
  });

  it("mini: z.extend() replaces a field and keeps unknown keys", () => {
    const schema = zm.extend(miniZostr.nip01.metadata(), {
      picture: zm.string(),
    });
    expect(zm.parse(schema, { picture: "not-a-url", custom: 1 })).toEqual({
      picture: "not-a-url",
      custom: 1,
    });
  });
});

describe("ProfileMetadata type", () => {
  it("has optional known fields and an unknown-typed catchall", () => {
    expectTypeOf<ProfileMetadata["name"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ProfileMetadata["bot"]>().toEqualTypeOf<boolean | undefined>();
    const p = {} as ProfileMetadata;
    expectTypeOf(p.someUnknownKey).toEqualTypeOf<unknown>();
  });

  it("is identical across the classic and mini entry points", () => {
    expectTypeOf<ProfileMetadata>().toEqualTypeOf<MiniProfileMetadata>();
  });

  it("is the output of metadata() and metadataContent() in both flavors", () => {
    expectTypeOf<
      zc.output<ReturnType<typeof classicZostr.nip01.metadata>>
    >().toEqualTypeOf<ProfileMetadata>();
    expectTypeOf<
      zc.output<ReturnType<typeof classicZostr.nip01.metadataContent>>
    >().toEqualTypeOf<ProfileMetadata>();
    expectTypeOf<
      zc.output<ReturnType<typeof miniZostr.nip01.metadata>>
    >().toEqualTypeOf<ProfileMetadata>();
    expectTypeOf<
      zc.output<ReturnType<typeof miniZostr.nip01.metadataContent>>
    >().toEqualTypeOf<ProfileMetadata>();
  });

  it("is reached from a string input via metadataContent()", () => {
    expectTypeOf<
      zc.input<ReturnType<typeof classicZostr.nip01.metadataContent>>
    >().toEqualTypeOf<string>();
    expectTypeOf<
      zc.input<ReturnType<typeof miniZostr.nip01.metadataContent>>
    >().toEqualTypeOf<string>();
  });
});
