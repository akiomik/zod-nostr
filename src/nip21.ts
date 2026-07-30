import { nip19 } from "nostr-tools";
import * as core from "zod/v4/core";
import { makeCheck } from "./core/checks.js";
import { makeCodec } from "./core/codecs.js";
import {
  zodLiteral,
  zodNever,
  zodObject,
  zodString,
  zodUnion,
} from "./core/primitives.js";
import {
  type AddressPointer,
  type EventPointer,
  naddrCodec,
  neventCodec,
  noteCodec,
  nprofileCodec,
  npubCodec,
  type ProfilePointer,
} from "./nip19.js";

/**
 * NIP-21 wraps a NIP-19 bech32 entity in a `nostr:` URI. This module is the
 * URI-scheme layer: the scheme envelope (the `nostr:` prefix, its case handling,
 * and what may surround the entity) is defined here, while the entity itself is
 * delegated to the existing NIP-19 codecs in `./nip19.js` — bech32 validation,
 * decoding (including TLV decoding for the pointer entities), and encoding are
 * reused verbatim.
 *
 * The library supports a subset of NIP-19 entities in URIs:
 *
 *   S = { npub, note, nprofile, nevent, naddr }
 *
 * `nsec` is a NIP-19 entity but NIP-21 excludes it from URIs, so it is not in S.
 * `nrelay` (deprecated) and the NIP-49 `ncryptsec` are not modeled by this
 * library at all. Everything outside S is rejected uniformly, by not being a
 * supported entity — there is no special-case rule.
 */

/** The supported NIP-21 URI entity prefixes (the NIP-19 set minus `nsec`). */
export type Nip21Prefix = "npub" | "note" | "nprofile" | "nevent" | "naddr";

const SCHEME = "nostr:";

const SUPPORTED_PREFIXES: readonly Nip21Prefix[] = [
  "npub",
  "note",
  "nprofile",
  "nevent",
  "naddr",
];

// Secret-bearing HRPs. Rejected by prefix before any bech32 decoding or payload
// materialization, so secret-key bytes are never decoded merely to reject them.
// `ncryptsec` is a NIP-49 encrypted secret key, not a NIP-19 entity.
const SECRET_HRPS = ["nsec", "ncryptsec"] as const;

/**
 * Strips the case-insensitive `nostr:` scheme (RFC 3986 §3.1: schemes are
 * case-insensitive), returning the bech32 body verbatim, or `null` if the value
 * does not carry a non-empty `nostr:` scheme. The body's case is left untouched;
 * the entity is validated by NIP-19 (lowercase bech32).
 */
function stripScheme(value: string): string | null {
  if (value.length <= SCHEME.length) {
    return null;
  }
  if (value.slice(0, SCHEME.length).toLowerCase() !== SCHEME) {
    return null;
  }
  return value.slice(SCHEME.length);
}

function isSecretHrp(bare: string): boolean {
  return SECRET_HRPS.some((hrp) => bare.startsWith(`${hrp}1`));
}

function invalidUri(payload: core.ParsePayload<string>, message: string): void {
  payload.issues.push({
    code: "invalid_format",
    format: "regex",
    input: payload.value,
    message,
  });
}

/**
 * Validation-only string schema for a supported NIP-21 URI. Returns the string
 * unchanged. With no `prefix` it accepts any supported entity (S); a `prefix`
 * narrows it to that one entity. Backs `uri()` and every codec's input side.
 *
 * Anything outside S — `nsec`/`ncryptsec` (secret keys), `nrelay` (unmodeled),
 * bare bech32, and malformed input (whitespace, query, fragment, suffix, a
 * doubled scheme) — is rejected: those either fail the scheme check, the secret
 * pre-reject, or the bech32 decode/type-membership below.
 */
export function uriSchema(prefix?: Nip21Prefix): core.$ZodString<string> {
  const allowed: readonly Nip21Prefix[] = prefix
    ? [prefix]
    : SUPPORTED_PREFIXES;
  return zodString([
    makeCheck<string>((payload) => {
      const bare = stripScheme(payload.value);
      if (bare === null) {
        invalidUri(payload, "Invalid NIP-21 URI (expected a nostr: URI)");
        return;
      }
      if (isSecretHrp(bare)) {
        invalidUri(
          payload,
          "Invalid NIP-21 URI (nsec/ncryptsec secret keys are not URI entities)",
        );
        return;
      }
      let type: string;
      try {
        type = nip19.decode(bare).type;
      } catch {
        invalidUri(payload, "Invalid NIP-21 URI");
        return;
      }
      // Membership is checked for both the no-prefix set and a specific
      // `prefix`; the message is generic (its text is not a public contract).
      // Against the current nostr-tools entity set this only ever rejects a
      // supported entity that isn't the requested `prefix`, but the check also
      // guards forward — a future decodable type outside S is rejected too.
      if (!allowed.includes(type as Nip21Prefix)) {
        invalidUri(payload, "Invalid NIP-21 URI (unexpected entity)");
      }
    }),
  ]);
}

/**
 * Builds a per-entity URI codec by wrapping an existing NIP-19 core codec: the
 * scheme is stripped/prepended here, the entity is decoded/encoded by the NIP-19
 * codec, and its output schema is reused as-is (no pointer-schema duplication).
 * Decode accepts a case-insensitive scheme; encode always emits lowercase
 * `nostr:`.
 */
function uriCodec<A extends core.SomeType, B extends core.SomeType>(
  entityCodec: core.$ZodCodec<A, B>,
  prefix: Nip21Prefix,
): core.$ZodCodec<core.$ZodString<string>, B> {
  const out = entityCodec._zod.def.out;
  return makeCodec(uriSchema(prefix), out, {
    // `in` (uriSchema) has already validated a supported `nostr:<prefix>` URI,
    // so stripScheme never returns null here.
    decode: (uri) =>
      core.decode(
        entityCodec,
        stripScheme(uri) as core.input<A>,
      ) as core.input<B>,
    encode: (value) =>
      `${SCHEME}${core.encode(entityCodec, value as core.output<B>)}`,
  });
}

export const npubUriCodec = uriCodec(npubCodec, "npub");
export const noteUriCodec = uriCodec(noteCodec, "note");
export const nprofileUriCodec = uriCodec(nprofileCodec, "nprofile");
export const neventUriCodec = uriCodec(neventCodec, "nevent");
export const naddrUriCodec = uriCodec(naddrCodec, "naddr");

/**
 * The decoded form of any supported NIP-21 URI: a discriminated union keyed by
 * `type`. Same `{ type, data }` representation as nostr-tools' `nip19.decode`
 * for the five supported branches (its union additionally carries `nsec`). The
 * `type` discriminant is what makes `encode` unambiguous — `npub` and `note`
 * share a `string` payload, so the tag is what selects the prefix.
 */
export type Nip21Decoded =
  | { type: "npub"; data: string }
  | { type: "note"; data: string }
  | { type: "nprofile"; data: ProfilePointer }
  | { type: "nevent"; data: EventPointer }
  | { type: "naddr"; data: AddressPointer };

// A `{ type: <literal>, data }` branch object. Rejects unknown keys (catchall
// `never`), matching the reused NIP-19 pointer schemas and the preserve-or-reject
// contract — an unknown key on either the branch or the pointer `data` fails.
function branch<P extends Nip21Prefix, D>(
  type: P,
  dataSchema: core.$ZodType<D, D>,
) {
  return zodObject(
    { type: zodLiteral(type), data: dataSchema },
    { catchall: zodNever() },
  );
}

// Core plain union of the five branches (not a per-flavor discriminatedUnion:
// that would split the single core source across the classic/mini re-wraps). A
// literal `type` on each branch still narrows the union in TypeScript. The
// reused NIP-19 `out` schemas are typed as `SomeType` on the codec def, so each
// is asserted to its concrete pointer/hex output type here. `anyOut`'s static
// type is pinned to `Nip21Decoded` (its runtime value is the real union, used
// verbatim by the classic/mini re-wraps).
const anyOut = zodUnion([
  branch("npub", npubCodec._zod.def.out as core.$ZodType<string, string>),
  branch("note", noteCodec._zod.def.out as core.$ZodType<string, string>),
  branch(
    "nprofile",
    nprofileCodec._zod.def.out as core.$ZodType<ProfilePointer, ProfilePointer>,
  ),
  branch(
    "nevent",
    neventCodec._zod.def.out as core.$ZodType<EventPointer, EventPointer>,
  ),
  branch(
    "naddr",
    naddrCodec._zod.def.out as core.$ZodType<AddressPointer, AddressPointer>,
  ),
]) as unknown as core.$ZodType<Nip21Decoded, Nip21Decoded>;

/**
 * Codec for any supported NIP-21 URI: `nostr:<S>` ⇄ the `Nip21Decoded`
 * discriminated union. `encode` switches on the `type` tag, so it is never
 * ambiguous.
 */
export const anyUriCodec = makeCodec(uriSchema(), anyOut, {
  decode: (uri): Nip21Decoded => {
    // `in` (uriSchema) guarantees a supported, non-secret entity, so the decode
    // succeeds and `type` is one of S.
    const decoded = nip19.decode(stripScheme(uri) as string);
    return { type: decoded.type, data: decoded.data } as Nip21Decoded;
  },
  encode: (value: Nip21Decoded): string => {
    switch (value.type) {
      case "npub":
        return `${SCHEME}${core.encode(npubCodec, value.data)}`;
      case "note":
        return `${SCHEME}${core.encode(noteCodec, value.data)}`;
      case "nprofile":
        return `${SCHEME}${core.encode(nprofileCodec, value.data)}`;
      case "nevent":
        return `${SCHEME}${core.encode(neventCodec, value.data)}`;
      case "naddr":
        return `${SCHEME}${core.encode(naddrCodec, value.data)}`;
    }
  },
});
