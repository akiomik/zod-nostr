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
  zodUnknown,
  zodUrl,
} from "./core/primitives.js";
import { kind } from "./nip01.js";

/** Non-negative integer atom for NIP-11 count/length/duration fields */
function nonNegativeInteger(label: string): core.$ZodNumber<number> {
  return zodNumber([nonNegativeIntegerCheck(label)]);
}

// NIP-11 is a forward-compatible document ("clients MUST ignore any additional
// fields they do not understand"), so every object here — the top-level
// document and its nested `limitation`/`fees`/fee objects — preserves unknown
// keys (catchall `unknown`) rather than silently stripping them.
function feeSchema() {
  return zodObject(
    {
      // `amount` is a caller-defined `unit` value (msats in the spec's examples,
      // but `unit` is free-form), so it is not required to be an integer; `kinds`
      // are NIP-01 event kinds
      amount: zodNumber([nonNegativeNumberCheck("amount")]),
      unit: zodString(),
      period: zodOptional(nonNegativeInteger("period")),
      kinds: zodOptional(zodArray(kind())),
    },
    { catchall: zodUnknown() },
  );
}

function feesSchema() {
  return zodObject(
    {
      admission: zodOptional(zodArray(feeSchema())),
      subscription: zodOptional(zodArray(feeSchema())),
      publication: zodOptional(zodArray(feeSchema())),
    },
    { catchall: zodUnknown() },
  );
}

function limitationSchema() {
  return zodObject(
    {
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
    },
    { catchall: zodUnknown() },
  );
}

/**
 * NIP-11 relay information document (structure only). Every field is optional
 * per spec ("Any field may be omitted, and clients MUST ignore any additional
 * fields they do not understand") — unknown keys are preserved (catchall
 * `unknown`), matching that forward-compatibility requirement, rather than
 * silently stripped.
 *
 * `banner`/`icon`/`terms_of_service`/`payments_url`/`software` are validated as
 * URLs: NIP-11 defines `software` as "URL to the relay's software homepage", so
 * it is a URL here (a consumer needing a laxer, interop-only field composes its
 * own). `contact` stays a plain string — it may be a bare email address or
 * other identifier rather than a URL.
 */
export function relayInformationDocumentSchema() {
  return zodObject(
    {
      name: zodOptional(zodString()),
      description: zodOptional(zodString()),
      banner: zodOptional(zodUrl()),
      icon: zodOptional(zodUrl()),
      pubkey: zodOptional(hexStringSchema(64)),
      self: zodOptional(hexStringSchema(64)),
      contact: zodOptional(zodString()),
      supported_nips: zodOptional(
        zodArray(nonNegativeInteger("supported_nips")),
      ),
      software: zodOptional(zodUrl()),
      version: zodOptional(zodString()),
      terms_of_service: zodOptional(zodUrl()),
      payments_url: zodOptional(zodUrl()),
      limitation: zodOptional(limitationSchema()),
      fees: zodOptional(feesSchema()),
    },
    { catchall: zodUnknown() },
  );
}

export const nip11 = {
  relayInformationDocument: relayInformationDocumentSchema,
};
