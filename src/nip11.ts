import type * as core from "zod/v4/core";
import {
  nonNegativeIntegerCheck,
  nonNegativeNumberCheck,
} from "./core/checks.js";
import { hexStringSchema } from "./core/hex.js";
import {
  zodArray,
  zodBoolean,
  zodNumber,
  zodObject,
  zodOptional,
  zodString,
  zodUrl,
} from "./core/primitives.js";
import { kind } from "./nip01.js";

/** Non-negative integer atom for NIP-11 count/length/duration fields */
function nonNegativeInteger(label: string): core.$ZodNumber<number> {
  return zodNumber([nonNegativeIntegerCheck(label)]);
}

function feeSchema() {
  return zodObject({
    // `amount` is a caller-defined `unit` value (msats in the spec's examples,
    // but `unit` is free-form), so it is not required to be an integer; `kinds`
    // are NIP-01 event kinds
    amount: zodNumber([nonNegativeNumberCheck("amount")]),
    unit: zodString(),
    period: zodOptional(nonNegativeInteger("period")),
    kinds: zodOptional(zodArray(kind())),
  });
}

function feesSchema() {
  return zodObject({
    admission: zodOptional(zodArray(feeSchema())),
    subscription: zodOptional(zodArray(feeSchema())),
    publication: zodOptional(zodArray(feeSchema())),
  });
}

function limitationSchema() {
  return zodObject({
    max_message_length: zodOptional(nonNegativeInteger("max_message_length")),
    max_subscriptions: zodOptional(nonNegativeInteger("max_subscriptions")),
    max_subid_length: zodOptional(nonNegativeInteger("max_subid_length")),
    max_limit: zodOptional(nonNegativeInteger("max_limit")),
    max_event_tags: zodOptional(nonNegativeInteger("max_event_tags")),
    max_content_length: zodOptional(nonNegativeInteger("max_content_length")),
    min_pow_difficulty: zodOptional(nonNegativeInteger("min_pow_difficulty")),
    auth_required: zodOptional(zodBoolean()),
    payment_required: zodOptional(zodBoolean()),
    restricted_writes: zodOptional(zodBoolean()),
    // created_at_*_limit are relative offsets in seconds (how far in the
    // past/future an event's created_at may be), not absolute timestamps — the
    // spec's examples (94608000 ≈ 3y, 300 = 5min) only make sense as durations
    created_at_lower_limit: zodOptional(
      nonNegativeInteger("created_at_lower_limit"),
    ),
    created_at_upper_limit: zodOptional(
      nonNegativeInteger("created_at_upper_limit"),
    ),
    default_limit: zodOptional(nonNegativeInteger("default_limit")),
  });
}

/**
 * NIP-11 relay information document (structure only). Every field is
 * optional per spec ("Any field may be omitted, and clients MUST ignore any
 * additional fields they do not understand") — unknown keys are stripped
 * silently rather than rejected, matching that requirement.
 *
 * `banner`/`icon`/`terms_of_service`/`payments_url` are validated as URLs
 * (matching rust-nostr's `Url`-typed fields); `software`/`contact` are left
 * as plain strings, same as rust-nostr's `RelayInformationDocument` (despite
 * NIP-11 describing `software` as a URL, `contact` isn't always one — it may
 * be a bare email address or other identifier).
 */
export function relayInformationDocumentSchema() {
  return zodObject({
    name: zodOptional(zodString()),
    description: zodOptional(zodString()),
    banner: zodOptional(zodUrl()),
    icon: zodOptional(zodUrl()),
    pubkey: zodOptional(hexStringSchema(64)),
    self: zodOptional(hexStringSchema(64)),
    contact: zodOptional(zodString()),
    supported_nips: zodOptional(zodArray(nonNegativeInteger("supported_nips"))),
    software: zodOptional(zodString()),
    version: zodOptional(zodString()),
    terms_of_service: zodOptional(zodUrl()),
    payments_url: zodOptional(zodUrl()),
    limitation: zodOptional(limitationSchema()),
    fees: zodOptional(feesSchema()),
  });
}

export const nip11 = {
  relayInformationDocument: relayInformationDocumentSchema,
};
