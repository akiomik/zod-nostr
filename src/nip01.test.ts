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

describe.each(FLAVORS)("zostr NIP-01 primitives ($name)", ({ zostr, z }) => {
  it("pubkey() embeds into z.object() and validates 64-char hex", () => {
    const pk = getPublicKey(generateSecretKey());
    const schema = z.object({ pubkey: zostr.pubkey() });

    expect(z.parse(schema, { pubkey: pk })).toEqual({ pubkey: pk });
    expect(z.safeParse(schema, { pubkey: "not-hex" }).success).toBe(false);
  });

  it("subscriptionId() enforces a non-empty string of at most 64 chars", () => {
    expect(z.parse(zostr.subscriptionId(), "sub1")).toBe("sub1");
    expect(z.safeParse(zostr.subscriptionId(), "").success).toBe(false);
    expect(z.safeParse(zostr.subscriptionId(), "a".repeat(65)).success).toBe(
      false,
    );
  });

  it.each([0, 1700000000, -1])(
    "timestamp() accepts the integer %d (negatives allowed)",
    (value) => {
      expect(z.parse(zostr.timestamp(), value)).toBe(value);
    },
  );

  it.each([
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("timestamp() rejects the non-integer %d", (value) => {
    expect(z.safeParse(zostr.timestamp(), value).success).toBe(false);
  });

  it.each([0, 65535])("kind() accepts the in-range integer %d", (value) => {
    expect(z.parse(zostr.kind(), value)).toBe(value);
  });

  it.each([
    -1,
    65536,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("kind() rejects %d (out of the 0..65535 integer range)", (value) => {
    expect(z.safeParse(zostr.kind(), value).success).toBe(false);
  });
});

describe.each(FLAVORS)("zostr NIP-01 event schemas ($name)", ({ zostr, z }) => {
  const signed = () =>
    finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      generateSecretKey(),
    );

  it("eventTemplate() / unsignedEvent() validate structure only", () => {
    expect(
      z.parse(zostr.eventTemplate(), {
        kind: 1,
        created_at: 0,
        tags: [],
        content: "hi",
      }),
    ).toBeTruthy();

    const pk = getPublicKey(generateSecretKey());
    expect(
      z.parse(zostr.unsignedEvent(), {
        pubkey: pk,
        kind: 1,
        created_at: 0,
        tags: [],
        content: "hi",
      }),
    ).toBeTruthy();
  });

  it("event().check(signatureCheck()) verifies structure + signature", () => {
    const sk = generateSecretKey();
    const event = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hello nostr" },
      sk,
    );
    const schema = zostr.event().check(zostr.signatureCheck());

    expect(z.parse(schema, event)).toBeTruthy();
    // A tampered content invalidates the signature.
    expect(z.safeParse(schema, { ...event, content: "tampered" }).success).toBe(
      false,
    );
    // A malformed pubkey fails the structural check before the signature one.
    expect(z.safeParse(schema, { ...event, pubkey: "not-hex" }).success).toBe(
      false,
    );
  });

  it("event schemas require every tag to be a non-empty array of strings", () => {
    const base = {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      created_at: 0,
      kind: 1,
      content: "hi",
      sig: "c".repeat(128),
    };
    // A tag with at least one string (its tag name) is accepted.
    expect(
      z.parse(zostr.event(), { ...base, tags: [["e", "id"], ["p"]] }),
    ).toBeTruthy();
    // An empty inner tag has no tag name and is rejected.
    expect(z.safeParse(zostr.event(), { ...base, tags: [[]] }).success).toBe(
      false,
    );
    // The outer tags array MAY be empty (an event can carry no tags).
    expect(z.parse(zostr.event(), { ...base, tags: [] })).toBeTruthy();
  });

  it("event schemas reject unknown keys (fixed event shape, never stripped)", () => {
    expect(
      z.safeParse(zostr.event(), { ...signed(), extra: "x" }).success,
    ).toBe(false);
    expect(
      z.safeParse(zostr.eventTemplate(), {
        kind: 1,
        created_at: 0,
        tags: [],
        content: "hi",
        extra: "x",
      }).success,
    ).toBe(false);
  });
});

describe.each(FLAVORS)("zostr NIP-01 filter() ($name)", ({ zostr, z }) => {
  it("validates known fields and '#<letter>' tag filters, rejects unknown keys", () => {
    const filter = {
      ids: ["a".repeat(64)],
      authors: ["b".repeat(64)],
      kinds: [1],
      since: 0,
      until: 100,
      limit: 10,
      "#e": ["c".repeat(64)],
    };

    expect(z.parse(zostr.filter(), filter)).toEqual(filter);
    expect(z.parse(zostr.filter(), {})).toEqual({});
    expect(z.safeParse(zostr.filter(), { nope: ["x"] }).success).toBe(false);
    expect(z.safeParse(zostr.filter(), { "#too-long": ["x"] }).success).toBe(
      false,
    );
  });

  it("accepts limit 0 and a positive integer", () => {
    expect(z.parse(zostr.filter(), { limit: 0 })).toEqual({ limit: 0 });
    expect(z.parse(zostr.filter(), { limit: 500 })).toEqual({ limit: 500 });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the non-negative-integer-violating limit %d",
    (limit) => {
      expect(z.safeParse(zostr.filter(), { limit }).success).toBe(false);
    },
  );

  it.each(["ids", "authors", "kinds", "#e"])(
    "rejects an empty %s array",
    (key) => {
      expect(z.safeParse(zostr.filter(), { [key]: [] }).success).toBe(false);
    },
  );

  it("keeps {} valid and accepts present arrays with at least one value", () => {
    const id = "c".repeat(64);
    expect(z.parse(zostr.filter(), {})).toEqual({});
    expect(z.parse(zostr.filter(), { kinds: [1], "#e": [id] })).toEqual({
      kinds: [1],
      "#e": [id],
    });
  });

  it.each(["#e", "#p"])(
    "accepts a 64-character lowercase hex %s value",
    (key) => {
      const hex = "c".repeat(64);

      expect(z.parse(zostr.filter(), { [key]: [hex] })).toEqual({
        [key]: [hex],
      });
      // One bad value fails the list even when the rest are well-formed.
      expect(
        z.safeParse(zostr.filter(), { [key]: [hex, "nope"] }).success,
      ).toBe(false);
    },
  );

  // One case per way the form can be wrong, so no case stands in for another:
  // "id" is short *and* non-hex, and would pass for either on its own.
  it.each<[string, string]>([
    ["too short", "id"],
    ["the right length but not hex", "z".repeat(64)],
    ["hex digits in uppercase", "C".repeat(64)],
  ])('rejects a "#e"/"#p" value that is %s', (_label, value) => {
    expect(z.safeParse(zostr.filter(), { "#e": [value] }).success).toBe(false);
    expect(z.safeParse(zostr.filter(), { "#p": [value] }).success).toBe(false);
  });

  it("reports a malformed #e exactly as it reports a malformed ids", () => {
    const values = ["nope", "also-nope"];
    const tagFilter = z.safeParse(zostr.filter(), { "#e": values });
    const idsFilter = z.safeParse(zostr.filter(), { ids: values });

    expect(tagFilter.success).toBe(false);
    expect(idsFilter.success).toBe(false);
    // NIP-01 states one rule over both lists, so both report it the same way:
    // one issue per offending element, under that element's path. Compared with
    // the field name dropped, nothing else about the issues may differ.
    const withoutFieldName = (result: typeof tagFilter) =>
      result.error?.issues.map((issue) => ({
        ...issue,
        path: issue.path.slice(1),
      }));
    expect(withoutFieldName(tagFilter)).toEqual(withoutFieldName(idsFilter));
    expect(tagFilter.error?.issues.map((issue) => issue.path)).toEqual([
      ["#e", 0],
      ["#e", 1],
    ]);
  });

  it("reports a malformed #e alongside another field's, as ids does", () => {
    const result = z.safeParse(zostr.filter(), {
      ids: ["nope"],
      "#e": ["nope"],
    });

    expect(result.success).toBe(false);
    // Neither hides the other, because both are fields. Were the hex rule an
    // object-level check instead, only `ids` would be reported: a property
    // issue stops an object's checks from running at all.
    expect(result.error?.issues).toHaveLength(2);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        ["ids", 0],
        ["#e", 0],
      ]),
    );
  });

  it.each(["#a", "#t", "#E", "#P"])(
    "leaves %s values unconstrained, since NIP-01 names only #e and #p",
    (key) => {
      expect(z.parse(zostr.filter(), { [key]: ["anything"] })).toEqual({
        [key]: ["anything"],
      });
    },
  );
});

describe.each(FLAVORS)(
  "zostr NIP-01 relay/client messages ($name)",
  ({ zostr, z }) => {
    const signed = () =>
      finalizeEvent(
        { kind: 1, created_at: 0, tags: [], content: "hi" },
        generateSecretKey(),
      );

    it("relayMessage.* validate NIP-01 relay-to-client message tuples", () => {
      const event = signed();
      expect(
        z.parse(zostr.nip01.relayMessage.event(), ["EVENT", "sub1", event]),
      ).toBeTruthy();
      expect(
        z.parse(zostr.nip01.relayMessage.ok(), ["OK", event.id, true, ""]),
      ).toBeTruthy();
      expect(
        z.parse(zostr.nip01.relayMessage.eose(), ["EOSE", "sub1"]),
      ).toBeTruthy();
      expect(
        z.parse(zostr.nip01.relayMessage.closed(), [
          "CLOSED",
          "sub1",
          "reason",
        ]),
      ).toBeTruthy();
      expect(
        z.parse(zostr.nip01.relayMessage.notice(), ["NOTICE", "hello"]),
      ).toBeTruthy();

      expect(
        z.safeParse(zostr.nip01.relayMessage.event(), ["NOTICE", "sub1", event])
          .success,
      ).toBe(false);

      const any = zostr.nip01.relayMessage.any();
      expect(z.parse(any, ["EOSE", "sub1"])).toBeTruthy();
      expect(z.safeParse(any, ["REQ", "sub1"]).success).toBe(false);
    });

    it("clientMessage.* validate NIP-01 client-to-relay message tuples", () => {
      const event = signed();
      expect(
        z.parse(zostr.nip01.clientMessage.event(), ["EVENT", event]),
      ).toBeTruthy();
      expect(
        z.parse(zostr.nip01.clientMessage.req(), [
          "REQ",
          "sub1",
          { kinds: [1] },
          {},
        ]),
      ).toBeTruthy();
      // Request-everything sends a single empty {} filter.
      expect(
        z.parse(zostr.nip01.clientMessage.req(), ["REQ", "sub1", {}]),
      ).toBeTruthy();
      // At least one filter is required (matching NIP-01's REQ grammar).
      expect(
        z.safeParse(zostr.nip01.clientMessage.req(), ["REQ", "sub1"]).success,
      ).toBe(false);
      // REQ carries filter(), so the filter's own rules travel with it — a
      // rest filter is held to them too, not just the required first one.
      expect(
        z.safeParse(zostr.nip01.clientMessage.req(), [
          "REQ",
          "sub1",
          {},
          { "#e": ["not-hex"] },
        ]).success,
      ).toBe(false);
      expect(
        z.parse(zostr.nip01.clientMessage.close(), ["CLOSE", "sub1"]),
      ).toBeTruthy();

      const any = zostr.nip01.clientMessage.any();
      expect(z.parse(any, ["CLOSE", "sub1"])).toBeTruthy();
      expect(z.parse(any, ["REQ", "sub1", {}])).toBeTruthy();
      // any() also enforces REQ's at-least-one-filter rule.
      expect(z.safeParse(any, ["REQ", "sub1"]).success).toBe(false);
      expect(z.safeParse(any, ["EOSE", "sub1"]).success).toBe(false);
    });

    it("an event embedded in a message rejects unknown keys at runtime", () => {
      // The embedded event is the reject schema, so a message carrying an event
      // with an extra key is rejected.
      expect(
        z.safeParse(zostr.nip01.relayMessage.event(), [
          "EVENT",
          "sub",
          { ...signed(), extra: 1 },
        ]).success,
      ).toBe(false);
    });
  },
);

describe.each(FLAVORS)(
  "zostr NIP-01 OK/CLOSED message-prefix checks ($name)",
  ({ zostr, z }) => {
    it("okMessagePrefixCheck() is opt-in and only enforced when the event is rejected", () => {
      const eventId = "a".repeat(64);
      const checked = zostr.nip01.relayMessage
        .ok()
        .check(zostr.nip01.relayMessage.okMessagePrefixCheck());

      // Not composed by default: an unprefixed rejection message parses fine.
      expect(
        z.parse(zostr.nip01.relayMessage.ok(), ["OK", eventId, false, "nope"]),
      ).toBeTruthy();

      // Accepted (true): message MAY be empty/unprefixed per NIP-01.
      expect(z.parse(checked, ["OK", eventId, true, ""])).toBeTruthy();
      expect(z.parse(checked, ["OK", eventId, true, "anything"])).toBeTruthy();

      // Rejected (false): message MUST follow "<prefix>: <message>".
      expect(
        z.parse(checked, [
          "OK",
          eventId,
          false,
          "duplicate: already have this",
        ]),
      ).toBeTruthy();
      expect(z.safeParse(checked, ["OK", eventId, false, "nope"]).success).toBe(
        false,
      );
      expect(z.safeParse(checked, ["OK", eventId, false, ""]).success).toBe(
        false,
      );
    });

    it("closedMessagePrefixCheck() enforces the '<prefix>: <message>' format (prefix isn't restricted to NIP-01's standardized list)", () => {
      const checked = zostr.nip01.relayMessage
        .closed()
        .check(zostr.nip01.relayMessage.closedMessagePrefixCheck());

      // Not composed by default: an unprefixed reason parses fine.
      expect(
        z.parse(zostr.nip01.relayMessage.closed(), ["CLOSED", "sub1", "nope"]),
      ).toBeTruthy();

      expect(
        z.parse(checked, ["CLOSED", "sub1", "error: could not connect"]),
      ).toBeTruthy();
      // NIP-01's own CLOSED example uses a prefix outside the "standardized" list.
      expect(
        z.parse(checked, [
          "CLOSED",
          "sub1",
          "unsupported: unknown filter field",
        ]),
      ).toBeTruthy();
      expect(z.safeParse(checked, ["CLOSED", "sub1", "nope"]).success).toBe(
        false,
      );
      expect(z.safeParse(checked, ["CLOSED", "sub1", ""]).success).toBe(false);
    });
  },
);

// Output-type inference. Each flavor re-wraps the core schema through its own
// helpers, which have independently regressed to unknown/unknown[] before (see
// #10), so both flavors are asserted.
describe("zostr NIP-01 output types", () => {
  it("tags()/filter()/relayMessage.*/clientMessage.* infer precise types (classic)", () => {
    const t = classicZostr.tags().parse([["a"]]);
    expectTypeOf(t[0]?.[0]).toEqualTypeOf<string | undefined>();

    const f = classicZostr.filter().parse({ kinds: [1] });
    expectTypeOf(f.kinds).toEqualTypeOf<number[] | undefined>();
    // `#e`/`#p` are declared fields, so they infer precisely; every other tag
    // filter is still read through the catchall's `[key: string]: unknown`.
    expectTypeOf(f["#e"]).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(f["#p"]).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(f["#t"]).toEqualTypeOf<unknown>();

    const ok = classicZostr.nip01.relayMessage
      .ok()
      .parse(["OK", "a".repeat(64), true, ""]);
    expectTypeOf(ok[2]).toEqualTypeOf<boolean>();
    expectTypeOf(ok[3]).toEqualTypeOf<string>();

    const req = classicZostr.nip01.clientMessage
      .req()
      .parse(["REQ", "sub1", { kinds: [1] }]);
    // req[2] is the required first filter (non-optional).
    expectTypeOf(req[2].kinds).toEqualTypeOf<number[] | undefined>();
  });

  it("tags()/filter()/relayMessage.*/clientMessage.* infer precise types (mini)", () => {
    const t = zm.parse(miniZostr.tags(), [["a"]]);
    expectTypeOf(t[0]?.[0]).toEqualTypeOf<string | undefined>();

    const f = zm.parse(miniZostr.filter(), { kinds: [1] });
    expectTypeOf(f.kinds).toEqualTypeOf<number[] | undefined>();
    expectTypeOf(f["#e"]).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(f["#p"]).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(f["#t"]).toEqualTypeOf<unknown>();

    const ok = zm.parse(miniZostr.nip01.relayMessage.ok(), [
      "OK",
      "a".repeat(64),
      true,
      "",
    ]);
    expectTypeOf(ok[2]).toEqualTypeOf<boolean>();
    expectTypeOf(ok[3]).toEqualTypeOf<string>();

    const req = zm.parse(miniZostr.nip01.clientMessage.req(), [
      "REQ",
      "sub1",
      { kinds: [1] },
    ]);
    expectTypeOf(req[2].kinds).toEqualTypeOf<number[] | undefined>();
  });

  it("an embedded event element infers a strict object (no unknown index access)", () => {
    const relayed = classicZostr.nip01.relayMessage
      .event()
      .parse([
        "EVENT",
        "sub",
        finalizeEvent(
          { kind: 1, created_at: 0, tags: [], content: "hi" },
          generateSecretKey(),
        ),
      ]);
    // @ts-expect-error embedded event output is strict
    relayed[2].extension;
  });

  it("an embedded event element infers a strict object — mini (no unknown index access)", () => {
    // mini re-wraps relayMessage.event() through its own helper, which can
    // regress the embedded object config independently of classic.
    const relayed = zm.parse(miniZostr.nip01.relayMessage.event(), [
      "EVENT",
      "sub",
      finalizeEvent(
        { kind: 1, created_at: 0, tags: [], content: "hi" },
        generateSecretKey(),
      ),
    ]);
    // @ts-expect-error embedded event output is strict
    relayed[2].extension;
  });
});
