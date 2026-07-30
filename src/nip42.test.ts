import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

const RELAY = "wss://relay.example.com/";
const CHALLENGE = "challengestringhere";

const authEvent = (createdAt: number) =>
  finalizeEvent(
    {
      kind: 22242,
      created_at: createdAt,
      tags: [
        ["relay", RELAY],
        ["challenge", CHALLENGE],
      ],
      content: "",
    },
    generateSecretKey(),
  );

describe.each(FLAVORS)("zostr.nip42 AUTH messages ($name)", ({ zostr, z }) => {
  it("authEvent() enforces kind === 22242", () => {
    const sk = generateSecretKey();
    const auth = finalizeEvent(
      { kind: 22242, created_at: 0, tags: [["challenge", "abc"]], content: "" },
      sk,
    );
    const wrongKind = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );

    expect(z.parse(zostr.nip42.authEvent(), auth)).toBeTruthy();
    expect(z.safeParse(zostr.nip42.authEvent(), wrongKind).success).toBe(false);
  });

  it("authEvent() rejects unknown keys (fixed event shape)", () => {
    const auth = authEvent(0);
    expect(
      z.safeParse(zostr.nip42.authEvent(), { ...auth, extra: "x" }).success,
    ).toBe(false);
  });

  it("relayMessage.auth()/clientMessage.auth() validate AUTH tuples", () => {
    const auth = authEvent(0);

    expect(
      z.parse(zostr.nip42.relayMessage.auth(), ["AUTH", CHALLENGE]),
    ).toBeTruthy();
    expect(
      z.parse(zostr.nip42.clientMessage.auth(), ["AUTH", auth]),
    ).toBeTruthy();

    // The two directions carry different payloads (string vs. event) and don't
    // validate as each other.
    expect(
      z.safeParse(zostr.nip42.clientMessage.auth(), ["AUTH", CHALLENGE])
        .success,
    ).toBe(false);
    expect(
      z.safeParse(zostr.nip42.relayMessage.auth(), ["AUTH", auth]).success,
    ).toBe(false);
    // clientMessage.auth rejects a non-22242 event.
    const note = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      generateSecretKey(),
    );
    expect(
      z.safeParse(zostr.nip42.clientMessage.auth(), ["AUTH", note]).success,
    ).toBe(false);
  });
});

describe.each(FLAVORS)("zostr.nip42 opt-in checks ($name)", ({ zostr, z }) => {
  it("verify signature, challenge/relay tags, and created_at recency together", () => {
    const now = Math.floor(Date.now() / 1000);
    const auth = authEvent(now);

    const verified = zostr.nip42
      .authEvent()
      .check(zostr.signatureCheck())
      .check(zostr.nip42.challengeTagCheck(CHALLENGE))
      .check(zostr.nip42.relayTagCheck(RELAY))
      .check(zostr.nip42.createdAtCheck(now));
    expect(z.parse(verified, auth)).toBeTruthy();

    // Wrong challenge / relay each fail their check.
    expect(
      z.safeParse(
        zostr.nip42.authEvent().check(zostr.nip42.challengeTagCheck("nope")),
        auth,
      ).success,
    ).toBe(false);
    expect(
      z.safeParse(
        zostr.nip42
          .authEvent()
          .check(zostr.nip42.relayTagCheck("wss://other.example.com/")),
        auth,
      ).success,
    ).toBe(false);
  });

  it("createdAtCheck() enforces an inclusive ±600s window (both directions)", () => {
    const now = Math.floor(Date.now() / 1000);
    const auth = authEvent(now);
    const check = (n: number) =>
      zostr.nip42.authEvent().check(zostr.nip42.createdAtCheck(n));

    // Just outside the default 600s window fails, in both directions (Math.abs).
    expect(z.safeParse(check(now + 601), auth).success).toBe(false);
    expect(z.safeParse(check(now - 601), auth).success).toBe(false);
    // The boundary is inclusive: exactly ±600s passes.
    expect(z.parse(check(now + 600), auth)).toBeTruthy();
    expect(z.parse(check(now - 600), auth)).toBeTruthy();
  });

  it.each([
    ["a NaN now", () => zostr.nip42.createdAtCheck(Number.NaN)],
    ["a NaN tolerance", () => zostr.nip42.createdAtCheck(1000, Number.NaN)],
    [
      "an Infinite tolerance",
      () => zostr.nip42.createdAtCheck(1000, Number.POSITIVE_INFINITY),
    ],
    ["a negative tolerance", () => zostr.nip42.createdAtCheck(1000, -1)],
  ])(
    "createdAtCheck() throws on %s (fails closed, not open)",
    (_label, make) => {
      // A NaN/Infinity/negative bound would make Math.abs(...) > tol always
      // false, silently accepting every timestamp — the factory rejects it.
      expect(make).toThrow();
    },
  );

  it("challengeTagCheck() throws on a non-string expected value (fails closed, not open)", () => {
    // A non-string (e.g. undefined on the untyped JS path) would let an auth
    // event carrying no challenge tag compare `undefined !== undefined` and
    // silently pass, disabling the check — the factory rejects it instead.
    // @ts-expect-error — undefined violates the `string` param
    expect(() => zostr.nip42.challengeTagCheck(undefined)).toThrow();
  });

  it("relayTagCheck() throws on a non-string expected value (fails closed, not open)", () => {
    // @ts-expect-error — undefined violates the `string` param
    expect(() => zostr.nip42.relayTagCheck(undefined)).toThrow();
  });
});

// The tag checks share one object across both flavors (direct reference), so
// classic covers these untyped-JS-path guards: a consumer's own loose schema can
// feed a non-array `tags` or a null tag element that the strict authEvent()
// would reject at base parse. They must fail closed (mismatch) without throwing.
describe("zostr.nip42 tag checks input validation (untyped JS path)", () => {
  const looseEvent = zc.object({
    id: zc.string(),
    pubkey: zc.string(),
    created_at: zc.number(),
    kind: zc.number(),
    tags: zc.any(),
    content: zc.string(),
    sig: zc.string(),
  });
  const base = {
    id: "a".repeat(64),
    pubkey: "a".repeat(64),
    created_at: 0,
    kind: 22242,
    content: "",
    sig: "a".repeat(128),
  };
  const challengeCheck = looseEvent.check(
    classicZostr.nip42.challengeTagCheck(CHALLENGE),
  );

  it("challengeTagCheck fails (does not throw) with the shared malformed-tags message when tags is not an array", () => {
    // A non-array tags is a malformed event, reported with the canonical
    // message via guardEventTags — the same as nip10/nip40/nip70, not a
    // misleading challenge-mismatch message.
    const result = challengeCheck.safeParse({ ...base, tags: "nope" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('"tags"');
  });

  it("challengeTagCheck skips a null tag element and still matches a later challenge tag", () => {
    // A null tag can't be a challenge tag; isNamedTag guards it, so `.find`
    // reaches the real challenge tag after it rather than throwing on the null.
    expect(
      challengeCheck.safeParse({
        ...base,
        tags: [null, ["challenge", CHALLENGE]],
      }).success,
    ).toBe(true);
  });

  it("challengeTagCheck fails (does not throw) on a non-string challenge value", () => {
    // A Symbol/number value can't equal the expected string; the comparison
    // fails closed rather than coercing (and throwing).
    expect(
      challengeCheck.safeParse({ ...base, tags: [["challenge", Symbol("x")]] })
        .success,
    ).toBe(false);
  });

  it("relayTagCheck fails (does not throw) with the shared malformed-tags message when tags is not an array", () => {
    const relayCheck = looseEvent.check(
      classicZostr.nip42.relayTagCheck(RELAY),
    );
    const result = relayCheck.safeParse({ ...base, tags: 42 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('"tags"');
  });
});

describe("zostr.nip42 output types", () => {
  it("infers a challenge string and a literal 22242 kind (classic)", () => {
    const challenge = classicZostr.nip42.relayMessage
      .auth()
      .parse(["AUTH", "abc"]);
    expectTypeOf(challenge[1]).toEqualTypeOf<string>();

    const signed = finalizeEvent(
      { kind: 22242, created_at: 0, tags: [], content: "" },
      generateSecretKey(),
    );
    const auth = classicZostr.nip42.clientMessage
      .auth()
      .parse(["AUTH", signed]);
    expectTypeOf(auth[1].kind).toEqualTypeOf<22242>();
  });

  it("infers a challenge string and a literal 22242 kind (mini)", () => {
    const challenge = zm.parse(miniZostr.nip42.relayMessage.auth(), [
      "AUTH",
      "abc",
    ]);
    expectTypeOf(challenge[1]).toEqualTypeOf<string>();

    const signed = finalizeEvent(
      { kind: 22242, created_at: 0, tags: [], content: "" },
      generateSecretKey(),
    );
    const auth = zm.parse(miniZostr.nip42.clientMessage.auth(), [
      "AUTH",
      signed,
    ]);
    expectTypeOf(auth[1].kind).toEqualTypeOf<22242>();
  });
});
