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
  "zostr.nip45.clientMessage.count() ($name)",
  ({ zostr, z }) => {
    it("validates a NIP-45 COUNT request tuple", () => {
      expect(
        z.parse(zostr.nip45.clientMessage.count(), [
          "COUNT",
          "sub1",
          { kinds: [1] },
          {},
        ]),
      ).toBeTruthy();
      // Count-everything sends a single empty {} filter.
      expect(
        z.parse(zostr.nip45.clientMessage.count(), ["COUNT", "sub1", {}]),
      ).toBeTruthy();
    });

    it.each<[string, unknown[]]>([
      ["a missing filter (at least one required)", ["COUNT", "sub1"]],
      ["the wrong verb", ["REQ", "sub1"]],
      ["an empty subscription id", ["COUNT", "", {}]],
      // Filters are still validated (unknown filter key rejected).
      ["an unknown filter key", ["COUNT", "sub1", { foo: ["x"] }]],
      // NIP-45's HLL section counts by "#e"/"#p", whose values NIP-01 fixes to
      // 64-character lowercase hex.
      ['a malformed "#e" value', ["COUNT", "sub1", { "#e": ["not-hex"] }]],
    ])("rejects %s", (_label, message) => {
      expect(
        z.safeParse(zostr.nip45.clientMessage.count(), message).success,
      ).toBe(false);
    });
  },
);

describe.each(FLAVORS)("zostr.nip45 COUNT response ($name)", ({ zostr, z }) => {
  it("relayMessage.count() validates a COUNT response tuple", () => {
    expect(
      z.parse(zostr.nip45.relayMessage.count(), [
        "COUNT",
        "sub1",
        { count: 0 },
      ]),
    ).toBeTruthy();
    expect(
      z.parse(zostr.nip45.relayMessage.count(), [
        "COUNT",
        "sub1",
        { count: 2044, approximate: true, hll: "0".repeat(512) },
      ]),
    ).toBeTruthy();
  });

  it("count() accepts a non-negative integer count", () => {
    expect(z.parse(zostr.nip45.count(), { count: 42 })).toEqual({ count: 42 });
  });

  it.each<[string, unknown]>([
    ["a negative count", { count: -1 }],
    ["a fractional count", { count: 1.5 }],
    ["a NaN count", { count: Number.NaN }],
    ["a missing count", {}],
    // The COUNT response body is a fixed shape: unknown keys are rejected.
    ["an unknown key", { count: 1, extra: true }],
  ])("count() rejects %s", (_label, body) => {
    expect(z.safeParse(zostr.nip45.count(), body).success).toBe(false);
  });

  // hll is a 512-char hex string (256 uint8 registers); NIP-45 doesn't mandate
  // lowercase, so upper/mixed case is accepted.
  it.each(["A".repeat(512), "aF".repeat(256)])(
    "count() accepts the 512-char hll %s...",
    (hll) => {
      expect(z.parse(zostr.nip45.count(), { count: 1, hll })).toBeTruthy();
    },
  );

  it.each([
    ["too short", "0".repeat(511)],
    ["non-hex", "z".repeat(512)],
  ])("count() rejects a %s hll", (_label, hll) => {
    expect(z.safeParse(zostr.nip45.count(), { count: 1, hll }).success).toBe(
      false,
    );
  });

  it("an embedded count body rejects unknown keys at runtime", () => {
    expect(
      z.safeParse(zostr.nip45.relayMessage.count(), [
        "COUNT",
        "sub",
        { count: 1, extra: true },
      ]).success,
    ).toBe(false);
  });
});

describe("zostr.nip45 output types", () => {
  it("infers a numeric count and optional approximate/kinds (classic)", () => {
    const res = classicZostr.nip45.relayMessage
      .count()
      .parse(["COUNT", "sub1", { count: 5 }]);
    expectTypeOf(res[2].count).toEqualTypeOf<number>();
    expectTypeOf(res[2].approximate).toEqualTypeOf<boolean | undefined>();

    const req = classicZostr.nip45.clientMessage
      .count()
      .parse(["COUNT", "sub1", { kinds: [1] }]);
    // req[2] is the required first filter (non-optional).
    expectTypeOf(req[2].kinds).toEqualTypeOf<number[] | undefined>();

    // @ts-expect-error embedded count body output is strict
    res[2].extension;
  });

  it("infers a numeric count and optional approximate/kinds (mini)", () => {
    const res = zm.parse(miniZostr.nip45.relayMessage.count(), [
      "COUNT",
      "sub1",
      { count: 5 },
    ]);
    expectTypeOf(res[2].count).toEqualTypeOf<number>();
    expectTypeOf(res[2].approximate).toEqualTypeOf<boolean | undefined>();

    const req = zm.parse(miniZostr.nip45.clientMessage.count(), [
      "COUNT",
      "sub1",
      { kinds: [1] },
    ]);
    expectTypeOf(req[2].kinds).toEqualTypeOf<number[] | undefined>();

    // @ts-expect-error embedded count body output is strict
    res[2].extension;
  });
});
