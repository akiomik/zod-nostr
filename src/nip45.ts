import type * as core from "zod/v4/core";
import { nonNegativeIntegerCheck } from "./core/checks.js";
import { hexStringSchema } from "./core/hex.js";
import {
  zodBoolean,
  zodLiteral,
  zodNumber,
  zodObject,
  zodOptional,
  zodTuple,
} from "./core/primitives.js";
import { filter, subscriptionId } from "./nip01.js";

/**
 * NIP-45 encodes a HyperLogLog value as the concatenation of 256 registers,
 * each a `uint8` byte — so `hll` is a 512-char hex string. Lowercase hex,
 * matching how NIP-01 ids/pubkeys/signatures are validated elsewhere.
 */
function hll(): core.$ZodString<string> {
  return hexStringSchema(512);
}

/**
 * Object schema for a NIP-45 COUNT response body: `{ count, approximate?, hll? }`.
 *
 * `count` is a non-negative integer — relays may return a probabilistic
 * estimate, but it is still an event count, so fractional, negative, and
 * non-finite values are rejected. `approximate` flags a probabilistic count and
 * `hll` carries the HyperLogLog registers; both are optional (a relay MAY omit
 * them) and no recovery policy is baked in. Unknown keys are stripped (the
 * default), matching how `event()` and the NIP-05/NIP-11 documents treat them.
 */
function count() {
  return zodObject({
    count: zodNumber([nonNegativeIntegerCheck("count")]),
    approximate: zodOptional(zodBoolean()),
    hll: zodOptional(hll()),
  });
}

/**
 * Client-to-relay COUNT request: `["COUNT", subscriptionId, ...filter[]]`. The
 * filters are the same NIP-01 `REQ`/`COUNT` filter objects (OR'd together), so
 * this reuses `filter()` as the tuple rest exactly like NIP-01's `REQ` message.
 */
function countRequestMessage() {
  return zodTuple([zodLiteral("COUNT"), subscriptionId()], filter());
}

/**
 * Relay-to-client COUNT response: `["COUNT", subscriptionId, count()]`
 * (structure only). A relay refusing the request replies with NIP-01's
 * `CLOSED` message instead (`zostr.relayMessage.closed()`).
 */
function countResponseMessage() {
  return zodTuple([zodLiteral("COUNT"), subscriptionId(), count()]);
}

/** NIP-45 event count (COUNT) request/response messages and the response body object */
export const nip45 = {
  /** Object schema for a COUNT response body (`{ count, approximate?, hll? }`) */
  count,
  /** Client-to-relay `["COUNT", subscriptionId, ...filter[]]` */
  countRequest: countRequestMessage,
  /** Relay-to-client `["COUNT", subscriptionId, count()]` */
  countResponse: countResponseMessage,
};
