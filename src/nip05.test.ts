import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

describe.each(FLAVORS)("zostr.nip05.identifier() ($name)", ({ zostr, z }) => {
  it.each(["alice@example.com", "a.b-c_d@sub.example.com", "bob@xyz.onion"])(
    "accepts %s",
    (value) => {
      expect(z.parse(zostr.nip05.identifier(), value)).toBe(value);
    },
  );

  it.each([
    ["no '@' separator", "no-at-sign"],
    ["a leading '@' (empty local part)", "@example.com"],
    ["two '@' separators", "a@@example.com"],
    // local-part is lowercase-only per NIP-05 ("MUST only use a-z0-9-_.")
    ["an uppercase local part", "Alice@example.com"],
    // valid local part, but the domain is not a bare host
    ["a domain carrying a path", "alice@example.com/path"],
    ["a domain carrying whitespace", "alice@exa mple.com"],
  ])("rejects %s", (_label, value) => {
    expect(z.safeParse(zostr.nip05.identifier(), value).success).toBe(false);
  });

  it("formatIdentifier() strips the '_@' root prefix and passes others through", () => {
    // NIP-05: "_@domain" is the domain's root identity, shown as just "domain".
    expect(zostr.nip05.formatIdentifier("_@example.com")).toBe("example.com");
    expect(zostr.nip05.formatIdentifier("alice@example.com")).toBe(
      "alice@example.com",
    );
  });
});

describe.each(FLAVORS)(
  "zostr.nip05.nostrJsonDocument() ($name)",
  ({ zostr, z }) => {
    const pubkey = () => getPublicKey(generateSecretKey());

    it("validates a full document", () => {
      const pk = pubkey();
      const doc = {
        names: { bob: pk },
        relays: {
          [pk]: ["wss://relay.example.com", "wss://relay2.example.com"],
        },
      };
      expect(z.parse(zostr.nip05.nostrJsonDocument(), doc)).toEqual(doc);
    });

    it("requires names but treats relays as optional", () => {
      const pk = pubkey();
      expect(
        z.parse(zostr.nip05.nostrJsonDocument(), { names: { bob: pk } }),
      ).toEqual({ names: { bob: pk } });
      expect(z.safeParse(zostr.nip05.nostrJsonDocument(), {}).success).toBe(
        false,
      );
    });

    it("validates names/relays pubkeys as 64-char lowercase hex", () => {
      const pk = pubkey();
      expect(
        z.safeParse(zostr.nip05.nostrJsonDocument(), {
          names: { bob: "not-hex" },
        }).success,
      ).toBe(false);
      expect(
        z.safeParse(zostr.nip05.nostrJsonDocument(), {
          names: { bob: pk.toUpperCase() },
        }).success,
      ).toBe(false);
      expect(
        z.safeParse(zostr.nip05.nostrJsonDocument(), {
          names: { bob: pk },
          relays: { "not-hex": ["wss://relay.example.com"] },
        }).success,
      ).toBe(false);
    });

    it("validates names keys as local-part characters (lowercase-only)", () => {
      const pk = pubkey();
      expect(
        z.safeParse(zostr.nip05.nostrJsonDocument(), {
          names: { "bob!": pk },
        }).success,
      ).toBe(false);
      // Local-part is lowercase-only per NIP-05; uppercase names keys are rejected.
      expect(
        z.safeParse(zostr.nip05.nostrJsonDocument(), {
          names: { Bob: pk },
        }).success,
      ).toBe(false);
    });

    it("preserves unknown top-level keys (forward-compatible document)", () => {
      const pk = pubkey();
      expect(
        z.parse(zostr.nip05.nostrJsonDocument(), {
          names: { bob: pk },
          extra: "y",
        }),
      ).toEqual({ names: { bob: pk }, extra: "y" });
    });
  },
);

describe("zostr.nip05 output types", () => {
  it("nostrJsonDocument() infers a precise names record (both flavors)", () => {
    const pk = "a".repeat(64);
    const classicDoc = classicZostr.nip05
      .nostrJsonDocument()
      .parse({ names: { bob: pk } });
    expectTypeOf(classicDoc.names).toEqualTypeOf<Record<string, string>>();

    const miniDoc = zm.parse(miniZostr.nip05.nostrJsonDocument(), {
      names: { bob: pk },
    });
    expectTypeOf(miniDoc.names).toEqualTypeOf<Record<string, string>>();
  });
});
