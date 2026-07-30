import { describe, expect, expectTypeOf, it } from "vitest";
import * as zc from "zod";
import * as zm from "zod/mini";
import { zostr as classicZostr } from "./classic.js";
import { zostr as miniZostr } from "./mini.js";

const FLAVORS = [
  { name: "classic", zostr: classicZostr, z: zc },
  { name: "mini", zostr: miniZostr, z: zm },
] as const;

describe.each(FLAVORS)("zostr.nip50.filter() ($name)", ({ zostr, z }) => {
  it("accepts the NIP-01 filter extended with `search`", () => {
    // A plain NIP-01 filter (no search) is still accepted — a superset of it.
    expect(z.parse(zostr.nip50.filter(), { kinds: [1] })).toEqual({
      kinds: [1],
    });
    // The `search` string, alone and combined with other fields / tag filters.
    expect(
      z.parse(zostr.nip50.filter(), { search: "best nostr apps" }),
    ).toEqual({ search: "best nostr apps" });
    expect(
      z.parse(zostr.nip50.filter(), {
        kinds: [1],
        search: "purple",
        "#e": ["a"],
      }),
    ).toBeTruthy();
    // Empty string is spec-valid (NIP-50 places no format constraint on it).
    expect(z.parse(zostr.nip50.filter(), { search: "" })).toEqual({
      search: "",
    });
  });

  it("rejects a non-string `search` and still rejects unknown keys", () => {
    expect(z.safeParse(zostr.nip50.filter(), { search: 5 }).success).toBe(
      false,
    );
    // `search` is a plain string, not the `string[]` a tag filter carries.
    expect(z.safeParse(zostr.nip50.filter(), { search: ["x"] }).success).toBe(
      false,
    );
    // The inherited tag-key check still rejects truly-unknown keys.
    expect(z.safeParse(zostr.nip50.filter(), { foo: ["x"] }).success).toBe(
      false,
    );
    // The base NIP-01 filter() keeps rejecting `search` (unchanged).
    expect(z.safeParse(zostr.filter(), { search: "x" }).success).toBe(false);
  });

  it("req() carries search filters and requires at least one filter", () => {
    expect(
      z.parse(zostr.nip50.clientMessage.req(), [
        "REQ",
        "sub1",
        { search: "orange" },
      ]),
    ).toBeTruthy();
    // Several filters, mixing a search filter and a plain NIP-01 filter.
    expect(
      z.parse(zostr.nip50.clientMessage.req(), [
        "REQ",
        "sub1",
        { search: "orange" },
        { kinds: [1, 2] },
      ]),
    ).toBeTruthy();
    // `search` may appear on a variadic rest filter, not only the first — NIP-50
    // allows several search filters. Guards the rest against reverting to the
    // plain NIP-01 filter().
    expect(
      z.parse(zostr.nip50.clientMessage.req(), [
        "REQ",
        "sub1",
        { kinds: [1] },
        { search: "purple" },
      ]),
    ).toBeTruthy();
    // A plain filter with no search is accepted (superset of clientMessage.req()).
    expect(
      z.parse(zostr.nip50.clientMessage.req(), ["REQ", "sub1", { kinds: [1] }]),
    ).toBeTruthy();
    // At least one filter is required (NIP-01 REQ grammar).
    expect(
      z.safeParse(zostr.nip50.clientMessage.req(), ["REQ", "sub1"]).success,
    ).toBe(false);
  });

  it("NIP-01 REQ/COUNT stay search-free; a composed union accepts NIP-50 REQ", () => {
    // nip01.clientMessage.req()/any() and nip45.clientMessage.count() reject `search`.
    expect(
      z.safeParse(zostr.nip01.clientMessage.req(), [
        "REQ",
        "sub1",
        { search: "x" },
      ]).success,
    ).toBe(false);
    expect(
      z.safeParse(zostr.nip01.clientMessage.any(), [
        "REQ",
        "sub1",
        { search: "x" },
      ]).success,
    ).toBe(false);
    expect(
      z.safeParse(zostr.nip45.clientMessage.count(), [
        "COUNT",
        "sub1",
        { search: "x" },
      ]).success,
    ).toBe(false);
    // The documented composition accepts both NIP-01 client messages and NIP-50 REQ.
    const clientMessage = z.union([
      zostr.nip01.clientMessage.any(),
      zostr.nip50.clientMessage.req(),
    ]);
    expect(
      z.parse(clientMessage, ["REQ", "sub1", { search: "x" }]),
    ).toBeTruthy();
    expect(z.parse(clientMessage, ["CLOSE", "sub1"])).toBeTruthy();
  });
});

describe("zostr.nip50 output types", () => {
  it("infers a string search field and a non-optional first filter (classic)", () => {
    const f = classicZostr.nip50.filter().parse({ search: "x" });
    expectTypeOf(f.search).toEqualTypeOf<string | undefined>();

    const req = classicZostr.nip50.clientMessage
      .req()
      .parse(["REQ", "sub1", { search: "x" }]);
    // req[2] is the required first filter (non-optional); its `search` is string.
    expectTypeOf(req[2].search).toEqualTypeOf<string | undefined>();
  });

  it("infers a string search field and a non-optional first filter (mini)", () => {
    const f = zm.parse(miniZostr.nip50.filter(), { search: "x" });
    expectTypeOf(f.search).toEqualTypeOf<string | undefined>();

    const req = zm.parse(miniZostr.nip50.clientMessage.req(), [
      "REQ",
      "sub1",
      { search: "x" },
    ]);
    expectTypeOf(req[2].search).toEqualTypeOf<string | undefined>();
  });
});
