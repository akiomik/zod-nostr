import { nip19 } from "nostr-tools";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zostr } from "./classic.js";

describe("zostr (classic)", () => {
  it("pubkey() embeds into z.object()", () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const schema = z.object({ pubkey: zostr.pubkey() });

    expect(schema.parse({ pubkey: pk })).toEqual({ pubkey: pk });
    expect(() => schema.parse({ pubkey: "not-hex" })).toThrow();
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

    expect(schema.parse(signed)).toBeTruthy();
    expect(() => schema.parse(tampered)).toThrow();
    expect(() => schema.parse({ ...signed, pubkey: "not-hex" })).toThrow();
  });

  it("eventTemplate() / unsignedEvent() validate structure only", () => {
    expect(
      zostr.eventTemplate().parse({
        kind: 1,
        created_at: 0,
        tags: [],
        content: "hi",
      }),
    ).toBeTruthy();

    const sk = generateSecretKey();
    expect(
      zostr.unsignedEvent().parse({
        pubkey: getPublicKey(sk),
        kind: 1,
        created_at: 0,
        tags: [],
        content: "hi",
      }),
    ).toBeTruthy();
  });

  it("bech32(prefix) validates format only", () => {
    const sk = generateSecretKey();
    const npub = nip19.npubEncode(getPublicKey(sk));

    expect(z.parse(zostr.bech32("npub"), npub)).toBe(npub);
    expect(() => z.parse(zostr.bech32("nsec"), npub)).toThrow();
  });

  it("npub() codec round-trips pubkey <-> npub, via both top-level and instance methods", () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const codec = zostr.npub();

    const npub = z.encode(codec, pk);
    expect(npub.startsWith("npub1")).toBe(true);
    expect(z.decode(codec, npub)).toBe(pk);

    // classic re-wrapping unlocks native .decode()/.encode() instance methods too
    expect(codec.encode(pk)).toBe(npub);
    expect(codec.decode(npub)).toBe(pk);
  });

  it("nsec() codec round-trips secret key bytes <-> nsec, via both top-level and instance methods", () => {
    const sk = generateSecretKey();
    const codec = zostr.nsec();

    const nsec = z.encode(codec, sk);
    expect(nsec.startsWith("nsec1")).toBe(true);
    expect(z.decode(codec, nsec)).toEqual(sk);

    expect(codec.encode(sk)).toBe(nsec);
    expect(codec.decode(nsec)).toEqual(sk);
  });

  it("note() codec round-trips event id <-> note, via both top-level and instance methods", () => {
    const sk = generateSecretKey();
    const signed = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );
    const codec = zostr.note();

    const note = z.encode(codec, signed.id);
    expect(note.startsWith("note1")).toBe(true);
    expect(z.decode(codec, note)).toBe(signed.id);

    expect(codec.encode(signed.id)).toBe(note);
    expect(codec.decode(note)).toBe(signed.id);
  });

  it("nprofile()/nevent()/naddr() codecs decode structured pointers, via both top-level and instance methods", () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);

    const nprofile = nip19.nprofileEncode({
      pubkey: pk,
      relays: ["wss://relay.example"],
    });
    const nprofileCodec = zostr.nprofile();
    const nprofileExpected = { pubkey: pk, relays: ["wss://relay.example"] };
    expect(z.decode(nprofileCodec, nprofile)).toEqual(nprofileExpected);
    expect(nprofileCodec.decode(nprofile)).toEqual(nprofileExpected);

    const nevent = nip19.neventEncode({ id: "a".repeat(64), kind: 1 });
    const neventCodec = zostr.nevent();
    const neventExpected = {
      id: "a".repeat(64),
      kind: 1,
      relays: [],
      author: undefined,
    };
    expect(z.decode(neventCodec, nevent)).toEqual(neventExpected);
    expect(neventCodec.decode(nevent)).toEqual(neventExpected);

    const naddr = nip19.naddrEncode({
      identifier: "foo",
      pubkey: pk,
      kind: 30023,
    });
    const naddrCodec = zostr.naddr();
    const naddrExpected = {
      identifier: "foo",
      pubkey: pk,
      kind: 30023,
      relays: [],
    };
    expect(z.decode(naddrCodec, naddr)).toEqual(naddrExpected);
    expect(naddrCodec.decode(naddr)).toEqual(naddrExpected);
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
    expect(zostr.nevent().decode(nevent).kind).toBe(70000);
    expect(zostr.naddr().decode(naddrMax).kind).toBe(UINT32_MAX);

    // 2^32 is out of range. A bech32 pointer can't carry a kind that wide over
    // the wire, so pin the upper bound via encode — which validates the pointer
    // schema (with the same `Invalid kind` check) before re-encoding.
    expect(() =>
      zostr.nevent().encode({
        id: "a".repeat(64),
        kind: UINT32_MAX + 1,
        relays: [],
      }),
    ).toThrow();
    expect(() =>
      zostr.naddr().encode({
        identifier: "x",
        pubkey: pk,
        kind: UINT32_MAX + 1,
        relays: [],
      }),
    ).toThrow();
  });

  it("nip01.metadataContent() decodes/validates kind:0 content JSON, via both top-level and instance methods", () => {
    const content = JSON.stringify({
      name: "alice",
      display_name: "Alice",
      picture: "https://example.com/a.png",
      nip05: "alice@example.com",
    });
    const codec = zostr.nip01.metadataContent();

    const metadata = z.decode(codec, content);
    expect(metadata.name).toBe("alice");
    expect(metadata.nip05).toBe("alice@example.com");
    expect(() => z.decode(codec, "not json")).toThrow();

    expect(codec.decode(content)).toEqual(metadata);
    expect(() => codec.decode("not json")).toThrow();
  });

  it("every wrapped event schema and codec exposes the flavor's native .check() (regression: raw core schemas lack it)", () => {
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

  it("every field-level primitive exposes classic's native .optional()/.catch()/.safeParse() (regression: raw core schemas lack these, and even .parse())", () => {
    const primitives: Array<() => { optional: unknown; safeParse: unknown }> = [
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
      const schema = factory();
      expect(typeof schema.optional).toBe("function");
      expect(typeof schema.safeParse).toBe("function");
    }

    expect(zostr.pubkey().catch("fallback").parse(123)).toBe("fallback");
    expect(zostr.pubkey().optional().parse(undefined)).toBeUndefined();
    expect(zostr.pubkey().safeParse(123).success).toBe(false);
  });

  it("every NIP-19/metadata codec exposes native .decode()/.encode() (regression: raw core.$ZodCodec lacks these)", () => {
    const codecFactories: Array<() => { decode: unknown; encode: unknown }> = [
      () => zostr.npub(),
      () => zostr.nsec(),
      () => zostr.note(),
      () => zostr.nprofile(),
      () => zostr.nevent(),
      () => zostr.naddr(),
      () => zostr.nip01.metadataContent(),
    ];

    for (const factory of codecFactories) {
      const codec = factory();
      expect(typeof codec.decode).toBe("function");
      expect(typeof codec.encode).toBe("function");
    }
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

    expect(zostr.nip01.textNote().parse(note)).toBeTruthy();
    expect(() => zostr.nip01.textNote().parse(reaction)).toThrow();
  });

  it("subscriptionId() enforces a non-empty string of at most 64 chars", () => {
    expect(zostr.subscriptionId().parse("sub1")).toBe("sub1");
    expect(() => zostr.subscriptionId().parse("")).toThrow();
    expect(() => zostr.subscriptionId().parse("a".repeat(65))).toThrow();
  });

  it("timestamp() requires an integer (accepts negatives, rejects fractionals)", () => {
    expect(zostr.timestamp().parse(0)).toBe(0);
    expect(zostr.timestamp().parse(1700000000)).toBe(1700000000);
    expect(zostr.timestamp().parse(-1)).toBe(-1);
    for (const invalid of [
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => zostr.timestamp().parse(invalid)).toThrow();
    }
  });

  it("kind() enforces an integer between 0 and 65535", () => {
    expect(zostr.kind().parse(0)).toBe(0);
    expect(zostr.kind().parse(65535)).toBe(65535);
    expect(() => zostr.kind().parse(-1)).toThrow();
    expect(() => zostr.kind().parse(65536)).toThrow();
    expect(() => zostr.kind().parse(1.5)).toThrow();
    expect(() => zostr.kind().parse(Number.NaN)).toThrow();
    expect(() => zostr.kind().parse(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => zostr.kind().parse(Number.NEGATIVE_INFINITY)).toThrow();
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

    expect(zostr.filter().parse(filter)).toEqual(filter);
    expect(zostr.filter().parse({})).toEqual({});
    expect(() => zostr.filter().parse({ nope: ["x"] })).toThrow();
    expect(() => zostr.filter().parse({ "#too-long": ["x"] })).toThrow();
  });

  it("filter() limit enforces a non-negative integer", () => {
    expect(zostr.filter().parse({ limit: 0 })).toEqual({ limit: 0 });
    expect(zostr.filter().parse({ limit: 500 })).toEqual({ limit: 500 });
    expect(() => zostr.filter().parse({ limit: -1 })).toThrow();
    expect(() => zostr.filter().parse({ limit: 1.5 })).toThrow();
    expect(() => zostr.filter().parse({ limit: Number.NaN })).toThrow();
    expect(() =>
      zostr.filter().parse({ limit: Number.POSITIVE_INFINITY }),
    ).toThrow();
  });

  it("relayMessage.* validate NIP-01 relay-to-client message tuples", () => {
    const sk = generateSecretKey();
    const signed = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );

    expect(
      zostr.relayMessage.event().parse(["EVENT", "sub1", signed]),
    ).toBeTruthy();
    expect(
      zostr.relayMessage.ok().parse(["OK", signed.id, true, ""]),
    ).toBeTruthy();
    expect(zostr.relayMessage.eose().parse(["EOSE", "sub1"])).toBeTruthy();
    expect(
      zostr.relayMessage.closed().parse(["CLOSED", "sub1", "reason"]),
    ).toBeTruthy();
    expect(zostr.relayMessage.notice().parse(["NOTICE", "hello"])).toBeTruthy();

    expect(() =>
      zostr.relayMessage.event().parse(["NOTICE", "sub1", signed]),
    ).toThrow();

    const any = zostr.relayMessage.any();
    expect(any.parse(["EOSE", "sub1"])).toBeTruthy();
    expect(() => any.parse(["REQ", "sub1"])).toThrow();
  });

  it("clientMessage.* validate NIP-01 client-to-relay message tuples", () => {
    const sk = generateSecretKey();
    const signed = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );

    expect(zostr.clientMessage.event().parse(["EVENT", signed])).toBeTruthy();
    expect(
      zostr.clientMessage.req().parse(["REQ", "sub1", { kinds: [1] }, {}]),
    ).toBeTruthy();
    // Request-everything sends a single empty {} filter.
    expect(zostr.clientMessage.req().parse(["REQ", "sub1", {}])).toBeTruthy();
    // At least one filter is required (matching NIP-01's REQ grammar).
    expect(() => zostr.clientMessage.req().parse(["REQ", "sub1"])).toThrow();
    expect(zostr.clientMessage.close().parse(["CLOSE", "sub1"])).toBeTruthy();

    const any = zostr.clientMessage.any();
    expect(any.parse(["CLOSE", "sub1"])).toBeTruthy();
    expect(any.parse(["REQ", "sub1", {}])).toBeTruthy();
    // any() also enforces REQ's at-least-one-filter rule.
    expect(() => any.parse(["REQ", "sub1"])).toThrow();
    expect(() => any.parse(["EOSE", "sub1"])).toThrow();
  });

  it("tags()/filter()/relayMessage.*/clientMessage.* infer precise output types (regression: previously fell back to unknown/unknown[] because classic.ts re-wrapped them through the generic classicSchema() helper, which infers T from a bare Ctor reference rather than the actual core schema — see #10)", () => {
    const t = zostr.tags().parse([["a"]]);
    const tagChar: string | undefined = t[0]?.[0];
    expect(tagChar).toBe("a");

    const f = zostr.filter().parse({ kinds: [1] });
    const kinds: number[] | undefined = f.kinds;
    expect(kinds).toEqual([1]);

    const ok = zostr.relayMessage.ok().parse(["OK", "a".repeat(64), true, ""]);
    const accepted: boolean = ok[2];
    const message: string = ok[3];
    expect(accepted).toBe(true);
    expect(message).toBe("");

    const any = zostr.relayMessage.any().parse(["EOSE", "sub1"]);
    if (any[0] === "EOSE") {
      const subId: string = any[1];
      expect(subId).toBe("sub1");
    }

    const req = zostr.clientMessage
      .req()
      .parse(["REQ", "sub1", { kinds: [1] }]);
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
      zostr.relayMessage.ok().parse(["OK", eventId, false, "nope"]),
    ).toBeTruthy();

    // Accepted (true): message MAY be empty/unprefixed per NIP-01.
    expect(checked.parse(["OK", eventId, true, ""])).toBeTruthy();
    expect(checked.parse(["OK", eventId, true, "anything"])).toBeTruthy();

    // Rejected (false): message MUST follow "<prefix>: <message>".
    expect(
      checked.parse(["OK", eventId, false, "duplicate: already have this"]),
    ).toBeTruthy();
    expect(() => checked.parse(["OK", eventId, false, "nope"])).toThrow();
    expect(() => checked.parse(["OK", eventId, false, ""])).toThrow();
  });

  it("relayMessage.closedMessagePrefixCheck() enforces the '<prefix>: <message>' format, prefix isn't restricted to NIP-01's standardized list", () => {
    const checked = zostr.relayMessage
      .closed()
      .check(zostr.relayMessage.closedMessagePrefixCheck());

    // Not composed by default: an unprefixed reason parses fine.
    expect(
      zostr.relayMessage.closed().parse(["CLOSED", "sub1", "nope"]),
    ).toBeTruthy();

    expect(
      checked.parse(["CLOSED", "sub1", "error: could not connect"]),
    ).toBeTruthy();
    // NIP-01's own CLOSED example uses a prefix outside the "standardized" list.
    expect(
      checked.parse(["CLOSED", "sub1", "unsupported: unknown filter field"]),
    ).toBeTruthy();
    expect(() => checked.parse(["CLOSED", "sub1", "nope"])).toThrow();
    expect(() => checked.parse(["CLOSED", "sub1", ""])).toThrow();
  });

  it("nip05.nostrJsonDocument() validates a full document", () => {
    const pubkey = getPublicKey(generateSecretKey());
    const doc = {
      names: { bob: pubkey },
      relays: {
        [pubkey]: ["wss://relay.example.com", "wss://relay2.example.com"],
      },
    };

    expect(zostr.nip05.nostrJsonDocument().parse(doc)).toEqual(doc);
  });

  it("nip05.nostrJsonDocument() requires names but treats relays as optional", () => {
    const pubkey = getPublicKey(generateSecretKey());
    expect(
      zostr.nip05.nostrJsonDocument().parse({ names: { bob: pubkey } }),
    ).toEqual({ names: { bob: pubkey } });
    expect(() => zostr.nip05.nostrJsonDocument().parse({})).toThrow();
  });

  it("nip05.nostrJsonDocument() validates names/relays pubkeys as 64-char lowercase hex", () => {
    const pubkey = getPublicKey(generateSecretKey());
    expect(() =>
      zostr.nip05.nostrJsonDocument().parse({ names: { bob: "not-hex" } }),
    ).toThrow();
    expect(() =>
      zostr.nip05.nostrJsonDocument().parse({
        names: { bob: pubkey.toUpperCase() },
      }),
    ).toThrow();
    expect(() =>
      zostr.nip05.nostrJsonDocument().parse({
        names: { bob: pubkey },
        relays: { "not-hex": ["wss://relay.example.com"] },
      }),
    ).toThrow();
  });

  it("nip05.nostrJsonDocument() validates names keys as local-part characters and strips unknown top-level keys", () => {
    const pubkey = getPublicKey(generateSecretKey());
    expect(() =>
      zostr.nip05.nostrJsonDocument().parse({ names: { "bob!": pubkey } }),
    ).toThrow();
    // Local-part is lowercase-only per NIP-05; uppercase names keys are rejected.
    expect(() =>
      zostr.nip05.nostrJsonDocument().parse({ names: { Bob: pubkey } }),
    ).toThrow();

    expect(
      zostr.nip05
        .nostrJsonDocument()
        .parse({ names: { bob: pubkey }, extra: "y" }),
    ).toEqual({ names: { bob: pubkey } });
  });

  it("nip11.relayInformationDocument() validates a full document", () => {
    const doc = {
      name: "relay.example",
      description: "an example relay",
      banner: "https://example.com/banner.png",
      icon: "https://example.com/icon.png",
      pubkey: "a".repeat(64),
      self: "b".repeat(64),
      contact: "admin@example.com",
      supported_nips: [1, 11, 42],
      software: "https://example.com/software",
      version: "1.0.0",
      terms_of_service: "https://example.com/tos",
      payments_url: "https://example.com/pay",
      limitation: {
        max_message_length: 16384,
        max_subscriptions: 10,
        auth_required: false,
        payment_required: false,
        restricted_writes: false,
      },
      fees: {
        admission: [{ amount: 1000000, unit: "msats" }],
        publication: [{ amount: 100, unit: "msats", kinds: [1] }],
      },
    };

    expect(zostr.nip11.relayInformationDocument().parse(doc)).toEqual(doc);
  });

  it("nip11.relayInformationDocument() treats every field as optional and strips unknown keys", () => {
    expect(zostr.nip11.relayInformationDocument().parse({})).toEqual({});
    expect(
      zostr.nip11.relayInformationDocument().parse({ name: "x", extra: "y" }),
    ).toEqual({ name: "x" });
  });

  it("nip11.relayInformationDocument() validates pubkey/self as 64-char hex", () => {
    expect(() =>
      zostr.nip11.relayInformationDocument().parse({ pubkey: "not-hex" }),
    ).toThrow();
    expect(() =>
      zostr.nip11.relayInformationDocument().parse({ self: "not-hex" }),
    ).toThrow();
  });

  it("nip11.relayInformationDocument() validates banner/icon/terms_of_service/payments_url as URLs", () => {
    expect(() =>
      zostr.nip11.relayInformationDocument().parse({ banner: "not-a-url" }),
    ).toThrow();
    expect(() =>
      zostr.nip11.relayInformationDocument().parse({ icon: "not-a-url" }),
    ).toThrow();
    expect(() =>
      zostr.nip11
        .relayInformationDocument()
        .parse({ terms_of_service: "not-a-url" }),
    ).toThrow();
    expect(() =>
      zostr.nip11
        .relayInformationDocument()
        .parse({ payments_url: "not-a-url" }),
    ).toThrow();

    // software/contact are left as plain strings, same as rust-nostr
    expect(
      zostr.nip11
        .relayInformationDocument()
        .parse({ software: "git+https://example.com/repo.git" }),
    ).toEqual({ software: "git+https://example.com/repo.git" });
    expect(
      zostr.nip11
        .relayInformationDocument()
        .parse({ contact: "admin@example.com" }),
    ).toEqual({ contact: "admin@example.com" });
  });

  it("nip11.relayInformationDocument() validates numeric fields by their spec-defined form", () => {
    const doc = zostr.nip11.relayInformationDocument();
    // count/length fields: non-negative integers (0 allowed)
    expect(() => doc.parse({ limitation: { max_limit: -1 } })).toThrow();
    expect(() => doc.parse({ limitation: { default_limit: 1.5 } })).toThrow();
    expect(() =>
      doc.parse({ limitation: { max_message_length: Number.NaN } }),
    ).toThrow();
    expect(doc.parse({ limitation: { min_pow_difficulty: 0 } })).toEqual({
      limitation: { min_pow_difficulty: 0 },
    });
    // min_pow_difficulty is intentionally left an unbounded non-negative
    // integer: NIP-13's derived 0..256 range is not baked in, so 257 is accepted
    expect(doc.parse({ limitation: { min_pow_difficulty: 257 } })).toEqual({
      limitation: { min_pow_difficulty: 257 },
    });
    // created_at_*_limit are relative durations in seconds: non-negative
    // integers, so negatives and fractions are rejected
    expect(() =>
      doc.parse({ limitation: { created_at_lower_limit: -1 } }),
    ).toThrow();
    expect(() =>
      doc.parse({ limitation: { created_at_upper_limit: 1.5 } }),
    ).toThrow();
    expect(
      doc.parse({ limitation: { created_at_lower_limit: 94608000 } }),
    ).toEqual({ limitation: { created_at_lower_limit: 94608000 } });
    // fees.amount is a non-negative finite number (unit is free-form, so
    // fractions like 0.5 are allowed); period is a non-negative integer;
    // kinds are NIP-01 event kinds (0..65535)
    expect(
      doc.parse({ fees: { admission: [{ amount: 0.5, unit: "BTC" }] } }),
    ).toEqual({ fees: { admission: [{ amount: 0.5, unit: "BTC" }] } });
    expect(() =>
      doc.parse({ fees: { admission: [{ amount: -1, unit: "msats" }] } }),
    ).toThrow();
    // amount must be finite: NaN/Infinity are rejected
    expect(() =>
      doc.parse({
        fees: { admission: [{ amount: Number.NaN, unit: "msats" }] },
      }),
    ).toThrow();
    expect(() =>
      doc.parse({
        fees: {
          admission: [{ amount: Number.POSITIVE_INFINITY, unit: "msats" }],
        },
      }),
    ).toThrow();
    expect(() =>
      doc.parse({
        fees: {
          admission: [{ amount: 1, unit: "msats", period: 1.5 }],
        },
      }),
    ).toThrow();
    expect(() =>
      doc.parse({
        fees: { publication: [{ amount: 1, unit: "msats", kinds: [65536] }] },
      }),
    ).toThrow();
    // supported_nips are non-negative integers
    expect(() => doc.parse({ supported_nips: [1, -2] })).toThrow();
  });

  it("nip11.relayInformationDocument()/nip05.nostrJsonDocument() infer precise output types (regression: previously fell back to unknown because classic.ts re-wrapped them through the generic classicSchema() helper — see #15)", () => {
    const doc = zostr.nip11.relayInformationDocument().parse({ name: "x" });
    const name: string | undefined = doc.name;
    expect(name).toBe("x");

    const pubkey = "a".repeat(64);
    const nj = zostr.nip05.nostrJsonDocument().parse({
      names: { bob: pubkey },
    });
    const names: Record<string, string> = nj.names;
    expect(names).toEqual({ bob: pubkey });
  });

  it("nip45.countRequest() validates a NIP-45 COUNT request tuple", () => {
    expect(
      zostr.nip45.countRequest().parse(["COUNT", "sub1", { kinds: [1] }, {}]),
    ).toBeTruthy();
    // Count-everything sends a single empty {} filter.
    expect(
      zostr.nip45.countRequest().parse(["COUNT", "sub1", {}]),
    ).toBeTruthy();
    // At least one filter is required (matching NIP-01's REQ grammar).
    expect(() => zostr.nip45.countRequest().parse(["COUNT", "sub1"])).toThrow();

    expect(() => zostr.nip45.countRequest().parse(["REQ", "sub1"])).toThrow();
    expect(() => zostr.nip45.countRequest().parse(["COUNT", "", {}])).toThrow();
    // Filters are still validated (unknown filter key rejected).
    expect(() =>
      zostr.nip45.countRequest().parse(["COUNT", "sub1", { foo: ["x"] }]),
    ).toThrow();
  });

  it("nip45.countResponse()/count() validate a NIP-45 COUNT response", () => {
    expect(
      zostr.nip45.countResponse().parse(["COUNT", "sub1", { count: 0 }]),
    ).toBeTruthy();
    const hll = "0".repeat(512);
    expect(
      zostr.nip45
        .countResponse()
        .parse(["COUNT", "sub1", { count: 2044, approximate: true, hll }]),
    ).toBeTruthy();

    expect(zostr.nip45.count().parse({ count: 42 })).toEqual({ count: 42 });
    // count is a non-negative integer (relays may return a probabilistic estimate).
    expect(() => zostr.nip45.count().parse({ count: -1 })).toThrow();
    expect(() => zostr.nip45.count().parse({ count: 1.5 })).toThrow();
    expect(() => zostr.nip45.count().parse({ count: Number.NaN })).toThrow();
    expect(() => zostr.nip45.count().parse({})).toThrow();
    // hll is a 512-char hex string (256 uint8 registers); NIP-45 doesn't
    // mandate lowercase, so upper/mixed case is accepted.
    expect(
      zostr.nip45.count().parse({ count: 1, hll: "A".repeat(512) }),
    ).toBeTruthy();
    expect(
      zostr.nip45.count().parse({ count: 1, hll: "aF".repeat(256) }),
    ).toBeTruthy();
    expect(() =>
      zostr.nip45.count().parse({ count: 1, hll: "0".repeat(511) }),
    ).toThrow();
    expect(() =>
      zostr.nip45.count().parse({ count: 1, hll: "z".repeat(512) }),
    ).toThrow();
    // Unknown keys are stripped.
    expect(zostr.nip45.count().parse({ count: 1, extra: true })).toEqual({
      count: 1,
    });
  });

  it("nip45.* infer precise output types", () => {
    const res = zostr.nip45
      .countResponse()
      .parse(["COUNT", "sub1", { count: 5 }]);
    const c: number = res[2].count;
    const approximate: boolean | undefined = res[2].approximate;
    expect(c).toBe(5);
    expect(approximate).toBeUndefined();

    const req = zostr.nip45
      .countRequest()
      .parse(["COUNT", "sub1", { kinds: [1] }]);
    // req[2] is the required first filter (no `?.`) — pins that the third
    // tuple element is non-optional, not just `filter | undefined`.
    const reqKinds: number[] | undefined = req[2].kinds;
    expect(reqKinds).toEqual([1]);
  });

  it("nip67.eose() accepts the two- and three-element EOSE wire shapes", () => {
    // The bare NIP-01 form (a NIP-67 relay still sends it).
    expect(zostr.nip67.eose().parse(["EOSE", "sub1"])).toEqual([
      "EOSE",
      "sub1",
    ]);
    // Defined hints.
    expect(zostr.nip67.eose().parse(["EOSE", "sub1", ["finish"]])).toEqual([
      "EOSE",
      "sub1",
      ["finish"],
    ]);
    expect(zostr.nip67.eose().parse(["EOSE", "sub1", ["more"]])).toBeTruthy();
    // The array MAY be empty and MAY carry multiple hints.
    expect(zostr.nip67.eose().parse(["EOSE", "sub1", []])).toBeTruthy();
    expect(
      zostr.nip67.eose().parse(["EOSE", "sub1", ["finish", "more"]]),
    ).toBeTruthy();
    // Unknown hint values are accepted as plain strings (no enum baked in).
    expect(zostr.nip67.eose().parse(["EOSE", "sub1", ["future"]])).toBeTruthy();
  });

  it("nip67.eose() rejects non-wire and malformed shapes", () => {
    // The hints must be an array of strings, not a bare string...
    expect(() =>
      zostr.nip67.eose().parse(["EOSE", "sub1", "finish"]),
    ).toThrow();
    // ...nor an array containing non-strings.
    expect(() => zostr.nip67.eose().parse(["EOSE", "sub1", [1]])).toThrow();
    // An explicit `undefined` third element is not a JSON wire shape (the union
    // of exact tuples rejects it, unlike an optional-tuple item would).
    expect(() =>
      zostr.nip67.eose().parse(["EOSE", "sub1", undefined]),
    ).toThrow();
    // No fourth element.
    expect(() =>
      zostr.nip67.eose().parse(["EOSE", "sub1", ["finish"], "extra"]),
    ).toThrow();
    // The subscription id still applies (non-empty).
    expect(() => zostr.nip67.eose().parse(["EOSE", "", ["finish"]])).toThrow();
  });

  it("NIP-01 relayMessage.any() rejects a NIP-67 EOSE; a composed union accepts it", () => {
    // relayMessage.any() is NIP-01-only, so the three-element form is rejected.
    expect(() =>
      zostr.relayMessage.any().parse(["EOSE", "sub1", ["finish"]]),
    ).toThrow();
    // The documented composition accepts both NIP-01 messages and NIP-67 EOSE.
    const relayMessage = z.union([
      zostr.relayMessage.any(),
      zostr.nip67.eose(),
    ]);
    expect(relayMessage.parse(["EOSE", "sub1"])).toBeTruthy();
    expect(relayMessage.parse(["EOSE", "sub1", ["finish"]])).toBeTruthy();
    expect(relayMessage.parse(["NOTICE", "hi"])).toBeTruthy();
  });

  it("nip67.eose() infers the precise two-/three-element union type", () => {
    const eose = zostr.nip67.eose().parse(["EOSE", "sub1", ["finish"]]);
    // The hints (when present) are string[].
    const hints: string[] | undefined = eose.length === 3 ? eose[2] : undefined;
    expect(hints).toEqual(["finish"]);
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

    expect(zostr.nip42.authEvent().parse(authEvent)).toBeTruthy();
    expect(() => zostr.nip42.authEvent().parse(wrongKind)).toThrow();
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
      zostr.nip42.challengeMessage().parse(["AUTH", "challengestringhere"]),
    ).toBeTruthy();
    expect(zostr.nip42.authMessage().parse(["AUTH", authEvent])).toBeTruthy();

    // The two directions carry different payloads (string vs. event) and don't
    // validate as each other.
    expect(() =>
      zostr.nip42.authMessage().parse(["AUTH", "challengestringhere"]),
    ).toThrow();
    expect(() =>
      zostr.nip42.challengeMessage().parse(["AUTH", authEvent]),
    ).toThrow();
    // authMessage rejects a non-22242 event.
    const note = finalizeEvent(
      { kind: 1, created_at: 0, tags: [], content: "hi" },
      sk,
    );
    expect(() => zostr.nip42.authMessage().parse(["AUTH", note])).toThrow();
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
    expect(verified.parse(authEvent)).toBeTruthy();

    // Wrong challenge / relay / stale created_at each fail their check.
    expect(() =>
      zostr.nip42
        .authEvent()
        .check(zostr.nip42.challengeTagCheck("nope"))
        .parse(authEvent),
    ).toThrow();
    expect(() =>
      zostr.nip42
        .authEvent()
        .check(zostr.nip42.relayTagCheck("wss://other.example.com/"))
        .parse(authEvent),
    ).toThrow();
    const check = (n: number) =>
      zostr.nip42.authEvent().check(zostr.nip42.createdAtCheck(n));
    // Just outside the default 600s window fails, in both directions (Math.abs).
    expect(() => check(now + 601).parse(authEvent)).toThrow();
    expect(() => check(now - 601).parse(authEvent)).toThrow();
    // The boundary is inclusive: exactly ±600s passes.
    expect(check(now + 600).parse(authEvent)).toBeTruthy();
    expect(check(now - 600).parse(authEvent)).toBeTruthy();
  });

  it("nip42.createdAtCheck() throws on misconfiguration (fails closed, not open)", () => {
    // A NaN/Infinity `now` or tolerance would make Math.abs(...) > tol always
    // false, silently accepting every timestamp — the factory rejects it.
    expect(() => zostr.nip42.createdAtCheck(Number.NaN)).toThrow();
    expect(() => zostr.nip42.createdAtCheck(1000, Number.NaN)).toThrow();
    expect(() =>
      zostr.nip42.createdAtCheck(1000, Number.POSITIVE_INFINITY),
    ).toThrow();
    expect(() => zostr.nip42.createdAtCheck(1000, -1)).toThrow();
  });

  it("nip42.* infer precise output types", () => {
    const challenge = zostr.nip42.challengeMessage().parse(["AUTH", "abc"]);
    // challenge[1] is the challenge string (no `?.`).
    const c: string = challenge[1];
    expect(c).toBe("abc");

    const sk = generateSecretKey();
    const signed = finalizeEvent(
      { kind: 22242, created_at: 0, tags: [], content: "" },
      sk,
    );
    const auth = zostr.nip42.authMessage().parse(["AUTH", signed]);
    // auth[1] is the auth event object; kind infers as the literal 22242.
    const kind: 22242 = auth[1].kind;
    expect(kind).toBe(22242);
  });

  it("nip50.filter() accepts the NIP-01 filter extended with `search`", () => {
    // A plain NIP-01 filter (no search) is still accepted — nip50.filter() is a
    // superset of the base filter.
    expect(zostr.nip50.filter().parse({ kinds: [1] })).toEqual({ kinds: [1] });
    // The `search` string, alone and combined with other fields / tag filters.
    expect(zostr.nip50.filter().parse({ search: "best nostr apps" })).toEqual({
      search: "best nostr apps",
    });
    expect(
      zostr.nip50.filter().parse({ kinds: [1], search: "purple", "#e": ["a"] }),
    ).toBeTruthy();
    // Empty string is spec-valid (NIP-50 places no format constraint on it).
    expect(zostr.nip50.filter().parse({ search: "" })).toEqual({ search: "" });
  });

  it("nip50.filter() rejects a non-string `search` and still rejects unknown keys", () => {
    expect(() => zostr.nip50.filter().parse({ search: 5 })).toThrow();
    // `search` is a plain string, not the `string[]` a tag filter carries.
    expect(() => zostr.nip50.filter().parse({ search: ["x"] })).toThrow();
    // The inherited tag-key check still rejects truly-unknown keys.
    expect(() => zostr.nip50.filter().parse({ foo: ["x"] })).toThrow();
    // The base NIP-01 filter() keeps rejecting `search` (unchanged).
    expect(() => zostr.filter().parse({ search: "x" })).toThrow();
  });

  it("nip50.req() carries search filters and requires at least one filter", () => {
    expect(
      zostr.nip50.req().parse(["REQ", "sub1", { search: "orange" }]),
    ).toBeTruthy();
    // Several filters, mixing a search filter and a plain NIP-01 filter.
    expect(
      zostr.nip50
        .req()
        .parse(["REQ", "sub1", { search: "orange" }, { kinds: [1, 2] }]),
    ).toBeTruthy();
    // A plain filter with no search is accepted (superset of clientMessage.req()).
    expect(
      zostr.nip50.req().parse(["REQ", "sub1", { kinds: [1] }]),
    ).toBeTruthy();
    // At least one filter is required (NIP-01 REQ grammar).
    expect(() => zostr.nip50.req().parse(["REQ", "sub1"])).toThrow();
  });

  it("NIP-01 REQ/COUNT stay search-free; a composed union accepts NIP-50 REQ", () => {
    // clientMessage.req()/any() and nip45.countRequest() reject `search`.
    expect(() =>
      zostr.clientMessage.req().parse(["REQ", "sub1", { search: "x" }]),
    ).toThrow();
    expect(() =>
      zostr.clientMessage.any().parse(["REQ", "sub1", { search: "x" }]),
    ).toThrow();
    expect(() =>
      zostr.nip45.countRequest().parse(["COUNT", "sub1", { search: "x" }]),
    ).toThrow();
    // The documented composition accepts both NIP-01 client messages and NIP-50 REQ.
    const clientMessage = z.union([
      zostr.clientMessage.any(),
      zostr.nip50.req(),
    ]);
    expect(clientMessage.parse(["REQ", "sub1", { search: "x" }])).toBeTruthy();
    expect(clientMessage.parse(["CLOSE", "sub1"])).toBeTruthy();
  });

  it("nip50.* infer precise output types", () => {
    const f = zostr.nip50.filter().parse({ search: "x" });
    const search: string | undefined = f.search;
    expect(search).toBe("x");

    const req = zostr.nip50.req().parse(["REQ", "sub1", { search: "x" }]);
    // req[2] is the required first filter (non-optional); its `search` is string.
    const reqSearch: string | undefined = req[2].search;
    expect(reqSearch).toBe("x");
  });
});
