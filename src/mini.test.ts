import { nip19 } from "nostr-tools";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { zostr } from "./mini.js";

describe("zostr (mini)", () => {
  it("pubkey() embeds into z.object()", () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const schema = z.object({ pubkey: zostr.pubkey() });

    expect(z.parse(schema, { pubkey: pk })).toEqual({ pubkey: pk });
    expect(() => z.parse(schema, { pubkey: "not-hex" })).toThrow();
  });

  it("event().check(signatureCheck()) verifies structure + signature", () => {
    const sk = generateSecretKey();
    const template = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: "hello nostr",
    };
    const signed = finalizeEvent(template, sk);
    const tampered = { ...signed, content: "tampered" };

    const schema = zostr.event().check(zostr.signatureCheck());

    expect(z.parse(schema, signed)).toBeTruthy();
    expect(() => z.parse(schema, tampered)).toThrow();
  });

  it("bech32(prefix) validates format only", () => {
    const sk = generateSecretKey();
    const npub = nip19.npubEncode(getPublicKey(sk));

    expect(z.parse(zostr.bech32("npub"), npub)).toBe(npub);
    expect(() => z.parse(zostr.bech32("nsec"), npub)).toThrow();
  });

  it("npub() codec round-trips pubkey <-> npub", () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const codec = zostr.npub();

    const npub = z.encode(codec, pk);
    expect(npub.startsWith("npub1")).toBe(true);
    expect(z.decode(codec, npub)).toBe(pk);
  });

  it("nsec() codec round-trips secret key bytes <-> nsec", () => {
    const sk = generateSecretKey();
    const codec = zostr.nsec();

    const nsec = z.encode(codec, sk);
    expect(nsec.startsWith("nsec1")).toBe(true);
    expect(z.decode(codec, nsec)).toEqual(sk);
  });

  it("note() codec round-trips event id <-> note", () => {
    const sk = generateSecretKey();
    const signed = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );
    const codec = zostr.note();

    const note = z.encode(codec, signed.id);
    expect(note.startsWith("note1")).toBe(true);
    expect(z.decode(codec, note)).toBe(signed.id);
  });

  it("nprofile()/nevent()/naddr() codecs decode structured pointers", () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);

    const nprofile = nip19.nprofileEncode({
      pubkey: pk,
      relays: ["wss://relay.example"],
    });
    expect(z.decode(zostr.nprofile(), nprofile)).toEqual({
      pubkey: pk,
      relays: ["wss://relay.example"],
    });

    const nevent = nip19.neventEncode({ id: "a".repeat(64), kind: 1 });
    expect(z.decode(zostr.nevent(), nevent)).toEqual({
      id: "a".repeat(64),
      kind: 1,
      relays: [],
      author: undefined,
    });

    const naddr = nip19.naddrEncode({
      identifier: "foo",
      pubkey: pk,
      kind: 30023,
    });
    expect(z.decode(zostr.naddr(), naddr)).toEqual({
      identifier: "foo",
      pubkey: pk,
      kind: 30023,
      relays: [],
    });
  });

  it("nevent()/naddr() validate the pointer kind as a uint32: accept 0..2^32-1 (incl. above NIP-01's 65535), reject 2^32", () => {
    const pk = getPublicKey(generateSecretKey());
    const UINT32_MAX = 0xff_ff_ff_ff; // 4294967295

    // decode accepts a kind above NIP-01's 65535, up to the uint32 max
    const nevent = nip19.neventEncode({ id: "a".repeat(64), kind: 70000 });
    const naddrMax = nip19.naddrEncode({
      identifier: "x",
      pubkey: pk,
      kind: UINT32_MAX,
    });
    expect(z.decode(zostr.nevent(), nevent).kind).toBe(70000);
    expect(z.decode(zostr.naddr(), naddrMax).kind).toBe(UINT32_MAX);

    // 2^32 is out of range. A bech32 pointer can't carry a kind that wide over
    // the wire, so pin the upper bound via encode — which validates the pointer
    // schema (with the same `Invalid kind` check) before re-encoding.
    expect(() =>
      z.encode(zostr.nevent(), {
        id: "a".repeat(64),
        kind: UINT32_MAX + 1,
        relays: [],
      }),
    ).toThrow();
    expect(() =>
      z.encode(zostr.naddr(), {
        identifier: "x",
        pubkey: pk,
        kind: UINT32_MAX + 1,
        relays: [],
      }),
    ).toThrow();
  });

  it("nip01.metadataContent() decodes/validates kind:0 content JSON", () => {
    const content = JSON.stringify({
      name: "bob",
      display_name: "Bob",
      picture: "https://example.com/b.png",
      nip05: "bob@example.com",
    });

    const metadata = z.decode(zostr.nip01.metadataContent(), content);
    expect(metadata.name).toBe("bob");
  });

  it("nip01.textNote() enforces kind === 1", () => {
    const sk = generateSecretKey();
    const note = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );
    const reaction = finalizeEvent(
      { kind: 7, created_at: 0, tags: [], content: "+" },
      sk,
    );

    expect(z.parse(zostr.nip01.textNote(), note)).toBeTruthy();
    expect(() => z.parse(zostr.nip01.textNote(), reaction)).toThrow();
  });

  it("every wrapped event schema and codec exposes mini's native .check() (regression: raw core schemas lack it)", () => {
    const wrappedSchemas: Array<() => { check: unknown }> = [
      () => zostr.event(),
      () => zostr.unsignedEvent(),
      () => zostr.eventTemplate(),
      () => zostr.nip01.textNote(),
      () => zostr.npub(),
      () => zostr.nsec(),
      () => zostr.note(),
      () => zostr.nprofile(),
      () => zostr.nevent(),
      () => zostr.naddr(),
      () => zostr.nip01.metadata(),
    ];

    for (const factory of wrappedSchemas) {
      expect(typeof factory().check).toBe("function");
    }
  });

  it("every field-level primitive exposes mini's native .check() and works with mini's functional z.optional()/z.catch()/z.safeParse() (regression: raw core schemas lack .check(), and even top-level z.parse() support)", () => {
    const primitives: Array<() => { check: unknown }> = [
      () => zostr.pubkey(),
      () => zostr.eventId(),
      () => zostr.signature(),
      () => zostr.timestamp(),
      () => zostr.kind(),
      () => zostr.tags(),
      () => zostr.nip05.identifier(),
      () => zostr.bech32("npub"),
    ];

    for (const factory of primitives) {
      expect(typeof factory().check).toBe("function");
    }

    expect(z.parse(z.catch(zostr.pubkey(), "fallback"), 123)).toBe("fallback");
    expect(z.parse(z.optional(zostr.pubkey()), undefined)).toBeUndefined();
    expect(z.safeParse(zostr.pubkey(), 123).success).toBe(false);
  });

  // Note: unlike classic zod, zod/mini never attaches .decode()/.encode() as
  // instance methods on any schema (only the top-level z.decode()/z.encode()
  // exist) — so there's no equivalent "instance method" assertion to make
  // here for codecs. The rewrap through mini's own z.codec() still matters
  // for .check() and for keeping a mini-native schema instance, see above.

  it("subscriptionId() enforces a non-empty string of at most 64 chars", () => {
    expect(z.parse(zostr.subscriptionId(), "sub1")).toBe("sub1");
    expect(() => z.parse(zostr.subscriptionId(), "")).toThrow();
    expect(() => z.parse(zostr.subscriptionId(), "a".repeat(65))).toThrow();
  });

  it("timestamp() requires an integer (accepts negatives, rejects fractionals)", () => {
    expect(z.parse(zostr.timestamp(), 0)).toBe(0);
    expect(z.parse(zostr.timestamp(), 1700000000)).toBe(1700000000);
    expect(z.parse(zostr.timestamp(), -1)).toBe(-1);
    for (const invalid of [
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => z.parse(zostr.timestamp(), invalid)).toThrow();
    }
  });

  it("kind() enforces an integer between 0 and 65535", () => {
    expect(z.parse(zostr.kind(), 0)).toBe(0);
    expect(z.parse(zostr.kind(), 65535)).toBe(65535);
    expect(() => z.parse(zostr.kind(), -1)).toThrow();
    expect(() => z.parse(zostr.kind(), 65536)).toThrow();
    expect(() => z.parse(zostr.kind(), 1.5)).toThrow();
    expect(() => z.parse(zostr.kind(), Number.NaN)).toThrow();
    expect(() => z.parse(zostr.kind(), Number.POSITIVE_INFINITY)).toThrow();
    expect(() => z.parse(zostr.kind(), Number.NEGATIVE_INFINITY)).toThrow();
  });

  it("filter() validates known fields and '#<letter>' tag filters, rejects unknown keys", () => {
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
    expect(() => z.parse(zostr.filter(), { nope: ["x"] })).toThrow();
    expect(() => z.parse(zostr.filter(), { "#too-long": ["x"] })).toThrow();
  });

  it("filter() limit enforces a non-negative integer", () => {
    expect(z.parse(zostr.filter(), { limit: 0 })).toEqual({ limit: 0 });
    expect(z.parse(zostr.filter(), { limit: 500 })).toEqual({ limit: 500 });
    expect(() => z.parse(zostr.filter(), { limit: -1 })).toThrow();
    expect(() => z.parse(zostr.filter(), { limit: 1.5 })).toThrow();
    expect(() => z.parse(zostr.filter(), { limit: Number.NaN })).toThrow();
    expect(() =>
      z.parse(zostr.filter(), { limit: Number.POSITIVE_INFINITY }),
    ).toThrow();
  });

  it("relayMessage.* validate NIP-01 relay-to-client message tuples", () => {
    const sk = generateSecretKey();
    const signed = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );

    expect(
      z.parse(zostr.relayMessage.event(), ["EVENT", "sub1", signed]),
    ).toBeTruthy();
    expect(
      z.parse(zostr.relayMessage.ok(), ["OK", signed.id, true, ""]),
    ).toBeTruthy();
    expect(z.parse(zostr.relayMessage.eose(), ["EOSE", "sub1"])).toBeTruthy();
    expect(
      z.parse(zostr.relayMessage.closed(), ["CLOSED", "sub1", "reason"]),
    ).toBeTruthy();
    expect(
      z.parse(zostr.relayMessage.notice(), ["NOTICE", "hello"]),
    ).toBeTruthy();

    expect(() =>
      z.parse(zostr.relayMessage.event(), ["NOTICE", "sub1", signed]),
    ).toThrow();

    const any = zostr.relayMessage.any();
    expect(z.parse(any, ["EOSE", "sub1"])).toBeTruthy();
    expect(() => z.parse(any, ["REQ", "sub1"])).toThrow();
  });

  it("clientMessage.* validate NIP-01 client-to-relay message tuples", () => {
    const sk = generateSecretKey();
    const signed = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );

    expect(
      z.parse(zostr.clientMessage.event(), ["EVENT", signed]),
    ).toBeTruthy();
    expect(
      z.parse(zostr.clientMessage.req(), ["REQ", "sub1", { kinds: [1] }, {}]),
    ).toBeTruthy();
    // Request-everything sends a single empty {} filter.
    expect(
      z.parse(zostr.clientMessage.req(), ["REQ", "sub1", {}]),
    ).toBeTruthy();
    // At least one filter is required (matching NIP-01's REQ grammar).
    expect(() => z.parse(zostr.clientMessage.req(), ["REQ", "sub1"])).toThrow();
    expect(
      z.parse(zostr.clientMessage.close(), ["CLOSE", "sub1"]),
    ).toBeTruthy();

    const any = zostr.clientMessage.any();
    expect(z.parse(any, ["CLOSE", "sub1"])).toBeTruthy();
    expect(z.parse(any, ["REQ", "sub1", {}])).toBeTruthy();
    // any() also enforces REQ's at-least-one-filter rule.
    expect(() => z.parse(any, ["REQ", "sub1"])).toThrow();
    expect(() => z.parse(any, ["EOSE", "sub1"])).toThrow();
  });

  it("tags()/filter()/relayMessage.*/clientMessage.* infer precise output types (regression: previously fell back to unknown/unknown[] because mini.ts re-wrapped them through the generic miniSchema() helper, which infers T from a bare Ctor reference rather than the actual core schema — see #10)", () => {
    const t = z.parse(zostr.tags(), [["a"]]);
    const tagChar: string | undefined = t[0]?.[0];
    expect(tagChar).toBe("a");

    const f = z.parse(zostr.filter(), { kinds: [1] });
    const kinds: number[] | undefined = f.kinds;
    expect(kinds).toEqual([1]);

    const ok = z.parse(zostr.relayMessage.ok(), [
      "OK",
      "a".repeat(64),
      true,
      "",
    ]);
    const accepted: boolean = ok[2];
    const message: string = ok[3];
    expect(accepted).toBe(true);
    expect(message).toBe("");

    const any = z.parse(zostr.relayMessage.any(), ["EOSE", "sub1"]);
    if (any[0] === "EOSE") {
      const subId: string = any[1];
      expect(subId).toBe("sub1");
    }

    const req = z.parse(zostr.clientMessage.req(), [
      "REQ",
      "sub1",
      { kinds: [1] },
    ]);
    // req[2] is the required first filter (no `?.`) — pins that the third
    // tuple element is non-optional, not just `filter | undefined`.
    const reqKinds: number[] | undefined = req[2].kinds;
    expect(reqKinds).toEqual([1]);
  });

  it("relayMessage.okMessagePrefixCheck() is opt-in and only enforced when the event is rejected", () => {
    const eventId = "a".repeat(64);
    const checked = zostr.relayMessage
      .ok()
      .check(zostr.relayMessage.okMessagePrefixCheck());

    // Not composed by default: an unprefixed rejection message parses fine.
    expect(
      z.parse(zostr.relayMessage.ok(), ["OK", eventId, false, "nope"]),
    ).toBeTruthy();

    // Accepted (true): message MAY be empty/unprefixed per NIP-01.
    expect(z.parse(checked, ["OK", eventId, true, ""])).toBeTruthy();
    expect(z.parse(checked, ["OK", eventId, true, "anything"])).toBeTruthy();

    // Rejected (false): message MUST follow "<prefix>: <message>".
    expect(
      z.parse(checked, ["OK", eventId, false, "duplicate: already have this"]),
    ).toBeTruthy();
    expect(() => z.parse(checked, ["OK", eventId, false, "nope"])).toThrow();
    expect(() => z.parse(checked, ["OK", eventId, false, ""])).toThrow();
  });

  it("relayMessage.closedMessagePrefixCheck() enforces the '<prefix>: <message>' format, prefix isn't restricted to NIP-01's standardized list", () => {
    const checked = zostr.relayMessage
      .closed()
      .check(zostr.relayMessage.closedMessagePrefixCheck());

    // Not composed by default: an unprefixed reason parses fine.
    expect(
      z.parse(zostr.relayMessage.closed(), ["CLOSED", "sub1", "nope"]),
    ).toBeTruthy();

    expect(
      z.parse(checked, ["CLOSED", "sub1", "error: could not connect"]),
    ).toBeTruthy();
    // NIP-01's own CLOSED example uses a prefix outside the "standardized" list.
    expect(
      z.parse(checked, ["CLOSED", "sub1", "unsupported: unknown filter field"]),
    ).toBeTruthy();
    expect(() => z.parse(checked, ["CLOSED", "sub1", "nope"])).toThrow();
    expect(() => z.parse(checked, ["CLOSED", "sub1", ""])).toThrow();
  });

  it("nip05.nostrJsonDocument() validates a full document", () => {
    const pubkey = getPublicKey(generateSecretKey());
    const doc = {
      names: { bob: pubkey },
      relays: {
        [pubkey]: ["wss://relay.example.com", "wss://relay2.example.com"],
      },
    };

    expect(z.parse(zostr.nip05.nostrJsonDocument(), doc)).toEqual(doc);
  });

  it("nip05.nostrJsonDocument() requires names but treats relays as optional", () => {
    const pubkey = getPublicKey(generateSecretKey());
    expect(
      z.parse(zostr.nip05.nostrJsonDocument(), { names: { bob: pubkey } }),
    ).toEqual({ names: { bob: pubkey } });
    expect(() => z.parse(zostr.nip05.nostrJsonDocument(), {})).toThrow();
  });

  it("nip05.nostrJsonDocument() validates names/relays pubkeys as 64-char lowercase hex", () => {
    const pubkey = getPublicKey(generateSecretKey());
    expect(() =>
      z.parse(zostr.nip05.nostrJsonDocument(), { names: { bob: "not-hex" } }),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip05.nostrJsonDocument(), {
        names: { bob: pubkey.toUpperCase() },
      }),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip05.nostrJsonDocument(), {
        names: { bob: pubkey },
        relays: { "not-hex": ["wss://relay.example.com"] },
      }),
    ).toThrow();
  });

  it("nip05.nostrJsonDocument() validates names keys as local-part characters and strips unknown top-level keys", () => {
    const pubkey = getPublicKey(generateSecretKey());
    expect(() =>
      z.parse(zostr.nip05.nostrJsonDocument(), { names: { "bob!": pubkey } }),
    ).toThrow();
    // Local-part is lowercase-only per NIP-05; uppercase names keys are rejected.
    expect(() =>
      z.parse(zostr.nip05.nostrJsonDocument(), { names: { Bob: pubkey } }),
    ).toThrow();

    expect(
      z.parse(zostr.nip05.nostrJsonDocument(), {
        names: { bob: pubkey },
        extra: "y",
      }),
    ).toEqual({ names: { bob: pubkey } });
  });

  it("nip11.relayInformationDocument() validates a full document", () => {
    const doc = {
      name: "relay.example",
      description: "an example relay",
      pubkey: "a".repeat(64),
      supported_nips: [1, 11, 42],
      limitation: {
        max_message_length: 16384,
        auth_required: false,
      },
      fees: {
        admission: [{ amount: 1000000, unit: "msats" }],
      },
    };

    expect(z.parse(zostr.nip11.relayInformationDocument(), doc)).toEqual(doc);
  });

  it("nip11.relayInformationDocument() treats every field as optional and strips unknown keys", () => {
    expect(z.parse(zostr.nip11.relayInformationDocument(), {})).toEqual({});
    expect(
      z.parse(zostr.nip11.relayInformationDocument(), {
        name: "x",
        extra: "y",
      }),
    ).toEqual({ name: "x" });
  });

  it("nip11.relayInformationDocument() validates pubkey/self as 64-char hex", () => {
    expect(() =>
      z.parse(zostr.nip11.relayInformationDocument(), { pubkey: "not-hex" }),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip11.relayInformationDocument(), { self: "not-hex" }),
    ).toThrow();
  });

  it("nip11.relayInformationDocument() validates banner/icon/terms_of_service/payments_url as URLs", () => {
    expect(() =>
      z.parse(zostr.nip11.relayInformationDocument(), { banner: "not-a-url" }),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip11.relayInformationDocument(), { icon: "not-a-url" }),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip11.relayInformationDocument(), {
        terms_of_service: "not-a-url",
      }),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip11.relayInformationDocument(), {
        payments_url: "not-a-url",
      }),
    ).toThrow();

    // software/contact are left as plain strings, same as rust-nostr
    expect(
      z.parse(zostr.nip11.relayInformationDocument(), {
        software: "git+https://example.com/repo.git",
      }),
    ).toEqual({ software: "git+https://example.com/repo.git" });
    expect(
      z.parse(zostr.nip11.relayInformationDocument(), {
        contact: "admin@example.com",
      }),
    ).toEqual({ contact: "admin@example.com" });
  });

  it("nip11.relayInformationDocument() validates numeric fields by their spec-defined form", () => {
    const doc = zostr.nip11.relayInformationDocument();
    const parse = (v: unknown) => z.parse(doc, v);
    // count/length fields: non-negative integers (0 allowed)
    expect(() => parse({ limitation: { max_limit: -1 } })).toThrow();
    expect(() => parse({ limitation: { default_limit: 1.5 } })).toThrow();
    expect(() =>
      parse({ limitation: { max_message_length: Number.NaN } }),
    ).toThrow();
    expect(parse({ limitation: { min_pow_difficulty: 0 } })).toEqual({
      limitation: { min_pow_difficulty: 0 },
    });
    // min_pow_difficulty is intentionally left an unbounded non-negative
    // integer: NIP-13's derived 0..256 range is not baked in, so 257 is accepted
    expect(parse({ limitation: { min_pow_difficulty: 257 } })).toEqual({
      limitation: { min_pow_difficulty: 257 },
    });
    // created_at_*_limit are relative durations in seconds: non-negative
    // integers, so negatives and fractions are rejected
    expect(() =>
      parse({ limitation: { created_at_lower_limit: -1 } }),
    ).toThrow();
    expect(() =>
      parse({ limitation: { created_at_upper_limit: 1.5 } }),
    ).toThrow();
    expect(parse({ limitation: { created_at_lower_limit: 94608000 } })).toEqual(
      {
        limitation: { created_at_lower_limit: 94608000 },
      },
    );
    // fees.amount is a non-negative finite number (unit is free-form, so
    // fractions like 0.5 are allowed); period is a non-negative integer;
    // kinds are NIP-01 event kinds (0..65535)
    expect(
      parse({ fees: { admission: [{ amount: 0.5, unit: "BTC" }] } }),
    ).toEqual({ fees: { admission: [{ amount: 0.5, unit: "BTC" }] } });
    expect(() =>
      parse({ fees: { admission: [{ amount: -1, unit: "msats" }] } }),
    ).toThrow();
    // amount must be finite: NaN/Infinity are rejected
    expect(() =>
      parse({ fees: { admission: [{ amount: Number.NaN, unit: "msats" }] } }),
    ).toThrow();
    expect(() =>
      parse({
        fees: {
          admission: [{ amount: Number.POSITIVE_INFINITY, unit: "msats" }],
        },
      }),
    ).toThrow();
    expect(() =>
      parse({
        fees: { admission: [{ amount: 1, unit: "msats", period: 1.5 }] },
      }),
    ).toThrow();
    expect(() =>
      parse({
        fees: { publication: [{ amount: 1, unit: "msats", kinds: [65536] }] },
      }),
    ).toThrow();
    // supported_nips are non-negative integers
    expect(() => parse({ supported_nips: [1, -2] })).toThrow();
  });

  it("nip11.relayInformationDocument()/nip05.nostrJsonDocument() infer precise output types (regression: previously fell back to unknown because mini.ts re-wrapped them through the generic miniSchema() helper — see #15)", () => {
    const doc = z.parse(zostr.nip11.relayInformationDocument(), { name: "x" });
    const name: string | undefined = doc.name;
    expect(name).toBe("x");

    const pubkey = "a".repeat(64);
    const nj = z.parse(zostr.nip05.nostrJsonDocument(), {
      names: { bob: pubkey },
    });
    const names: Record<string, string> = nj.names;
    expect(names).toEqual({ bob: pubkey });
  });

  it("nip45.countRequest() validates a NIP-45 COUNT request tuple", () => {
    expect(
      z.parse(zostr.nip45.countRequest(), [
        "COUNT",
        "sub1",
        { kinds: [1] },
        {},
      ]),
    ).toBeTruthy();
    // Count-everything sends a single empty {} filter.
    expect(
      z.parse(zostr.nip45.countRequest(), ["COUNT", "sub1", {}]),
    ).toBeTruthy();
    // At least one filter is required (matching NIP-01's REQ grammar).
    expect(() =>
      z.parse(zostr.nip45.countRequest(), ["COUNT", "sub1"]),
    ).toThrow();

    expect(() =>
      z.parse(zostr.nip45.countRequest(), ["REQ", "sub1"]),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip45.countRequest(), ["COUNT", "", {}]),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip45.countRequest(), ["COUNT", "sub1", { foo: ["x"] }]),
    ).toThrow();
  });

  it("nip45.countResponse()/count() validate a NIP-45 COUNT response", () => {
    expect(
      z.parse(zostr.nip45.countResponse(), ["COUNT", "sub1", { count: 0 }]),
    ).toBeTruthy();
    const hll = "0".repeat(512);
    expect(
      z.parse(zostr.nip45.countResponse(), [
        "COUNT",
        "sub1",
        { count: 2044, approximate: true, hll },
      ]),
    ).toBeTruthy();

    expect(z.parse(zostr.nip45.count(), { count: 42 })).toEqual({ count: 42 });
    // count is a non-negative integer (relays may return a probabilistic estimate).
    expect(() => z.parse(zostr.nip45.count(), { count: -1 })).toThrow();
    expect(() => z.parse(zostr.nip45.count(), { count: 1.5 })).toThrow();
    expect(() => z.parse(zostr.nip45.count(), { count: Number.NaN })).toThrow();
    expect(() => z.parse(zostr.nip45.count(), {})).toThrow();
    // hll is a 512-char hex string (256 uint8 registers); NIP-45 doesn't
    // mandate lowercase, so upper/mixed case is accepted.
    expect(
      z.parse(zostr.nip45.count(), { count: 1, hll: "A".repeat(512) }),
    ).toBeTruthy();
    expect(
      z.parse(zostr.nip45.count(), { count: 1, hll: "aF".repeat(256) }),
    ).toBeTruthy();
    expect(() =>
      z.parse(zostr.nip45.count(), { count: 1, hll: "0".repeat(511) }),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip45.count(), { count: 1, hll: "z".repeat(512) }),
    ).toThrow();
    // Unknown keys are stripped.
    expect(z.parse(zostr.nip45.count(), { count: 1, extra: true })).toEqual({
      count: 1,
    });
  });

  it("nip45.* infer precise output types", () => {
    const res = z.parse(zostr.nip45.countResponse(), [
      "COUNT",
      "sub1",
      { count: 5 },
    ]);
    const c: number = res[2].count;
    const approximate: boolean | undefined = res[2].approximate;
    expect(c).toBe(5);
    expect(approximate).toBeUndefined();

    const req = z.parse(zostr.nip45.countRequest(), [
      "COUNT",
      "sub1",
      { kinds: [1] },
    ]);
    // req[2] is the required first filter (no `?.`) — pins that the third
    // tuple element is non-optional, not just `filter | undefined`.
    const reqKinds: number[] | undefined = req[2].kinds;
    expect(reqKinds).toEqual([1]);
  });

  it("nip42.authEvent() enforces kind === 22242", () => {
    const sk = generateSecretKey();
    const now = Math.floor(Date.now() / 1000);
    const authEvent = finalizeEvent(
      {
        kind: 22242,
        created_at: now,
        tags: [
          ["relay", "wss://relay.example.com/"],
          ["challenge", "challengestringhere"],
        ],
        content: "",
      },
      sk,
    );
    const wrongKind = finalizeEvent(
      { kind: 1, created_at: now, tags: [], content: "hi" },
      sk,
    );

    expect(z.parse(zostr.nip42.authEvent(), authEvent)).toBeTruthy();
    expect(() => z.parse(zostr.nip42.authEvent(), wrongKind)).toThrow();
  });

  it("nip42.challengeMessage()/authMessage() validate AUTH tuples", () => {
    const sk = generateSecretKey();
    const authEvent = finalizeEvent(
      {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["challenge", "abc"]],
        content: "",
      },
      sk,
    );

    expect(
      z.parse(zostr.nip42.challengeMessage(), ["AUTH", "challengestringhere"]),
    ).toBeTruthy();
    expect(
      z.parse(zostr.nip42.authMessage(), ["AUTH", authEvent]),
    ).toBeTruthy();

    // The two directions carry different payloads (string vs. event) and don't
    // validate as each other.
    expect(() =>
      z.parse(zostr.nip42.authMessage(), ["AUTH", "challengestringhere"]),
    ).toThrow();
    expect(() =>
      z.parse(zostr.nip42.challengeMessage(), ["AUTH", authEvent]),
    ).toThrow();
    // authMessage rejects a non-22242 event.
    const note = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );
    expect(() => z.parse(zostr.nip42.authMessage(), ["AUTH", note])).toThrow();
  });

  it("nip42 opt-in checks verify signature, challenge/relay tags, and created_at recency", () => {
    const sk = generateSecretKey();
    const now = Math.floor(Date.now() / 1000);
    const relay = "wss://relay.example.com/";
    const challenge = "challengestringhere";
    const authEvent = finalizeEvent(
      {
        kind: 22242,
        created_at: now,
        tags: [
          ["relay", relay],
          ["challenge", challenge],
        ],
        content: "",
      },
      sk,
    );

    const verified = zostr.nip42
      .authEvent()
      .check(zostr.signatureCheck())
      .check(zostr.nip42.challengeTagCheck(challenge))
      .check(zostr.nip42.relayTagCheck(relay))
      .check(zostr.nip42.createdAtCheck(now));
    expect(z.parse(verified, authEvent)).toBeTruthy();

    // Wrong challenge / relay / stale created_at each fail their check.
    expect(() =>
      z.parse(
        zostr.nip42.authEvent().check(zostr.nip42.challengeTagCheck("nope")),
        authEvent,
      ),
    ).toThrow();
    expect(() =>
      z.parse(
        zostr.nip42
          .authEvent()
          .check(zostr.nip42.relayTagCheck("wss://other.example.com/")),
        authEvent,
      ),
    ).toThrow();
    expect(() =>
      z.parse(
        zostr.nip42.authEvent().check(zostr.nip42.createdAtCheck(now + 601)),
        authEvent,
      ),
    ).toThrow();
    // The window is symmetric (Math.abs): drift the other way fails too.
    expect(() =>
      z.parse(
        zostr.nip42.authEvent().check(zostr.nip42.createdAtCheck(now - 601)),
        authEvent,
      ),
    ).toThrow();
    // Within the default ~10 min (600s) tolerance passes.
    expect(
      z.parse(
        zostr.nip42.authEvent().check(zostr.nip42.createdAtCheck(now + 599)),
        authEvent,
      ),
    ).toBeTruthy();
  });

  it("nip42.* infer precise output types", () => {
    const challenge = z.parse(zostr.nip42.challengeMessage(), ["AUTH", "abc"]);
    // challenge[1] is the challenge string (no `?.`).
    const c: string = challenge[1];
    expect(c).toBe("abc");

    const sk = generateSecretKey();
    const signed = finalizeEvent(
      { kind: 22242, created_at: 0, tags: [], content: "" },
      sk,
    );
    const auth = z.parse(zostr.nip42.authMessage(), ["AUTH", signed]);
    // auth[1] is the auth event object (not a string) — kind is a number.
    const kind: number = auth[1].kind;
    expect(kind).toBe(22242);
  });
});
