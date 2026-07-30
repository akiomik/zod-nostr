import { minePow } from "nostr-tools/nip13";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
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

// Event fixtures with hand-crafted ids whose leading-zero-bit count is known
// (cross-checked against nostr-tools' getPow): each hex digit is 4 bits, so
// "008…" = 8 leading zero bits, "004…" = 9, "0000…" = 16.
const ID_0 = "f".repeat(64); // 0 leading zero bits
const ID_8 = `008${"f".repeat(61)}`; // 8
const ID_9 = `004${"f".repeat(61)}`; // 9
const ID_ALL_ZERO = "0".repeat(64); // 256 (every bit zero — the theoretical max)

const eventWith = (id: string, tags: string[][] = []) => ({
  id,
  pubkey: HEX64,
  created_at: 0,
  kind: 1,
  tags,
  content: "",
  sig: HEX128,
});

describe.each(FLAVORS)("zostr.nip13.nonceTag ($name)", ({ zostr, z }) => {
  it("accepts the canonical three-element tag", () => {
    expect(z.parse(zostr.nip13.nonceTag(), ["nonce", "776797", "20"])).toEqual([
      "nonce",
      "776797",
      "20",
    ]);
  });

  it("accepts a two-element tag (the target commitment is a SHOULD, so optional)", () => {
    expect(z.parse(zostr.nip13.nonceTag(), ["nonce", "776797"])).toEqual([
      "nonce",
      "776797",
    ]);
  });

  it("validates the committed target as a non-negative integer string", () => {
    // Accepts "0"; rejects non-numeric and non-canonical (leading-zero) decimals.
    expect(z.parse(zostr.nip13.nonceTag(), ["nonce", "1", "0"])).toBeTruthy();
    expect(
      z.safeParse(zostr.nip13.nonceTag(), ["nonce", "1", "abc"]).success,
    ).toBe(false);
    expect(
      z.safeParse(zostr.nip13.nonceTag(), ["nonce", "1", "-1"]).success,
    ).toBe(false);
    expect(
      z.safeParse(zostr.nip13.nonceTag(), ["nonce", "1", "05"]).success,
    ).toBe(false);
  });

  it("rejects a wrong tag name and a fourth element (fixed tuple)", () => {
    expect(
      z.safeParse(zostr.nip13.nonceTag(), ["e", "776797", "20"]).success,
    ).toBe(false);
    expect(
      z.safeParse(zostr.nip13.nonceTag(), ["nonce", "776797", "20", "x"])
        .success,
    ).toBe(false);
    // The nonce value must be present.
    expect(z.safeParse(zostr.nip13.nonceTag(), ["nonce"]).success).toBe(false);
  });
});

describe.each(FLAVORS)("zostr.nip13.powCheck ($name)", ({ zostr, z }) => {
  const withPow = (min: number) =>
    zostr.event().check(zostr.nip13.powCheck(min));

  it("passes when the id meets the difficulty, fails when it falls short", () => {
    // ID_8 has exactly 8 leading zero bits: >= 8 passes, >= 9 fails.
    expect(z.parse(withPow(8), eventWith(ID_8))).toBeTruthy();
    expect(z.safeParse(withPow(9), eventWith(ID_8)).success).toBe(false);
    // ID_9 clears the 9-bit bar.
    expect(z.parse(withPow(9), eventWith(ID_9))).toBeTruthy();
  });

  it("treats the boundary as inclusive and difficulty 0 as no requirement", () => {
    expect(z.parse(withPow(0), eventWith(ID_0))).toBeTruthy();
    expect(z.parse(withPow(8), eventWith(ID_8))).toBeTruthy(); // exactly 8
  });

  it("counts an all-zero id as the full 256 bits", () => {
    // Every nibble is zero, so the count spans the whole id (256 bits).
    expect(z.parse(withPow(256), eventWith(ID_ALL_ZERO))).toBeTruthy();
  });

  it("only inspects the id, not the nonce tag (achieved difficulty)", () => {
    // No nonce tag at all: powCheck still passes on a sufficiently-mined id.
    expect(z.parse(withPow(8), eventWith(ID_8, []))).toBeTruthy();
  });

  it("fails (does not throw) when composed on an id-less schema", () => {
    // TypeScript blocks composing an id-requiring check on an id-less schema
    // (powCheck expects a NostrEventLike). This @ts-expect-error exercises the
    // untyped JS consumer path: the base parse of eventTemplate() succeeds, so
    // the check runs with id === undefined and must return {success:false},
    // never throw (zod's safeParse contract).
    const schema = zostr
      .eventTemplate()
      // @ts-expect-error — id-less schema, simulating the untyped JS path
      .check(zostr.nip13.powCheck(8));
    const result = z.safeParse(schema, {
      kind: 1,
      created_at: 0,
      tags: [],
      content: "x",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["NaN", Number.NaN],
    ["a negative", -1],
    ["a fractional", 1.5],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("throws on %s minDifficulty (fails closed, not open)", (_label, min) => {
    // A bad threshold would make `count < min` always false, silently
    // accepting every event — the factory rejects it instead.
    expect(() => zostr.nip13.powCheck(min)).toThrow();
  });
});

describe.each(FLAVORS)(
  "zostr.nip13.commitmentCheck ($name)",
  ({ zostr, z }) => {
    const withCommitment = (min: number) =>
      zostr.event().check(zostr.nip13.commitmentCheck(min));

    it("passes when the committed target meets the requirement", () => {
      const ev = eventWith(ID_8, [["nonce", "1", "8"]]);
      expect(z.parse(withCommitment(8), ev)).toBeTruthy();
    });

    it("fails when the committed target is below the requirement", () => {
      // Even with a high achieved difficulty, a low commitment is rejected —
      // NIP-13's anti-spam guard.
      const lucky = eventWith(ID_9, [["nonce", "1", "4"]]);
      expect(z.safeParse(withCommitment(9), lucky).success).toBe(false);
    });

    it("fails when the commitment is missing (no target, or no nonce tag)", () => {
      expect(
        z.safeParse(withCommitment(8), eventWith(ID_8, [["nonce", "1"]]))
          .success,
      ).toBe(false);
      expect(z.safeParse(withCommitment(8), eventWith(ID_8, [])).success).toBe(
        false,
      );
    });

    it.each([
      ["NaN", Number.NaN],
      ["a negative", -1],
      ["a fractional", 1.5],
    ])("throws on %s minDifficulty (fails closed)", (_label, min) => {
      expect(() => zostr.nip13.commitmentCheck(min)).toThrow();
    });
  },
);

describe.each(FLAVORS)("zostr.nip13 end-to-end ($name)", ({ zostr, z }) => {
  it("validates a real mined, signed event (signature + achieved + committed)", () => {
    const difficulty = 8;
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const mined = minePow(
      { pubkey, kind: 1, created_at: 0, tags: [], content: "pow" },
      difficulty,
    );
    // Re-sign the mined (unsigned) event; finalizeEvent recomputes the same id
    // from the identical fields and adds a valid signature.
    const signed = finalizeEvent(
      {
        kind: mined.kind,
        created_at: mined.created_at,
        tags: mined.tags,
        content: mined.content,
      },
      sk,
    );

    // The nonce tag minePow writes validates against nonceTag().
    const nonce = signed.tags.find((tag) => tag[0] === "nonce");
    expect(z.parse(zostr.nip13.nonceTag(), nonce)).toBeTruthy();

    const verified = zostr
      .event()
      .check(zostr.signatureCheck())
      .check(zostr.nip13.powCheck(difficulty))
      .check(zostr.nip13.commitmentCheck(difficulty));
    expect(z.parse(verified, signed)).toBeTruthy();
  });
});

describe("zostr.nip13 output types", () => {
  it("infers the nonce tag literal and an optional target (classic)", () => {
    const tag = classicZostr.nip13.nonceTag().parse(["nonce", "1", "8"]);
    expectTypeOf(tag[0]).toEqualTypeOf<"nonce">();
    expectTypeOf(tag[1]).toEqualTypeOf<string>();
    expectTypeOf(tag[2]).toEqualTypeOf<string | undefined>();
  });

  it("infers the nonce tag literal and an optional target (mini)", () => {
    const tag = zm.parse(miniZostr.nip13.nonceTag(), ["nonce", "1", "8"]);
    expectTypeOf(tag[0]).toEqualTypeOf<"nonce">();
    expectTypeOf(tag[1]).toEqualTypeOf<string>();
    expectTypeOf(tag[2]).toEqualTypeOf<string | undefined>();
  });
});
