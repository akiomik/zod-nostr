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

  it("nip01.metadata() decodes/validates kind:0 content JSON", () => {
    const content = JSON.stringify({
      name: "bob",
      display_name: "Bob",
      picture: "https://example.com/b.png",
      nip05: "bob@example.com",
    });

    const metadata = z.decode(zostr.nip01.metadata(), content);
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
    expect(z.parse(zostr.clientMessage.req(), ["REQ", "sub1"])).toBeTruthy();
    expect(
      z.parse(zostr.clientMessage.close(), ["CLOSE", "sub1"]),
    ).toBeTruthy();

    const any = zostr.clientMessage.any();
    expect(z.parse(any, ["CLOSE", "sub1"])).toBeTruthy();
    expect(() => z.parse(any, ["EOSE", "sub1"])).toThrow();
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
});
