import { describe, expect, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

// `jsonCodec(schema)` is a generic codec: JSON string <-> the schema's value.
// decode accepts any schema; encode requires a backward-encodable schema, and
// then applies JSON.stringify (surfacing only raw serialization errors and a
// top-level `undefined` as Zod issues — other JSON.stringify conversions apply
// as usual).
const FLAVORS = [
  {
    name: "classic",
    zostr: classicZostr,
    z: zc,
    oneWay: () => zc.string().transform((v) => v.length),
  },
  {
    name: "mini",
    zostr: miniZostr,
    z: zm,
    oneWay: () =>
      zm.pipe(
        zm.string(),
        zm.transform((v) => v.length),
      ),
  },
] as const;

describe.each(FLAVORS)("zostr.jsonCodec ($name)", ({ zostr, z, oneWay }) => {
  const codec = () => zostr.jsonCodec(z.object({ a: z.number() }));

  it("decodes a JSON string through the schema", () => {
    expect(z.decode(codec(), '{"a":1}')).toEqual({ a: 1 });
  });

  it("reports invalid JSON as an issue (does not throw)", () => {
    expect(z.safeDecode(codec(), "{not json").success).toBe(false);
  });

  it("reports a schema mismatch as an issue", () => {
    expect(z.safeDecode(codec(), '{"a":"x"}').success).toBe(false);
  });

  it("encodes a value back to a JSON string (roundtrip)", () => {
    expect(z.encode(codec(), { a: 1 })).toBe('{"a":1}');
  });

  it("surfaces a non-serializable value as an issue, not a raw throw", () => {
    // JSON.stringify throws on a BigInt; it must come back as a Zod failure.
    const bigintCodec = zostr.jsonCodec(z.bigint());
    expect(z.safeEncode(bigintCodec, 10n).success).toBe(false);
  });

  it("surfaces a circular reference as an issue, not a raw throw", () => {
    const anyCodec = zostr.jsonCodec(z.any());
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(z.safeEncode(anyCodec, cyclic).success).toBe(false);
  });

  it("surfaces a top-level undefined result as an issue", () => {
    const anyCodec = zostr.jsonCodec(z.any());
    expect(z.safeEncode(anyCodec, undefined).success).toBe(false);
  });

  it("applies JSON.stringify semantics to nested values (no preflight)", () => {
    // Nested `undefined` is dropped and NaN -> null, per JSON.stringify — the
    // codec deliberately does not reject or rewrite these.
    const anyCodec = zostr.jsonCodec(z.any());
    expect(
      z.encode(anyCodec, { missing: undefined, invalid: Number.NaN }),
    ).toBe('{"invalid":null}');
  });

  it("encode requires a backward-encodable schema (a one-way transform throws)", () => {
    // A one-way `.transform()` can't be encoded back; zod throws a
    // $ZodEncodeError *before* the JSON step, and jsonCodec does not (cannot)
    // convert it to an issue — even via safeEncode.
    const codec = zostr.jsonCodec(oneWay());
    expect(z.decode(codec, '"abc"')).toBe(3);
    expect(() => z.safeEncode(codec, 3)).toThrow();
  });
});
