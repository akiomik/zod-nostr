import { nip19 } from "nostr-tools";
import type * as core from "zod/v4/core";
import { makeCheck, nonNegativeIntegerCheck } from "./core/checks.js";
import { makeCodec } from "./core/codecs.js";
import { hexStringSchema } from "./core/hex.js";
import {
  zodArray,
  zodNumber,
  zodObject,
  zodOptional,
  zodString,
  zodUnknown,
} from "./core/primitives.js";

/**
 * NIP-19 encodes the pointer `kind` of `nevent`/`naddr` as a 32-bit unsigned
 * integer (big-endian). It does not narrow this to NIP-01's `0..65535` event-
 * kind range, so this schema mirrors the encoding and accepts any `uint32`;
 * layering NIP-01 event-kind validation on top is left to the consumer.
 */
const UINT32_MAX = 0xff_ff_ff_ff;
function pointerKind(): core.$ZodNumber<number> {
  return zodNumber([nonNegativeIntegerCheck("kind", UINT32_MAX)]);
}

export type Bech32Prefix =
  | "npub"
  | "nsec"
  | "note"
  | "nprofile"
  | "nevent"
  | "naddr";

export interface ProfilePointer {
  [key: string]: unknown;
  pubkey: string;
  relays?: string[];
}

export interface EventPointer {
  [key: string]: unknown;
  id: string;
  relays?: string[];
  author?: string;
  kind?: number;
}

export interface AddressPointer {
  [key: string]: unknown;
  identifier: string;
  pubkey: string;
  kind: number;
  relays?: string[];
}

/** Lightweight schema that only validates the prefix (for cases that don't need the decoded value) */
export function bech32Schema<P extends Bech32Prefix>(
  prefix: P,
): core.$ZodString<string> {
  return zodString([
    makeCheck<string>((payload) => {
      try {
        if (nip19.decode(payload.value).type !== prefix) {
          throw new Error("prefix mismatch");
        }
      } catch {
        payload.issues.push({
          code: "invalid_format",
          format: "regex",
          input: payload.value,
          message: `Invalid ${prefix}`,
        });
      }
    }),
  ]);
}

function secretKeySchema(): core.$ZodType<Uint8Array, Uint8Array> {
  return zodUnknown<Uint8Array>([
    makeCheck<Uint8Array>((payload) => {
      if (
        !(payload.value instanceof Uint8Array) ||
        payload.value.length !== 32
      ) {
        payload.issues.push({
          code: "custom",
          input: payload.value,
          message: "Invalid secret key (expected 32-byte Uint8Array)",
        });
      }
    }),
  ]);
}

// The pointer schemas preserve unknown keys (catchall `unknown`) rather than
// stripping them: the `ProfilePointer`/`EventPointer`/`AddressPointer`
// interfaces carry an `[key: string]: unknown` index signature, so a value of
// the declared type may hold extra keys — rejecting or silently dropping them
// would contradict that type. The extra keys are inert (NIP-19's TLV encoding
// only emits the known fields).
function profilePointerSchema() {
  return zodObject(
    {
      pubkey: hexStringSchema(64),
      relays: zodOptional(zodArray(zodString())),
    },
    { catchall: zodUnknown() },
  );
}

function eventPointerSchema() {
  return zodObject(
    {
      id: hexStringSchema(64),
      relays: zodOptional(zodArray(zodString())),
      author: zodOptional(hexStringSchema(64)),
      kind: zodOptional(pointerKind()),
    },
    { catchall: zodUnknown() },
  );
}

function addressPointerSchema() {
  return zodObject(
    {
      identifier: zodString(),
      pubkey: hexStringSchema(64),
      kind: pointerKind(),
      relays: zodOptional(zodArray(zodString())),
    },
    { catchall: zodUnknown() },
  );
}

export const npubCodec = makeCodec(bech32Schema("npub"), hexStringSchema(64), {
  decode: (npub) => nip19.decode(npub).data as string,
  encode: (pubkey) => nip19.npubEncode(pubkey),
});

export const nsecCodec = makeCodec(bech32Schema("nsec"), secretKeySchema(), {
  decode: (nsec) => nip19.decode(nsec).data as Uint8Array,
  encode: (sk) => nip19.nsecEncode(sk),
});

export const noteCodec = makeCodec(bech32Schema("note"), hexStringSchema(64), {
  decode: (note) => nip19.decode(note).data as string,
  encode: (id) => nip19.noteEncode(id),
});

export const nprofileCodec = makeCodec(
  bech32Schema("nprofile"),
  profilePointerSchema(),
  {
    decode: (nprofile) => nip19.decode(nprofile).data as ProfilePointer,
    encode: (profile) => nip19.nprofileEncode(profile),
  },
);

export const neventCodec = makeCodec(
  bech32Schema("nevent"),
  eventPointerSchema(),
  {
    decode: (nevent) => nip19.decode(nevent).data as EventPointer,
    encode: (event) => nip19.neventEncode(event),
  },
);

export const naddrCodec = makeCodec(
  bech32Schema("naddr"),
  addressPointerSchema(),
  {
    decode: (naddr) => nip19.decode(naddr).data as AddressPointer,
    encode: (addr) => nip19.naddrEncode(addr),
  },
);
