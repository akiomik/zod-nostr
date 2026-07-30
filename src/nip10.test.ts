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

const ID = "a".repeat(64);
const PK = "b".repeat(64);

const VALID_QTAG_COORDS = [
  // addressable (30000..39999) with any identifier
  `30023:${PK}:slug`,
  `30023:${PK}:`,
  // normal replaceable (0, 3, 10000..19999) only with an empty identifier
  `0:${PK}:`,
  `3:${PK}:`,
  `10002:${PK}:`,
];
const INVALID_QTAG_COORDS: [string, string][] = [
  ["non-hex pubkey", "30023:nothex:d"],
  ["regular kind", `1:${PK}:`],
  ["ephemeral kind", `20000:${PK}:`],
  ["above the addressable range", `40000:${PK}:`],
  ["replaceable with a non-empty identifier", `10002:${PK}:unexpected`],
];

describe.each(FLAVORS)("zostr.nip10 tags ($name)", ({ zostr, z }) => {
  it("textNote() enforces kind === 1", () => {
    const sk = generateSecretKey();
    const note = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );
    const reaction = finalizeEvent(
      { kind: 7, created_at: 0, tags: [], content: "+" },
      sk,
    );

    expect(z.parse(zostr.nip10.textNote(), note)).toBeTruthy();
    expect(z.safeParse(zostr.nip10.textNote(), reaction).success).toBe(false);
  });

  it.each([
    ["relay present-but-empty, marker + pubkey omitted", ["e", ID, ""]],
    ["relay + root marker", ["e", ID, "wss://r", "root"]],
    ["relay + reply marker + pubkey", ["e", ID, "wss://r", "reply", PK]],
    // unmarked ("" placeholder) reference carrying a pubkey — the marked
    // scheme's positional way to cite (mention) without a root/reply marker
    ["unmarked placeholder + pubkey", ["e", ID, "wss://r", "", PK]],
  ])("eTag() accepts %s", (_label, tag) => {
    expect(z.parse(zostr.nip10.eTag(), tag)).toBeTruthy();
  });

  it.each([
    ["a bad marker", ["e", ID, "wss://r", "mention"]],
    ["a non-hex id", ["e", "nothex", ""]],
    ["a missing relay position", ["e", ID]],
    ["an extra trailing element", ["e", ID, "wss://r", "root", PK, "x"]],
  ])("eTag() rejects %s", (_label, tag) => {
    expect(z.safeParse(zostr.nip10.eTag(), tag).success).toBe(false);
  });

  it("qTag() accepts a regular-event reference (64-hex id, optional author)", () => {
    expect(z.parse(zostr.nip10.qTag(), ["q", ID, ""])).toBeTruthy();
    expect(z.parse(zostr.nip10.qTag(), ["q", ID, "wss://r", PK])).toBeTruthy();
  });

  it.each(VALID_QTAG_COORDS)(
    "qTag() accepts the event-address coordinate %s",
    (coord) => {
      expect(z.parse(zostr.nip10.qTag(), ["q", coord, "wss://r"])).toBeTruthy();
    },
  );

  it.each([
    ["garbage", ["q", "garbage", ""]],
    ["an empty reference", ["q", "", ""]],
    ["a missing relay position", ["q", ID]],
    // a coordinate must not carry a trailing pubkey (that's for regular events)
    [
      "a coordinate with a trailing pubkey",
      ["q", `30023:${PK}:slug`, "wss://r", PK],
    ],
  ])("qTag() rejects %s", (_label, tag) => {
    expect(z.safeParse(zostr.nip10.qTag(), tag).success).toBe(false);
  });

  it.each(INVALID_QTAG_COORDS)(
    "qTag() rejects the malformed / non-addressable coordinate (%s)",
    (_label, coord) => {
      expect(z.safeParse(zostr.nip10.qTag(), ["q", coord, ""]).success).toBe(
        false,
      );
    },
  );
});

describe.each(FLAVORS)("zostr.nip10 opt-in checks ($name)", ({ zostr, z }) => {
  const note = (tags: string[][]) =>
    finalizeEvent(
      { kind: 1, created_at: 0, tags, content: "hi" },
      generateSecretKey(),
    );

  it("threadCheck() accepts a single root + single reply (positional e and non-e tags ignored)", () => {
    const checked = zostr.nip10.textNote().check(zostr.nip10.threadCheck());
    expect(
      z.parse(
        checked,
        note([
          ["e", ID, "", "root"],
          ["e", "c".repeat(64), "", "reply"],
          ["e", "d".repeat(64), ""],
          // A non-"e" tag is untouched by the marked-e-tag thread check.
          ["p", PK],
        ]),
      ),
    ).toBeTruthy();
  });

  it.each([
    ["an unknown/legacy marker", [["e", ID, "", "mention"]]],
    [
      "a duplicate root",
      [
        ["e", ID, "", "root"],
        ["e", "c".repeat(64), "", "root"],
      ],
    ],
    [
      "a duplicate reply",
      [
        ["e", ID, "", "reply"],
        ["e", "c".repeat(64), "", "reply"],
      ],
    ],
    [
      "reply-before-root ordering",
      [
        ["e", ID, "", "reply"],
        ["e", "c".repeat(64), "", "root"],
      ],
    ],
  ])("threadCheck() rejects %s", (_label, tags) => {
    const checked = zostr.nip10.textNote().check(zostr.nip10.threadCheck());
    expect(z.safeParse(checked, note(tags)).success).toBe(false);
  });

  it("participantsCheck() requires the expected p tags (presence-only)", () => {
    const a1 = "1".repeat(64);
    const p1 = "2".repeat(64);
    const checked = zostr.nip10
      .textNote()
      .check(zostr.nip10.participantsCheck([a1, p1]));

    // order/extras don't matter; a bare ["p"] tag (no pubkey) is ignored
    expect(
      z.parse(
        checked,
        note([["p", p1], ["p"], ["p", "9".repeat(64)], ["p", a1]]),
      ),
    ).toBeTruthy();
    expect(z.safeParse(checked, note([["p", a1]])).success).toBe(false);
  });
});

// The thread/participants checks share one object across both flavors (direct
// reference), so classic covers these untyped-JS-path guards: a consumer's own
// loose schema can feed a non-array `tags`, a null tag element, or a non-string
// tag value that the strict textNote() would reject at base parse.
describe("zostr.nip10 opt-in checks input validation (untyped JS path)", () => {
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
    id: ID,
    pubkey: PK,
    created_at: 0,
    kind: 1,
    content: "hi",
    sig: "a".repeat(128),
  };
  const thread = looseEvent.check(classicZostr.nip10.threadCheck());

  it("threadCheck fails (does not throw) when tags is not an array", () => {
    const result = thread.safeParse({ ...base, tags: "nope" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('"tags"');
  });

  it("threadCheck skips a null tag element (does not throw)", () => {
    // A null tag can't be an e tag; guarded, so a single valid root still passes.
    expect(
      thread.safeParse({ ...base, tags: [null, ["e", ID, "", "root"]] })
        .success,
    ).toBe(true);
  });

  // Any non-string marker must fail cleanly, never throwing while the error
  // message is built. These span both cases: values String() coerces safely
  // (Symbol, number — echoed in the message) and values whose String() itself
  // throws (a null-prototype object, a throwing `toString` — a type label is
  // used instead).
  it.each([
    ["a Symbol", Symbol("x")],
    ["a null-prototype object (no toString)", Object.create(null)],
    [
      "an object whose toString throws",
      {
        toString() {
          throw new Error("boom");
        },
      },
    ],
    ["a number", 3],
  ])(
    "threadCheck fails (does not throw) on %s e-tag marker",
    (_label, marker) => {
      expect(
        thread.safeParse({ ...base, tags: [["e", ID, "", marker]] }).success,
      ).toBe(false);
    },
  );

  it("threadCheck echoes a stringifiable invalid marker's value in the message", () => {
    // A coercible marker (a number here, or a legacy string like "mention") is
    // shown verbatim; only a value whose String() throws falls back to a type
    // label. Guards against the message regressing to a bare type name.
    const result = thread.safeParse({ ...base, tags: [["e", ID, "", 3]] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(": 3");
  });

  it("participantsCheck fails (does not throw) when tags is not an array", () => {
    const check = looseEvent.check(classicZostr.nip10.participantsCheck([PK]));
    const result = check.safeParse({ ...base, tags: 42 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('"tags"');
  });

  it("participantsCheck skips a null / non-string p tag on the untyped path", () => {
    const check = looseEvent.check(classicZostr.nip10.participantsCheck([PK]));
    // A null tag is skipped, so the real p tag after it is still counted.
    expect(check.safeParse({ ...base, tags: [null, ["p", PK]] }).success).toBe(
      true,
    );
    // A non-string pubkey isn't added to the participant set, so the expected
    // participant is missing and the check fails (without throwing).
    expect(
      check.safeParse({ ...base, tags: [["p", Symbol("x")]] }).success,
    ).toBe(false);
  });
});

describe("zostr.nip10 output types", () => {
  it("eTag()/qTag() infer precise tuple types (classic)", () => {
    const e = classicZostr.nip10.eTag().parse(["e", ID, "", "root", PK]);
    expectTypeOf(e[0]).toEqualTypeOf<"e">();
    expectTypeOf(e[1]).toEqualTypeOf<string>();
    // marker is the exact literal union (regression if it widened to string)
    expectTypeOf(e[3]).toEqualTypeOf<"" | "root" | "reply" | undefined>();
    expectTypeOf(e[4]).toEqualTypeOf<string | undefined>();

    const q = classicZostr.nip10.qTag().parse(["q", ID, "", PK]);
    expectTypeOf(q[0]).toEqualTypeOf<"q">();
    expectTypeOf(q[1]).toEqualTypeOf<string>();
  });

  it("eTag()/qTag() infer precise tuple types (mini)", () => {
    const e = zm.parse(miniZostr.nip10.eTag(), ["e", ID, "", "root", PK]);
    expectTypeOf(e[0]).toEqualTypeOf<"e">();
    expectTypeOf(e[3]).toEqualTypeOf<"" | "root" | "reply" | undefined>();
    expectTypeOf(e[4]).toEqualTypeOf<string | undefined>();

    const q = zm.parse(miniZostr.nip10.qTag(), ["q", ID, "", PK]);
    expectTypeOf(q[0]).toEqualTypeOf<"q">();
  });
});
