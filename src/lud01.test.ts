import { bech32 } from "@scure/base";
import { describe, expect, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

// LUD-01 LNURL: a bech32 string with the `lnurl` HRP. Reached publicly via the
// kind:0 profile field catalog (`metadataFields.lud06()`); this file is its
// canonical test home.
const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

// A real (long) LNURL from the LUD-01 spec example — well over @scure/base's
// default 90-char decode limit, so a naive `bech32.decode(v)` would reject it.
const LONG_LNURL =
  "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS".toLowerCase();
// Valid bech32 checksum but the wrong HRP (`note`, not `lnurl`).
const WRONG_HRP = bech32.encode("note", bech32.toWords(new Uint8Array(10)));
// A valid LNURL with its last character flipped, breaking the checksum.
const BAD_CHECKSUM = `${LONG_LNURL.slice(0, -1)}${
  LONG_LNURL.endsWith("a") ? "z" : "a"
}`;

const INVALID: [string, string][] = [
  ["excess padding", "lnurl1leltelt"],
  ["mixed case", "LNURL1leltelt"],
  ["wrong hrp (valid checksum)", WRONG_HRP],
  ["bad checksum", BAD_CHECKSUM],
  ["garbage", "not-bech32"],
];

describe.each(FLAVORS)("zostr LUD-01 LNURL ($name)", ({ zostr, z }) => {
  it("accepts a real (long) LNURL beyond the default 90-char decode limit", () => {
    expect(z.parse(zostr.nip01.metadataFields.lud06(), LONG_LNURL)).toBe(
      LONG_LNURL,
    );
  });

  it.each(INVALID)("rejects %s", (_label, value) => {
    expect(z.safeParse(zostr.nip01.metadataFields.lud06(), value).success).toBe(
      false,
    );
  });
});
