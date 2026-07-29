import type * as core from "zod/v4/core";
import { nonNegativeIntegerCheck } from "./core/checks.js";
import { hexStringSchema } from "./core/hex.js";
import {
  zodBoolean,
  zodLiteral,
  zodNever,
  zodNumber,
  zodObject,
  zodOptional,
  zodTuple,
} from "./core/primitives.js";
import { filter, subscriptionId } from "./nip01.js";

/**
 * NIP-45 encodes a HyperLogLog value as the concatenation of 256 registers,
 * each a `uint8` byte — so `hll` is a 512-char hex string. NIP-45 only says
 * "hex" (unlike NIP-01, which mandates lowercase for ids/pubkeys/signatures),
 * so either case is accepted here rather than rejecting spec-valid uppercase.
 */
function hll(): core.$ZodString<string> {
  return hexStringSchema(512, { caseInsensitive: true });
}

/**
 * Object schema for a NIP-45 COUNT response body: `{ count, approximate?, hll? }`.
 *
 * `count` is a non-negative integer — relays may return a probabilistic
 * estimate, but it is still an event count, so fractional, negative, and
 * non-finite values are rejected. `approximate` flags a probabilistic count and
 * `hll` carries the HyperLogLog registers; both are optional (a relay MAY omit
 * them) and no recovery policy is baked in. The COUNT response body is a fixed
 * shape, so unknown keys are rejected (`catchall: never`) rather than silently
 * stripped, the same as `event()`.
 */
function count() {
  return zodObject(
    {
      count: zodNumber([nonNegativeIntegerCheck("count")]),
      approximate: zodOptional(zodBoolean()),
      hll: zodOptional(hll()),
    },
    { catchall: zodNever() },
  );
}

/**
 * Client-to-relay COUNT request: `["COUNT", queryId, filter, ...filter[]]`. The
 * filters are the same NIP-01 `REQ`/`COUNT` filter objects (OR'd together). At
 * least one is required, matching NIP-01's `REQ` grammar (`<filters1>` then
 * `<filters2>...`): count-everything sends a single empty `{}` filter, so there
 * is no need to allow zero. `queryId` reuses `subscriptionId()`'s format (a
 * non-empty string of at most 64 chars); NIP-45 calls it `query_id` on the wire
 * but its HLL section also calls it `subscription_id`.
 */
function countRequestMessage() {
  return zodTuple([zodLiteral("COUNT"), subscriptionId(), filter()], filter());
}

/**
 * Relay-to-client COUNT response: `["COUNT", queryId, count()]`
 * (structure only). A relay refusing the request replies with NIP-01's
 * `CLOSED` message instead (`zostr.nip01.relayMessage.closed()`).
 */
function countResponseMessage() {
  return zodTuple([zodLiteral("COUNT"), subscriptionId(), count()]);
}

/** NIP-45 event count (COUNT) request/response messages and the response body object */
export const nip45 = {
  /** Object schema for a COUNT response body (`{ count, approximate?, hll? }`) */
  count,
  /** Client-to-relay `COUNT` message */
  clientMessage: {
    /** Client-to-relay `["COUNT", queryId, filter, ...filter[]]` */
    count: countRequestMessage,
  },
  /** Relay-to-client `COUNT` message */
  relayMessage: {
    /** Relay-to-client `["COUNT", queryId, count()]` */
    count: countResponseMessage,
  },
};
