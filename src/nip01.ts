import { verifyEvent } from "nostr-tools/pure";
import type * as core from "zod/v4/core";
import {
  signatureCheck as coreSignatureCheck,
  makeCheck,
  type NostrEventLike,
  nonEmptyArrayCheck,
  nonNegativeIntegerCheck,
} from "./core/checks.js";
import { hexStringSchema } from "./core/hex.js";
import {
  zodArray,
  zodBoolean,
  zodLiteral,
  zodNever,
  zodNumber,
  zodObject,
  zodOptional,
  zodString,
  zodTuple,
  zodUnion,
  zodUnknown,
  zodUrl,
} from "./core/primitives.js";
import { jsonCodec } from "./json.js";
import { lud06Schema } from "./lud06.js";
import { lud16Schema } from "./lud16.js";
import { nip05IdentifierSchema } from "./nip05.js";
import * as nip24 from "./nip24.js";

export function pubkey(): core.$ZodString<string> {
  return hexStringSchema(64);
}

export function eventId(): core.$ZodString<string> {
  return hexStringSchema(64);
}

export function signature(): core.$ZodString<string> {
  return hexStringSchema(128);
}

/**
 * NIP-01 defines `created_at` as a `<unix timestamp in seconds>`, and its
 * filter `since`/`until` (compared against `created_at`) as an
 * `<integer unix timestamp in seconds>`. So an integer is required, matching
 * POSIX "Seconds Since the Epoch". The spec sets no bound and POSIX only marks
 * pre-Epoch (negative) values as undefined, not invalid, so negatives are not
 * rejected.
 */
export function timestamp(): core.$ZodNumber<number> {
  return zodNumber([
    makeCheck<number>((payload) => {
      const value = payload.value;
      if (!Number.isInteger(value)) {
        payload.issues.push({
          code: "custom",
          input: value,
          message:
            "Invalid timestamp (expected an integer unix timestamp in seconds)",
        });
      }
    }),
  ]);
}

/** NIP-01 defines kind as `<integer between 0 and 65535>` */
export function kind(): core.$ZodNumber<number> {
  return zodNumber([
    makeCheck<number>((payload) => {
      const value = payload.value;
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        payload.issues.push({
          code: "custom",
          input: value,
          message: "Invalid kind (expected an integer between 0 and 65535)",
        });
      }
    }),
  ]);
}

/**
 * NIP-01 defines a filter's `limit` as `<maximum number of events relays
 * SHOULD return in the initial query>`. As an event count it is a non-negative
 * integer: fractional, negative, and non-finite values (`NaN`/`Infinity`, which
 * `JSON.stringify` would emit as `null`) are never valid over the wire. `0`
 * (return no events) is allowed; no upper bound is imposed — relay-side caps
 * (`max_limit`/`default_limit`) are NIP-11 policy, not part of this shape.
 */
function limit(): core.$ZodNumber<number> {
  return zodNumber([nonNegativeIntegerCheck("limit")]);
}

/**
 * NIP-01 event tags: an array of tags, where every tag is a non-empty array of
 * strings (its first element is the tag name — an empty `[]` tag has no name and
 * is invalid). The outer array MAY be empty (an event can carry no tags).
 */
export function tags(): core.$ZodArray<
  core.$ZodArray<core.$ZodString<string>>
> {
  return zodArray(zodArray(zodString(), [nonEmptyArrayCheck("tag")]));
}

/** Arbitrary, non-empty string of max length 64 chars, identifying a REQ/EVENT/EOSE/CLOSED subscription */
export function subscriptionId(): core.$ZodString<string> {
  return zodString([
    makeCheck<string>((payload) => {
      if (payload.value.length === 0 || payload.value.length > 64) {
        payload.issues.push({
          code: "custom",
          input: payload.value,
          message:
            "Invalid subscription id (expected a non-empty string of at most 64 chars)",
        });
      }
    }),
  ]);
}

/**
 * NIP-01 defines the event object as a fixed set of fields, so the event
 * schemas reject unknown keys (`catchall: never`) rather than silently
 * stripping them: an unrecognized key is not part of the event shape and could
 * change its meaning (e.g. a mistyped or injected field). Forward-compatible
 * metadata belongs in `tags`, which is already open-ended.
 */

/** Before signing, only kind/content/tags/created_at (equivalent to nostr-tools' EventTemplate) */
export function eventTemplate() {
  return zodObject(
    {
      created_at: timestamp(),
      kind: kind(),
      tags: tags(),
      content: zodString(),
    },
    { catchall: zodNever() },
  );
}

/** Before signing, + pubkey (equivalent to nostr-tools' UnsignedEvent) */
export function unsignedEvent() {
  return zodObject(
    {
      pubkey: pubkey(),
      created_at: timestamp(),
      kind: kind(),
      tags: tags(),
      content: zodString(),
    },
    { catchall: zodNever() },
  );
}

/** Validates structure only; does not verify the signature (compose `.check(signatureCheck())` for that) */
export function event() {
  return zodObject(
    {
      id: eventId(),
      pubkey: pubkey(),
      created_at: timestamp(),
      kind: kind(),
      tags: tags(),
      content: zodString(),
      sig: signature(),
    },
    { catchall: zodNever() },
  );
}

/** Signature verification check bound to nostr-tools' verifyEvent */
export function signatureCheck(): core.$ZodCheck<NostrEventLike> {
  return coreSignatureCheck(verifyEvent);
}

function kindLiteralCheck(value: number): core.$ZodCheck<number> {
  return makeCheck<number>((payload) => {
    if (payload.value !== value) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: `Invalid kind (expected ${value})`,
      });
    }
  });
}

/**
 * Field-level schemas for kind:0 profile metadata, grouped by NIP/LUD origin.
 * Each is strict and non-optional so consumers can layer their own
 * optional/catch/default policy (a pre-weakened field can't be recovered).
 * Fields defined by other specs live in their own modules (`nip24.ts`,
 * `nip05.ts`, `lud16.ts`, `lud06.ts`); this object only aggregates them.
 */
export const metadataFields = {
  name: () => zodString(), // NIP-01
  about: () => zodString(), // NIP-01
  picture: () => zodUrl(), // NIP-01
  displayName: () => nip24.displayName(), // NIP-24
  website: () => nip24.website(), // NIP-24
  banner: () => nip24.banner(), // NIP-24
  bot: () => nip24.bot(), // NIP-24
  birthday: () => nip24.birthday(), // NIP-24
  nip05: () => nip05IdentifierSchema(), // NIP-05
  lud16: () => lud16Schema(), // LUD-16
  lud06: () => lud06Schema(), // LUD-06
};

/**
 * Object schema for kind:0 profile metadata. Each known field is validated
 * strictly (via `metadataFields`) but optional — NIP-01/NIP-24 don't require
 * any field — and no recovery policy (`.catch`/`.default`) is baked in.
 * Unknown keys are preserved as `unknown` (catchall), matching how real kind:0
 * content carries forward-compatible and non-standard fields, so a round-trip
 * through `metadataContent()` doesn't drop them.
 */
function metadataObjectSchema() {
  return zodObject(
    {
      name: zodOptional(metadataFields.name()),
      about: zodOptional(metadataFields.about()),
      picture: zodOptional(metadataFields.picture()),
      display_name: zodOptional(metadataFields.displayName()),
      website: zodOptional(metadataFields.website()),
      banner: zodOptional(metadataFields.banner()),
      bot: zodOptional(metadataFields.bot()),
      birthday: zodOptional(metadataFields.birthday()),
      nip05: zodOptional(metadataFields.nip05()),
      lud16: zodOptional(metadataFields.lud16()),
      lud06: zodOptional(metadataFields.lud06()),
    },
    { catchall: zodUnknown() },
  );
}

/**
 * Output type of `metadata()`: optional known fields plus preserved unknown
 * keys (`[key: string]: unknown`).
 */
export type ProfileMetadata = core.output<
  ReturnType<typeof metadataObjectSchema>
>;

const FILTER_KNOWN_KEYS = new Set([
  "ids",
  "authors",
  "kinds",
  "since",
  "until",
  "limit",
]);

const FILTER_TAG_KEY = /^#[a-zA-Z]$/;

/**
 * Rejects filter keys that are neither a known NIP-01 field nor a `"#<letter>"`
 * tag filter. `extraKeys` additionally allows spec-extension fields defined by
 * other NIPs (e.g. NIP-50's `"search"`), so the NIP-01 known-key set stays
 * NIP-01 while a variant can widen it without duplicating this logic. The
 * allowed set is materialized once at construction, not per parsed value.
 */
export function filterTagKeysCheck(
  extraKeys: Iterable<string> = [],
): core.$ZodCheck<Record<string, unknown>> {
  const knownKeys = new Set([...FILTER_KNOWN_KEYS, ...extraKeys]);
  return makeCheck<Record<string, unknown>>((payload) => {
    for (const key of Object.keys(payload.value)) {
      if (!knownKeys.has(key) && !FILTER_TAG_KEY.test(key)) {
        payload.issues.push({
          code: "custom",
          input: payload.value,
          message: `Invalid filter key (expected an allowed filter field or "#<letter>" tag filter): ${key}`,
        });
      }
    }
  });
}

/**
 * REQ/COUNT filter object (structure only; does not enforce `since <= until`).
 *
 * `ids`/`authors`/`kinds` and every `"#<letter>"` tag filter are non-empty when
 * present — an empty array matches nothing, which NIP-01 expresses by omitting
 * the field, not by sending `[]`. The empty filter object `{}` (match anything)
 * stays valid because every field is optional. Unknown keys are rejected by
 * `filterTagKeysCheck()` (only known fields and `"#<letter>"` tag filters are
 * allowed), so nothing is silently stripped.
 */
export function filter() {
  return zodObject(
    {
      ids: zodOptional(zodArray(eventId(), [nonEmptyArrayCheck("ids")])),
      authors: zodOptional(zodArray(pubkey(), [nonEmptyArrayCheck("authors")])),
      kinds: zodOptional(zodArray(kind(), [nonEmptyArrayCheck("kinds")])),
      since: zodOptional(timestamp()),
      until: zodOptional(timestamp()),
      limit: zodOptional(limit()),
    },
    {
      catchall: zodArray(zodString(), [nonEmptyArrayCheck("tag filter")]),
      checks: [filterTagKeysCheck()],
    },
  );
}

function relayEventMessage() {
  return zodTuple([zodLiteral("EVENT"), subscriptionId(), event()]);
}

function okMessage() {
  return zodTuple([zodLiteral("OK"), eventId(), zodBoolean(), zodString()]);
}

function eoseMessage() {
  return zodTuple([zodLiteral("EOSE"), subscriptionId()]);
}

function closedMessage() {
  return zodTuple([zodLiteral("CLOSED"), subscriptionId(), zodString()]);
}

function noticeMessage() {
  return zodTuple([zodLiteral("NOTICE"), zodString()]);
}

/**
 * NIP-01 requires OK/CLOSED messages to follow a "<prefix>: <message>" shape
 * (single-word machine-readable prefix, ": ", then human-readable text), but
 * doesn't restrict the prefix to a closed set — NIP-01's own CLOSED example
 * uses "unsupported:", which isn't among the "standardized" ones it lists
 * (duplicate/pow/blocked/rate-limited/invalid/restricted/mute/error). So
 * this checks the shape, not membership in that list.
 */
const MESSAGE_PREFIX_FORMAT = /^[a-z][a-z-]*: \S/;

function hasPrefixedMessageFormat(message: string): boolean {
  return MESSAGE_PREFIX_FORMAT.test(message);
}

/**
 * Typed `unknown[]` (rather than the precise OK/CLOSED tuple shape) because
 * classic.ts/mini.ts re-wrap tuple schemas through the generic
 * classicSchema()/miniSchema() helper, which doesn't preserve item types —
 * so the schema `.check()` is composed onto only accepts checks typed this
 * loosely. Safe in practice: these checks only ever run after ZodTuple's own
 * structural validation has already confirmed the shape.
 */

/**
 * Checks that OK's message follows NIP-01's "<prefix>: <message>" convention.
 * Only enforced when the event was rejected (3rd element `false`) — NIP-01
 * allows the message to be an empty string when accepted.
 */
function okMessagePrefixCheck(): core.$ZodCheck<unknown[]> {
  return makeCheck<unknown[]>((payload) => {
    const accepted = payload.value[2] as boolean;
    const message = payload.value[3] as string;
    if (accepted) return;
    if (!hasPrefixedMessageFormat(message)) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message:
          'Invalid OK message (a rejected event MUST use "<prefix>: <message>" format)',
      });
    }
  });
}

/** Checks that CLOSED's message follows NIP-01's "<prefix>: <message>" convention */
function closedMessagePrefixCheck(): core.$ZodCheck<unknown[]> {
  return makeCheck<unknown[]>((payload) => {
    const message = payload.value[2] as string;
    if (!hasPrefixedMessageFormat(message)) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message:
          'Invalid CLOSED message (expected "<prefix>: <message>" format)',
      });
    }
  });
}

/** NIP-01 relay-to-client messages (structure only; EVENT does not verify the signature) */
export const relayMessage = {
  event: relayEventMessage,
  ok: okMessage,
  eose: eoseMessage,
  closed: closedMessage,
  notice: noticeMessage,
  any: () =>
    zodUnion([
      relayEventMessage(),
      okMessage(),
      eoseMessage(),
      closedMessage(),
      noticeMessage(),
    ]),
  // Opt-in checks: NIP-01's machine-readable message prefix isn't enforced by
  // ok()/closed() themselves since many relays don't follow it strictly.
  // Compose explicitly: zostr.nip01.relayMessage.ok().check(zostr.nip01.relayMessage.okMessagePrefixCheck())
  okMessagePrefixCheck,
  closedMessagePrefixCheck,
};

function clientEventMessage() {
  return zodTuple([zodLiteral("EVENT"), event()]);
}

/**
 * `["REQ", subscriptionId, filter, ...filter[]]`. At least one filter is
 * required, matching NIP-01's grammar (`<filters1>` then `<filters2>...`): the
 * first filter is a fixed tuple item and any further filters are the rest.
 * Requesting everything sends a single empty `{}` filter, so there is no need
 * to allow zero.
 */
function reqMessage() {
  return zodTuple([zodLiteral("REQ"), subscriptionId(), filter()], filter());
}

function closeMessage() {
  return zodTuple([zodLiteral("CLOSE"), subscriptionId()]);
}

/** NIP-01 client-to-relay messages (structure only; EVENT does not verify the signature) */
export const clientMessage = {
  event: clientEventMessage,
  req: reqMessage,
  close: closeMessage,
  any: () => zodUnion([clientEventMessage(), reqMessage(), closeMessage()]),
};

export const nip01 = {
  /** Object schema for a parsed kind:0 profile object (optional known fields + preserved unknown keys) */
  metadata: () => metadataObjectSchema(),
  /** Codec for kind:0 `content` (JSON string) <-> the `metadata()` profile object */
  metadataContent: () => jsonCodec(metadataObjectSchema()),
  /** Event schema fixed to kind:1 (structure only; compose `.check(signatureCheck())` for the signature) */
  textNote: () =>
    zodObject(
      {
        id: eventId(),
        pubkey: pubkey(),
        created_at: timestamp(),
        kind: zodNumber([kindLiteralCheck(1)]),
        tags: tags(),
        content: zodString(),
        sig: signature(),
      },
      { catchall: zodNever() },
    ),
};

export type { NostrEventLike };
