import { nip19 } from "nostr-tools";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

// Sample bare bech32 entities (no `nostr:` scheme) for each supported type.
const pk = getPublicKey(generateSecretKey());
const id = "a".repeat(64);
const bares = {
  npub: nip19.npubEncode(pk),
  note: nip19.noteEncode(id),
  nprofile: nip19.nprofileEncode({ pubkey: pk, relays: [] }),
  nevent: nip19.neventEncode({ id, relays: [] }),
  naddr: nip19.naddrEncode({
    identifier: "d",
    pubkey: pk,
    kind: 30023,
    relays: [],
  }),
} as const;
const nsec = nip19.nsecEncode(generateSecretKey());

const PREFIXES = ["npub", "note", "nprofile", "nevent", "naddr"] as const;

// Per-entity table: `other` is a different entity's type, used to prove each
// factory is wired to its own NIP-19 codec (a mis-wire would decode it happily).
const PER_ENTITY = [
  { name: "npub", other: "note" },
  { name: "note", other: "npub" },
  { name: "nprofile", other: "npub" },
  { name: "nevent", other: "npub" },
  { name: "naddr", other: "npub" },
] as const;

describe.each(FLAVORS)("zostr NIP-21 nostr: URIs ($name)", ({ zostr, z }) => {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic per-entity factory lookup across the fixed table.
  const factory: Record<(typeof PREFIXES)[number], () => any> = {
    npub: () => zostr.nip21.npub(),
    note: () => zostr.nip21.note(),
    nprofile: () => zostr.nip21.nprofile(),
    nevent: () => zostr.nip21.nevent(),
    naddr: () => zostr.nip21.naddr(),
  };

  describe("uri() validation-only schema", () => {
    it("accepts every supported entity and returns the string unchanged", () => {
      const schema = zostr.nip21.uri();
      for (const name of PREFIXES) {
        const uri = `nostr:${bares[name]}`;
        expect(z.parse(schema, uri)).toBe(uri);
      }
    });

    it("uri(prefix) narrows to a single entity", () => {
      expect(
        z.safeParse(zostr.nip21.uri("npub"), `nostr:${bares.npub}`).success,
      ).toBe(true);
      expect(
        z.safeParse(zostr.nip21.uri("npub"), `nostr:${bares.note}`).success,
      ).toBe(false);
    });

    it("accepts a case-insensitive scheme (RFC 3986 §3.1)", () => {
      const schema = zostr.nip21.uri();
      expect(z.parse(schema, `NOSTR:${bares.npub}`)).toBe(
        `NOSTR:${bares.npub}`,
      );
      expect(z.parse(schema, `Nostr:${bares.npub}`)).toBe(
        `Nostr:${bares.npub}`,
      );
    });

    it("rejects the excluded/unsupported entities (nsec, ncryptsec, nrelay)", () => {
      const schema = zostr.nip21.uri();
      expect(z.safeParse(schema, `nostr:${nsec}`).success).toBe(false);
      // ncryptsec (NIP-49) and nrelay (deprecated) are unmodeled; a bare prefix
      // is enough — secret prefixes are rejected before any bech32 decoding.
      expect(z.safeParse(schema, "nostr:ncryptsec1qqqqqqqqqq").success).toBe(
        false,
      );
      expect(z.safeParse(schema, "nostr:nrelay1qqqqqqqqqq").success).toBe(
        false,
      );
    });

    it("rejects bare bech32, non-URI strings, and an empty entity", () => {
      const schema = zostr.nip21.uri();
      expect(z.safeParse(schema, bares.npub).success).toBe(false);
      expect(z.safeParse(schema, "hello").success).toBe(false);
      expect(z.safeParse(schema, "nostr:").success).toBe(false);
    });

    it("rejects whitespace, query, fragment, suffix, and a doubled scheme", () => {
      const schema = zostr.nip21.uri();
      const npub = bares.npub;
      const bad = [
        ` nostr:${npub}`,
        `nostr:${npub} `,
        `nostr: ${npub}`,
        `nostr:${npub}?x=1`,
        `nostr:${npub}#frag`,
        `nostr:${npub}extra`,
        `nostr:nostr:${npub}`,
      ];
      for (const value of bad) {
        expect(z.safeParse(schema, value).success, value).toBe(false);
      }
    });
  });

  describe("per-entity codecs", () => {
    it.each(PER_ENTITY)(
      "$name codec: exact-prefix round-trip, case-canonical encode, correct wiring",
      ({ name, other }) => {
        const codec = factory[name]();
        const uri = `nostr:${bares[name]}`;

        // value -> nostr:<expected-prefix> -> value
        const decoded = z.decode(codec, uri);
        const reEncoded = z.encode(codec, decoded);
        expect(reEncoded).toBe(uri);
        expect(reEncoded.startsWith(`nostr:${name}1`)).toBe(true);
        expect(z.decode(codec, reEncoded)).toEqual(decoded);

        // uppercase/mixed-case scheme decodes, then encodes lowercase-canonical
        const fromUpper = z.decode(codec, `NOSTR:${bares[name]}`);
        expect(fromUpper).toEqual(decoded);
        expect(z.encode(codec, fromUpper)).toBe(uri);

        // factory wiring: this factory rejects a different entity's URI
        expect(z.safeDecode(codec, `nostr:${bares[other]}`).success).toBe(
          false,
        );
      },
    );
  });

  describe("any() codec -> { type, data } discriminated union", () => {
    it("decodes each entity to its discriminated branch", () => {
      const codec = zostr.nip21.any();

      expect(z.decode(codec, `nostr:${bares.npub}`)).toEqual({
        type: "npub",
        data: pk,
      });
      expect(z.decode(codec, `nostr:${bares.note}`)).toEqual({
        type: "note",
        data: id,
      });

      const nprofile = z.decode(codec, `nostr:${bares.nprofile}`);
      expect(nprofile.type).toBe("nprofile");
      if (nprofile.type === "nprofile") {
        expect(nprofile.data.pubkey).toBe(pk);
      }
    });

    it("accepts a case-insensitive scheme on decode", () => {
      expect(z.decode(zostr.nip21.any(), `NOSTR:${bares.npub}`)).toEqual({
        type: "npub",
        data: pk,
      });
    });

    it.each(PER_ENTITY)("round-trips $name", ({ name }) => {
      const codec = zostr.nip21.any();
      const uri = `nostr:${bares[name]}`;
      const decoded = z.decode(codec, uri);
      expect(decoded.type).toBe(name);
      const reEncoded = z.encode(codec, decoded);
      expect(reEncoded).toBe(uri);
      expect(z.decode(codec, reEncoded)).toEqual(decoded);
    });

    it("encode: the type tag selects the prefix (same hex, npub vs note)", () => {
      const codec = zostr.nip21.any();
      const asNpub = z.encode(codec, { type: "npub", data: pk });
      const asNote = z.encode(codec, { type: "note", data: pk });
      expect(asNpub.startsWith("nostr:npub1")).toBe(true);
      expect(asNote.startsWith("nostr:note1")).toBe(true);
      expect(asNpub).not.toBe(asNote);
    });

    it("encode rejects a type/data mismatch", () => {
      const codec = zostr.nip21.any();
      expect(
        // @ts-expect-error npub data must be a hex string, not a pointer object
        z.safeEncode(codec, { type: "npub", data: { pubkey: pk, relays: [] } })
          .success,
      ).toBe(false);
    });

    it("encode rejects an unknown type tag", () => {
      const codec = zostr.nip21.any();
      expect(
        // @ts-expect-error "nsec" is not a supported NIP-21 URI entity
        z.safeEncode(codec, { type: "nsec", data: pk }).success,
      ).toBe(false);
    });

    it("encode rejects unknown keys on the branch and on the pointer data", () => {
      const codec = zostr.nip21.any();
      expect(
        // @ts-expect-error the branch object rejects unknown keys
        z.safeEncode(codec, { type: "npub", data: pk, extra: 1 }).success,
      ).toBe(false);
      expect(
        z.safeEncode(codec, {
          type: "nprofile",
          // @ts-expect-error the pointer shape rejects unknown keys
          data: { pubkey: pk, relays: [], extra: 1 },
        }).success,
      ).toBe(false);
    });
  });
});
