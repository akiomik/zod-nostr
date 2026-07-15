import { verifyEvent } from "nostr-tools/pure";
import * as core from "zod/v4/core";
import {
  signatureCheck as coreSignatureCheck,
  makeCheck,
  type NostrEventLike,
} from "./core/checks.js";
import { makeCodec } from "./core/codecs.js";
import { hexStringSchema } from "./core/hex.js";
import {
  zodArray,
  zodBoolean,
  zodLiteral,
  zodNumber,
  zodObject,
  zodOptional,
  zodString,
  zodTuple,
  zodUnion,
} from "./core/primitives.js";
import { nip05IdentifierSchema } from "./nip05.js";

export function pubkey(): core.$ZodString<string> {
  return hexStringSchema(64);
}

export function eventId(): core.$ZodString<string> {
  return hexStringSchema(64);
}

export function signature(): core.$ZodString<string> {
  return hexStringSchema(128);
}

export function timestamp(): core.$ZodNumber<number> {
  return zodNumber();
}

export function kind(): core.$ZodNumber<number> {
  return zodNumber();
}

export function tags(): core.$ZodArray<
  core.$ZodArray<core.$ZodString<string>>
> {
  return zodArray(zodArray(zodString()));
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

/** Before signing, only kind/content/tags/created_at (equivalent to nostr-tools' EventTemplate) */
export function eventTemplate() {
  return zodObject({
    created_at: timestamp(),
    kind: kind(),
    tags: tags(),
    content: zodString(),
  });
}

/** Before signing, + pubkey (equivalent to nostr-tools' UnsignedEvent) */
export function unsignedEvent() {
  return zodObject({
    pubkey: pubkey(),
    created_at: timestamp(),
    kind: kind(),
    tags: tags(),
    content: zodString(),
  });
}

/** Validates structure only; does not verify the signature (compose `.check(signatureCheck())` for that) */
export function event() {
  return zodObject({
    id: eventId(),
    pubkey: pubkey(),
    created_at: timestamp(),
    kind: kind(),
    tags: tags(),
    content: zodString(),
    sig: signature(),
  });
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

export interface ProfileMetadata {
  name: string;
  display_name: string;
  picture: string;
  nip05: string;
}

function profileMetadataObjectSchema() {
  return zodObject({
    name: zodString(),
    display_name: zodString(),
    picture: zodString(),
    nip05: nip05IdentifierSchema(),
  });
}

const FILTER_KNOWN_KEYS = new Set([
  "ids",
  "authors",
  "kinds",
  "since",
  "until",
  "limit",
]);

const FILTER_TAG_KEY = /^#[a-zA-Z]$/;

function filterTagKeysCheck(): core.$ZodCheck<Record<string, unknown>> {
  return makeCheck<Record<string, unknown>>((payload) => {
    for (const key of Object.keys(payload.value)) {
      if (!FILTER_KNOWN_KEYS.has(key) && !FILTER_TAG_KEY.test(key)) {
        payload.issues.push({
          code: "custom",
          input: payload.value,
          message: `Invalid filter key (expected a NIP-01 field or "#<letter>" tag filter): ${key}`,
        });
      }
    }
  });
}

/** REQ/COUNT filter object (structure only; does not enforce `since <= until`) */
export function filter() {
  return zodObject(
    {
      ids: zodOptional(zodArray(eventId())),
      authors: zodOptional(zodArray(pubkey())),
      kinds: zodOptional(zodArray(kind())),
      since: zodOptional(timestamp()),
      until: zodOptional(timestamp()),
      limit: zodOptional(zodNumber()),
    },
    {
      catchall: zodArray(zodString()),
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
};

function clientEventMessage() {
  return zodTuple([zodLiteral("EVENT"), event()]);
}

function reqMessage() {
  return zodTuple([zodLiteral("REQ"), subscriptionId()], filter());
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
  /** Codec for kind:0 content (JSON string) <-> parsed profile object */
  metadata: () =>
    makeCodec(zodString(), profileMetadataObjectSchema(), {
      decode: (content, payload) => {
        try {
          return JSON.parse(content);
        } catch {
          payload.issues.push({
            code: "custom",
            input: content,
            message: "Invalid Nostr profile content",
          });
          return core.NEVER;
        }
      },
      encode: (metadata) => JSON.stringify(metadata),
    }),
  /** Event schema fixed to kind:1 (structure only; compose `.check(signatureCheck())` for the signature) */
  textNote: () =>
    zodObject({
      id: eventId(),
      pubkey: pubkey(),
      created_at: timestamp(),
      kind: zodNumber([kindLiteralCheck(1)]),
      tags: tags(),
      content: zodString(),
      sig: signature(),
    }),
};

export type { NostrEventLike };
