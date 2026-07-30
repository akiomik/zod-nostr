import { nip19 } from "nostr-tools";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

describe.each(FLAVORS)(
  "zostr NIP-19 bech32 entities ($name)",
  ({ zostr, z }) => {
    it("bech32(prefix) validates the prefix only", () => {
      const npub = nip19.npubEncode(getPublicKey(generateSecretKey()));

      expect(z.parse(zostr.bech32("npub"), npub)).toBe(npub);
      expect(z.safeParse(zostr.bech32("nsec"), npub).success).toBe(false);
    });

    it("npub() codec round-trips pubkey <-> npub", () => {
      const pk = getPublicKey(generateSecretKey());
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

    it("nsec() encode rejects a non-32-byte / non-Uint8Array secret key", () => {
      const codec = zostr.nsec();
      expect(z.safeEncode(codec, new Uint8Array(10)).success).toBe(false);
      // biome-ignore lint/suspicious/noExplicitAny: deliberately encoding a wrong-typed value.
      expect(z.safeEncode(codec, "deadbeef" as any).success).toBe(false);
    });

    it("note() codec round-trips event id <-> note", () => {
      const signed = finalizeEvent(
        { kind: 1, created_at: 0, tags: [], content: "hi" },
        generateSecretKey(),
      );
      const codec = zostr.note();

      const note = z.encode(codec, signed.id);
      expect(note.startsWith("note1")).toBe(true);
      expect(z.decode(codec, note)).toBe(signed.id);
    });

    it("nprofile()/nevent()/naddr() codecs decode structured pointers", () => {
      const pk = getPublicKey(generateSecretKey());

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

    it("nprofile()/nevent()/naddr() codecs encode structured pointers back", () => {
      const pk = getPublicKey(generateSecretKey());

      const nprofile = z.encode(zostr.nprofile(), { pubkey: pk, relays: [] });
      expect(nprofile.startsWith("nprofile1")).toBe(true);
      expect(z.decode(zostr.nprofile(), nprofile)).toEqual({
        pubkey: pk,
        relays: [],
      });

      const nevent = z.encode(zostr.nevent(), {
        id: "a".repeat(64),
        kind: 1,
        relays: [],
      });
      expect(nevent.startsWith("nevent1")).toBe(true);
      expect(z.decode(zostr.nevent(), nevent)).toMatchObject({
        id: "a".repeat(64),
        kind: 1,
      });

      const naddr = z.encode(zostr.naddr(), {
        identifier: "foo",
        pubkey: pk,
        kind: 30023,
        relays: [],
      });
      expect(naddr.startsWith("naddr1")).toBe(true);
      expect(z.decode(zostr.naddr(), naddr)).toMatchObject({
        identifier: "foo",
        pubkey: pk,
        kind: 30023,
      });
    });

    it("nevent()/naddr() validate the pointer kind as a uint32: accept 0..2^32-1, reject 2^32", () => {
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
      expect(
        z.safeEncode(zostr.nevent(), {
          id: "a".repeat(64),
          kind: UINT32_MAX + 1,
          relays: [],
        }).success,
      ).toBe(false);
      expect(
        z.safeEncode(zostr.naddr(), {
          identifier: "x",
          pubkey: pk,
          kind: UINT32_MAX + 1,
          relays: [],
        }).success,
      ).toBe(false);
    });

    it("a NIP-19 pointer is a fixed TLV shape: encode rejects unknown keys", () => {
      const pk = getPublicKey(generateSecretKey());
      expect(z.encode(zostr.nprofile(), { pubkey: pk, relays: [] })).toMatch(
        /^nprofile1/,
      );
      expect(
        // @ts-expect-error extra keys are not part of the pointer shape
        z.safeEncode(zostr.nprofile(), { pubkey: pk, relays: [], extra: "x" })
          .success,
      ).toBe(false);
    });
  },
);
