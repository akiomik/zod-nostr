import {
  zodArray,
  zodLiteral,
  zodString,
  zodTuple,
  zodUnion,
} from "./core/primitives.js";
import { subscriptionId } from "./nip01.js";

/**
 * NIP-67-aware relay-to-client `EOSE`. NIP-67 extends NIP-01's two-element
 * `["EOSE", subscriptionId]` with an optional third element: an array of hint
 * strings.
 *
 * Modeled as a union of the exact two- and three-element wire shapes rather than
 * a tuple with an optional third item, so only the shapes that appear on the
 * JSON wire are accepted: an explicit `undefined` third element
 * (`["EOSE", sub, undefined]`) is rejected, and the output type is the precise
 * `["EOSE", string] | ["EOSE", string, string[]]`.
 *
 * The hints array holds arbitrary strings, not a fixed enum. NIP-67 defines
 * `"finish"` (the relay has sent every stored event matching the filters — the
 * client should not paginate), `"more"` (the relay holds more matching stored
 * events — the client should paginate), and `"auth"` (the relay may hold more
 * for a client that completes NIP-42 authentication), but requires clients to
 * accept unknown hint values without error, so no enum is baked in (this would
 * reject spec-valid future hints). The array MAY be empty and MAY carry
 * multiple hints.
 *
 * Only the *presence* of `"finish"`/`"more"` is definitive; a missing third
 * element, an empty array, or unknown-only hints leave completeness unknown, in
 * which case NIP-67 says the client SHOULD paginate with `until` set to the
 * oldest received event's `created_at`. Interpreting the hints is the
 * consumer's responsibility — this schema validates structure only.
 *
 * This is a strict superset of `zostr.nip01.relayMessage.eose()`: it also
 * accepts the bare two-element form a NIP-67 relay still sends.
 * `zostr.nip01.relayMessage.any()` stays NIP-01-only (like the NIP-42/NIP-45
 * messages, it isn't folded in); a consumer wanting NIP-67 EOSE alongside the
 * other relay messages composes
 * `z.union([zostr.nip01.relayMessage.any(), zostr.nip67.relayMessage.eose()])`.
 */
function eoseMessage() {
  return zodUnion([
    zodTuple([zodLiteral("EOSE"), subscriptionId()]),
    zodTuple([zodLiteral("EOSE"), subscriptionId(), zodArray(zodString())]),
  ]);
}

/** NIP-67 EOSE completeness-hint message */
export const nip67 = {
  /** Relay-to-client `EOSE` message with an optional completeness-hint array */
  relayMessage: {
    /** Relay-to-client `["EOSE", subscriptionId]` or `["EOSE", subscriptionId, hints]` */
    eose: eoseMessage,
  },
};
