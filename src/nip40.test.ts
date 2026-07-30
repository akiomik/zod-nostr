import { describe, expect, expectTypeOf, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

const HEX64 = "a".repeat(64);
const HEX128 = "a".repeat(128);

const eventWith = (tags: string[][]) => ({
  id: HEX64,
  pubkey: HEX64,
  created_at: 0,
  kind: 1,
  tags,
  content: "",
  sig: HEX128,
});

describe.each(FLAVORS)("zostr.nip40.expirationTag ($name)", ({ zostr, z }) => {
  it("accepts the canonical two-element tag", () => {
    expect(
      z.parse(zostr.nip40.expirationTag(), ["expiration", "1700000000"]),
    ).toEqual(["expiration", "1700000000"]);
  });

  it("validates the value as an integer unix-seconds string", () => {
    // Accepts "0", negatives, and leading-zero decimals — NIP-40 gives the same
    // format as created_at (integer, no bound) and defines no canonical
    // encoding, so "007" must not be rejected. Non-numeric, fractional, and
    // empty values are rejected.
    for (const ok of ["0", "-5", "007", "1700000000"]) {
      expect(
        z.safeParse(zostr.nip40.expirationTag(), ["expiration", ok]).success,
      ).toBe(true);
    }
    for (const bad of ["abc", "1.5", ""]) {
      expect(
        z.safeParse(zostr.nip40.expirationTag(), ["expiration", bad]).success,
      ).toBe(false);
    }
  });

  it("rejects a wrong tag name, a missing value, and a third element (fixed tuple)", () => {
    expect(
      z.safeParse(zostr.nip40.expirationTag(), ["exp", "1700000000"]).success,
    ).toBe(false);
    expect(
      z.safeParse(zostr.nip40.expirationTag(), ["expiration"]).success,
    ).toBe(false);
    expect(
      z.safeParse(zostr.nip40.expirationTag(), ["expiration", "1", "x"])
        .success,
    ).toBe(false);
  });
});

describe.each(FLAVORS)(
  "zostr.nip40.expirationCheck ($name)",
  ({ zostr, z }) => {
    const withExpiration = (now: number) =>
      zostr.event().check(zostr.nip40.expirationCheck(now));

    it("passes a future expiration and fails an expired one (boundary inclusive)", () => {
      const ev = (ts: string) => eventWith([["expiration", ts]]);
      // now = 1000: 1001 is in the future (passes), 1000 is exactly now and 999
      // is past (both expired, `<=`).
      expect(z.parse(withExpiration(1000), ev("1001"))).toBeTruthy();
      expect(z.safeParse(withExpiration(1000), ev("1000")).success).toBe(false);
      expect(z.safeParse(withExpiration(1000), ev("999")).success).toBe(false);
    });

    it("passes an event with no expiration tag (no expiry)", () => {
      expect(z.parse(withExpiration(1000), eventWith([]))).toBeTruthy();
      expect(
        z.parse(withExpiration(1000), eventWith([["e", HEX64]])),
      ).toBeTruthy();
    });

    it("fails a malformed expiration value (not silently treated as no-expiry)", () => {
      for (const bad of ["abc", "1.5", ""]) {
        expect(
          z.safeParse(withExpiration(1000), eventWith([["expiration", bad]]))
            .success,
        ).toBe(false);
      }
      // A bare tag with no value is malformed too.
      expect(
        z.safeParse(withExpiration(1000), eventWith([["expiration"]])).success,
      ).toBe(false);
    });

    it("inspects every expiration tag and fails on the earliest expiry, regardless of order", () => {
      // now = 1000, one future (2000) and one past (500) tag: expired either way.
      expect(
        z.safeParse(
          withExpiration(1000),
          eventWith([
            ["expiration", "2000"],
            ["expiration", "500"],
          ]),
        ).success,
      ).toBe(false);
      // Reversed order — same verdict (order-independent).
      expect(
        z.safeParse(
          withExpiration(1000),
          eventWith([
            ["expiration", "500"],
            ["expiration", "2000"],
          ]),
        ).success,
      ).toBe(false);
      // Both in the future: passes.
      expect(
        z.parse(
          withExpiration(1000),
          eventWith([
            ["expiration", "2000"],
            ["expiration", "3000"],
          ]),
        ),
      ).toBeTruthy();
    });

    it("reports a single issue even when several expiration tags are expired", () => {
      // The verdict is one pass/fail, so multiple expired tags must not emit a
      // duplicate issue per tag.
      const result = z.safeParse(
        withExpiration(1000),
        eventWith([
          ["expiration", "100"],
          ["expiration", "200"],
          ["expiration", "300"],
        ]),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toHaveLength(1);
      }
    });

    it("compares beyond Number.MAX_SAFE_INTEGER exactly (BigInt, not rounded)", () => {
      // now = 2^53, expiration = 2^53 + 1: the event is NOT expired, but
      // Number("9007199254740993") rounds to 2^53 === now, which a Number
      // comparison would wrongly call expired. BigInt keeps it exact.
      const now = 9007199254740992; // 2^53
      expect(
        z.parse(
          withExpiration(now),
          eventWith([["expiration", "9007199254740993"]]), // 2^53 + 1
        ),
      ).toBeTruthy();
    });

    it("handles a fractional now against integer timestamps", () => {
      const ev = (ts: string) => eventWith([["expiration", ts]]);
      expect(z.parse(withExpiration(1000.5), ev("1001"))).toBeTruthy();
      expect(z.safeParse(withExpiration(1000.5), ev("1000")).success).toBe(
        false,
      );
    });

    it.each([
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
    ])("throws on a non-finite now (%s), failing closed", (_label, now) => {
      // A non-finite `now` would make the comparison behave unpredictably; the
      // factory rejects it at composition time instead.
      expect(() => zostr.nip40.expirationCheck(now)).toThrow();
    });
  },
);

// The check is one shared object across both flavors (direct reference), so
// classic covers these untyped-JS-path guards: a consumer's own loosely-typed
// event schema can carry values the strict event() would reject at base parse.
describe("zostr.nip40.expirationCheck input validation", () => {
  const looseEvent = zc.object({
    id: zc.string(),
    pubkey: zc.string(),
    created_at: zc.number(),
    kind: zc.number(),
    // `any` lets non-array / non-string tags reach the untyped JS runtime path.
    tags: zc.any(),
    content: zc.string(),
    sig: zc.string(),
  });

  const check = looseEvent.check(classicZostr.nip40.expirationCheck(1000));

  it("fails (does not throw) when tags is not an array", () => {
    const result = check.safeParse({
      id: HEX64,
      pubkey: HEX64,
      created_at: 0,
      kind: 1,
      tags: "not-an-array",
      content: "",
      sig: HEX128,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('"tags"');
  });

  it("skips (does not throw) a non-array tag element", () => {
    // A null tag is not an expiration tag; the check must guard `Array.isArray`
    // before indexing, so it passes (no expiration) rather than throwing.
    const result = check.safeParse({
      id: HEX64,
      pubkey: HEX64,
      created_at: 0,
      kind: 1,
      tags: [null],
      content: "",
      sig: HEX128,
    });
    expect(result.success).toBe(true);
  });

  it("fails (does not throw) on a non-string expiration value", () => {
    // A Symbol value would throw if passed to RegExp.test; the typeof guard must
    // catch it first and report a malformed expiration.
    const result = check.safeParse({
      id: HEX64,
      pubkey: HEX64,
      created_at: 0,
      kind: 1,
      tags: [["expiration", Symbol("bad")]],
      content: "",
      sig: HEX128,
    });
    expect(result.success).toBe(false);
  });
});

describe("zostr.nip40 output types", () => {
  it("infers the expiration tag literal and a string timestamp (classic)", () => {
    const tag = classicZostr.nip40
      .expirationTag()
      .parse(["expiration", "1700000000"]);
    expectTypeOf(tag[0]).toEqualTypeOf<"expiration">();
    expectTypeOf(tag[1]).toEqualTypeOf<string>();
  });

  it("infers the expiration tag literal and a string timestamp (mini)", () => {
    const tag = zm.parse(miniZostr.nip40.expirationTag(), [
      "expiration",
      "1700000000",
    ]);
    expectTypeOf(tag[0]).toEqualTypeOf<"expiration">();
    expectTypeOf(tag[1]).toEqualTypeOf<string>();
  });
});
