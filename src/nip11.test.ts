import { describe, expect, expectTypeOf, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

// Inputs the relay information document must reject, each isolating one rule.
const REJECTED: [string, Record<string, unknown>][] = [
  ["pubkey not 64-char hex", { pubkey: "not-hex" }],
  ["self not 64-char hex", { self: "not-hex" }],
  ["banner not a URL", { banner: "not-a-url" }],
  ["icon not a URL", { icon: "not-a-url" }],
  ["terms_of_service not a URL", { terms_of_service: "not-a-url" }],
  ["payments_url not a URL", { payments_url: "not-a-url" }],
  // NIP-11 defines `software` as a URL; a bare name is rejected.
  ["software a bare name", { software: "my-relay" }],
  // count/length fields: non-negative integers (0 allowed)
  ["limitation.max_limit negative", { limitation: { max_limit: -1 } }],
  [
    "limitation.default_limit fractional",
    { limitation: { default_limit: 1.5 } },
  ],
  [
    "limitation.max_message_length NaN",
    { limitation: { max_message_length: Number.NaN } },
  ],
  // created_at_*_limit are relative durations in seconds: non-negative integers
  [
    "limitation.created_at_lower_limit negative",
    { limitation: { created_at_lower_limit: -1 } },
  ],
  [
    "limitation.created_at_upper_limit fractional",
    { limitation: { created_at_upper_limit: 1.5 } },
  ],
  // fees.amount is a non-negative finite number
  [
    "fees.amount negative",
    { fees: { admission: [{ amount: -1, unit: "msats" }] } },
  ],
  [
    "fees.amount NaN",
    { fees: { admission: [{ amount: Number.NaN, unit: "msats" }] } },
  ],
  [
    "fees.amount Infinity",
    {
      fees: {
        admission: [{ amount: Number.POSITIVE_INFINITY, unit: "msats" }],
      },
    },
  ],
  // period is a non-negative integer
  [
    "fees.period fractional",
    { fees: { admission: [{ amount: 1, unit: "msats", period: 1.5 }] } },
  ],
  // kinds are NIP-01 event kinds (0..65535)
  [
    "fees.kinds out of range",
    { fees: { publication: [{ amount: 1, unit: "msats", kinds: [65536] }] } },
  ],
  // supported_nips are non-negative integers
  ["supported_nips negative", { supported_nips: [1, -2] }],
];

// Inputs the document must accept and preserve verbatim.
const ACCEPTED: [string, Record<string, unknown>][] = [
  ["software as a URL", { software: "https://example.com/relay" }],
  // software/contact are left as plain strings, same as rust-nostr
  [
    "software with a git+ scheme",
    { software: "git+https://example.com/repo.git" },
  ],
  ["contact as a plain string", { contact: "admin@example.com" }],
  ["min_pow_difficulty 0", { limitation: { min_pow_difficulty: 0 } }],
  // NIP-13's derived 0..256 range is intentionally not baked in
  ["min_pow_difficulty 257", { limitation: { min_pow_difficulty: 257 } }],
  [
    "created_at_lower_limit as a large duration",
    { limitation: { created_at_lower_limit: 94608000 } },
  ],
  // unit is free-form, so fractional amounts are allowed
  [
    "fractional fee amount",
    { fees: { admission: [{ amount: 0.5, unit: "BTC" }] } },
  ],
];

describe.each(FLAVORS)(
  "zostr.nip11.relayInformationDocument() ($name)",
  ({ zostr, z }) => {
    it("validates a full document", () => {
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
      expect(z.parse(zostr.nip11.relayInformationDocument(), doc)).toEqual(doc);
    });

    it("treats every field as optional and preserves unknown keys", () => {
      expect(z.parse(zostr.nip11.relayInformationDocument(), {})).toEqual({});
      // NIP-11 is forward-compatible ("clients MUST ignore any additional fields
      // they do not understand"): unknown keys are preserved, not stripped.
      expect(
        z.parse(zostr.nip11.relayInformationDocument(), {
          name: "x",
          extra: "y",
        }),
      ).toEqual({ name: "x", extra: "y" });
    });

    it.each(REJECTED)("rejects %s", (_label, input) => {
      expect(
        z.safeParse(zostr.nip11.relayInformationDocument(), input).success,
      ).toBe(false);
    });

    it.each(ACCEPTED)("accepts and preserves %s", (_label, input) => {
      expect(z.parse(zostr.nip11.relayInformationDocument(), input)).toEqual(
        input,
      );
    });
  },
);

describe("zostr.nip11 output types", () => {
  it("relayInformationDocument() infers optional known fields (both flavors)", () => {
    const classicDoc = classicZostr.nip11
      .relayInformationDocument()
      .parse({ name: "x" });
    expectTypeOf(classicDoc.name).toEqualTypeOf<string | undefined>();

    const miniDoc = zm.parse(miniZostr.nip11.relayInformationDocument(), {
      name: "x",
    });
    expectTypeOf(miniDoc.name).toEqualTypeOf<string | undefined>();
  });
});
