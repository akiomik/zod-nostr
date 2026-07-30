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
const PROTECTED_TAG = ["-"];

const eventWith = (pubkey: string, tags: string[][]) => ({
  id: HEX64,
  pubkey,
  created_at: 0,
  kind: 1,
  tags,
  content: "",
  sig: HEX128,
});

describe.each(FLAVORS)("zostr.nip70.protectedTag ($name)", ({ zostr, z }) => {
  it("accepts the canonical single-element tag", () => {
    expect(z.parse(zostr.nip70.protectedTag(), ["-"])).toEqual(["-"]);
  });

  it("rejects a wrong tag name and a second element (fixed single-element tuple)", () => {
    // A different name isn't the protected marker.
    expect(z.safeParse(zostr.nip70.protectedTag(), ["p"]).success).toBe(false);
    // The marker carries no value, so it is a fixed single-element tuple.
    expect(z.safeParse(zostr.nip70.protectedTag(), ["-", "x"]).success).toBe(
      false,
    );
    // An empty tag has no name at all.
    expect(z.safeParse(zostr.nip70.protectedTag(), []).success).toBe(false);
  });
});

describe.each(FLAVORS)("zostr.nip70.protectedCheck ($name)", ({ zostr, z }) => {
  const AUTHOR = "b".repeat(64);
  const OTHER = "c".repeat(64);
  const withAuth = (pubkeys: readonly string[]) =>
    zostr.event().check(zostr.nip70.protectedCheck(pubkeys));

  it("passes a protected event whose author is authenticated", () => {
    expect(
      z.parse(withAuth([AUTHOR]), eventWith(AUTHOR, [PROTECTED_TAG])),
    ).toBeTruthy();
  });

  it("accepts any of several authenticated pubkeys (NIP-42 multi-auth)", () => {
    // NIP-42 lets one connection authenticate several pubkeys; a protected event
    // from any of them is publishable.
    const check = withAuth([OTHER, AUTHOR]);
    expect(z.parse(check, eventWith(AUTHOR, [PROTECTED_TAG]))).toBeTruthy();
    expect(z.parse(check, eventWith(OTHER, [PROTECTED_TAG]))).toBeTruthy();
  });

  it("fails a protected event whose author is not authenticated", () => {
    expect(
      z.safeParse(withAuth([OTHER]), eventWith(AUTHOR, [PROTECTED_TAG]))
        .success,
    ).toBe(false);
  });

  it("fails a protected event on an unauthenticated connection (empty/omitted set)", () => {
    // The default `[]` means no pubkey is authenticated → NIP-70's default reject.
    expect(
      z.safeParse(withAuth([]), eventWith(AUTHOR, [PROTECTED_TAG])).success,
    ).toBe(false);
    expect(
      z.safeParse(
        zostr.event().check(zostr.nip70.protectedCheck()),
        eventWith(AUTHOR, [PROTECTED_TAG]),
      ).success,
    ).toBe(false);
  });

  it("passes a non-protected event regardless of authentication", () => {
    // No `["-"]` tag → no author restriction, even with an empty auth set.
    expect(z.parse(withAuth([]), eventWith(AUTHOR, []))).toBeTruthy();
    expect(
      z.parse(withAuth([]), eventWith(AUTHOR, [["e", HEX64]])),
    ).toBeTruthy();
    // An unrelated author is fine too when the event isn't protected.
    expect(z.parse(withAuth([OTHER]), eventWith(AUTHOR, []))).toBeTruthy();
  });

  it("detects protection even from a malformed marker (no authorization bypass)", () => {
    // `protectedCheck` treats any `"-"`-led tag as a marker, even a malformed
    // `["-", "x"]` that `protectedTag()` rejects — otherwise appending junk to
    // the marker would bypass the author check. So it still fails when the author
    // is unauthenticated / mismatched.
    expect(
      z.safeParse(withAuth([]), eventWith(AUTHOR, [["-", "x"]])).success,
    ).toBe(false);
    expect(
      z.safeParse(withAuth([OTHER]), eventWith(AUTHOR, [["-", "x"]])).success,
    ).toBe(false);
    // ...and passes when that author is authenticated (still recognized as protected).
    expect(
      z.parse(withAuth([AUTHOR]), eventWith(AUTHOR, [["-", "x"]])),
    ).toBeTruthy();
  });

  it("recognizes a protected marker alongside other tags", () => {
    expect(
      z.safeParse(
        withAuth([]),
        eventWith(AUTHOR, [["e", HEX64], PROTECTED_TAG, ["p", HEX64]]),
      ).success,
    ).toBe(false);
  });

  it("reports a single issue for a rejected protected event", () => {
    const result = z.safeParse(
      withAuth([OTHER]),
      eventWith(AUTHOR, [PROTECTED_TAG]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
    }
  });

  it("composes with signatureCheck on a real signed protected event", () => {
    // End-to-end: a genuinely signed kind:1 event carrying `["-"]`, authorized
    // for its own author. The check runs after structure + signature validation.
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const signed = finalizeEvent(
      { kind: 1, created_at: 0, tags: [PROTECTED_TAG], content: "protected" },
      sk,
    );
    const verified = zostr
      .event()
      .check(zostr.signatureCheck())
      .check(zostr.nip70.protectedCheck([pk]));
    expect(z.parse(verified, signed)).toBeTruthy();

    // Same signed event, but the author isn't in the authenticated set → rejected.
    expect(
      z.safeParse(
        zostr
          .event()
          .check(zostr.signatureCheck())
          .check(zostr.nip70.protectedCheck([])),
        signed,
      ).success,
    ).toBe(false);
  });
});

// The check is one shared object across both flavors (direct reference), so
// classic covers these untyped-JS-path guards: a consumer's own loosely-typed
// event schema can carry values the strict event() would reject at base parse.
describe("zostr.nip70.protectedCheck input validation", () => {
  const looseEvent = zc.object({
    id: zc.string(),
    pubkey: zc.any(),
    created_at: zc.number(),
    kind: zc.number(),
    // `any` lets non-array / non-string tags reach the untyped JS runtime path.
    tags: zc.any(),
    content: zc.string(),
    sig: zc.string(),
  });
  const AUTHOR = "b".repeat(64);
  const check = looseEvent.check(classicZostr.nip70.protectedCheck([AUTHOR]));
  const base = {
    id: HEX64,
    created_at: 0,
    kind: 1,
    content: "",
    sig: HEX128,
  };

  it("fails (does not throw) when tags is not an array", () => {
    const result = check.safeParse({
      ...base,
      pubkey: AUTHOR,
      tags: "not-an-array",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('"tags"');
  });

  it("skips (does not throw) a non-array tag element", () => {
    // A null tag can't be a protected marker; the check must guard
    // `Array.isArray` before indexing, so a null-tag event with no real marker
    // passes rather than throwing.
    const result = check.safeParse({
      ...base,
      pubkey: AUTHOR,
      tags: [null, ["e", HEX64]],
    });
    expect(result.success).toBe(true);
  });

  it("fails a protected event whose pubkey is not a string", () => {
    // A non-string pubkey can never be an authenticated pubkey; a protected
    // event with one is rejected, not throwing on the Set lookup.
    const result = check.safeParse({
      ...base,
      pubkey: Symbol("bad"),
      tags: [["-"]],
    });
    expect(result.success).toBe(false);
  });
});

describe("zostr.nip70 output types", () => {
  it("infers the protected marker literal tuple (classic)", () => {
    const tag = classicZostr.nip70.protectedTag().parse(["-"]);
    expectTypeOf(tag).toEqualTypeOf<["-"]>();
    expectTypeOf(tag[0]).toEqualTypeOf<"-">();
  });

  it("infers the protected marker literal tuple (mini)", () => {
    const tag = zm.parse(miniZostr.nip70.protectedTag(), ["-"]);
    expectTypeOf(tag).toEqualTypeOf<["-"]>();
    expectTypeOf(tag[0]).toEqualTypeOf<"-">();
  });
});
