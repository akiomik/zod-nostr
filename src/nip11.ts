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

function feeSchema() {
  return zodObject({
    amount: zodNumber(),
    unit: zodString(),
    period: zodOptional(zodNumber()),
    kinds: zodOptional(zodArray(zodNumber())),
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
    max_message_length: zodOptional(zodNumber()),
    max_subscriptions: zodOptional(zodNumber()),
    max_subid_length: zodOptional(zodNumber()),
    max_limit: zodOptional(zodNumber()),
    max_event_tags: zodOptional(zodNumber()),
    max_content_length: zodOptional(zodNumber()),
    min_pow_difficulty: zodOptional(zodNumber()),
    auth_required: zodOptional(zodBoolean()),
    payment_required: zodOptional(zodBoolean()),
    restricted_writes: zodOptional(zodBoolean()),
    created_at_lower_limit: zodOptional(zodNumber()),
    created_at_upper_limit: zodOptional(zodNumber()),
    default_limit: zodOptional(zodNumber()),
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
    supported_nips: zodOptional(zodArray(zodNumber())),
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
