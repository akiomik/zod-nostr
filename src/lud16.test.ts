import { describe, expect, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

// LUD-16 lightning address (`<username>[+<tag>]@<domain>`). Reached publicly via
// the kind:0 profile field catalog (`metadataFields.lud16()`); this file is its
// canonical test home. The shared host/domain rules are exercised exhaustively
// in internet-identifier.test.ts — here only a single wiring case confirms the
// domain check is composed.
const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

const VALID = ["alice@example.com", "alice+tag@example.com", "a@b.onion"];
const INVALID: [string, string][] = [
  ["an empty username", "+@example.com"],
  ["an empty +tag", "alice+@example.com"],
  ["two +tags", "alice++tag@example.com"],
  // domain check wired in (full host matrix lives in internet-identifier.test.ts)
  ["a domain carrying a path", "alice@example.com/path"],
  ["an uppercase local part", "Alice@example.com"],
  ["no '@' separator", "no-at-sign"],
];

describe.each(FLAVORS)(
  "zostr LUD-16 lightning address ($name)",
  ({ zostr, z }) => {
    it.each(VALID)("accepts %s", (value) => {
      expect(z.parse(zostr.nip01.metadataFields.lud16(), value)).toBe(value);
    });

    it.each(INVALID)("rejects %s", (_label, value) => {
      expect(
        z.safeParse(zostr.nip01.metadataFields.lud16(), value).success,
      ).toBe(false);
    });
  },
);
