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

  it("nip01.metadata() decodes/validates kind:0 content JSON, via both top-level and instance methods", () => {
    const content = JSON.stringify({
      name: "alice",
      display_name: "Alice",
      picture: "https://example.com/a.png",
      nip05: "alice@example.com",
    });
    const codec = zostr.nip01.metadata();

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
      () => zostr.nip05(),
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
      () => zostr.nip01.metadata(),
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
    expect(zostr.clientMessage.req().parse(["REQ", "sub1"])).toBeTruthy();
    expect(zostr.clientMessage.close().parse(["CLOSE", "sub1"])).toBeTruthy();

    const any = zostr.clientMessage.any();
    expect(any.parse(["CLOSE", "sub1"])).toBeTruthy();
    expect(() => any.parse(["EOSE", "sub1"])).toThrow();
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
});
