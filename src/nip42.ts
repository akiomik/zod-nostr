import type * as core from "zod/v4/core";
import {
  guardEventTags,
  isNamedTag,
  makeCheck,
  type NostrEventLike,
} from "./core/checks.js";
import {
  zodLiteral,
  zodNever,
  zodObject,
  zodString,
  zodTuple,
} from "./core/primitives.js";
import { eventId, pubkey, signature, tags, timestamp } from "./nip01.js";

/** NIP-42 fixes the canonical authentication event to `kind: 22242`. */
const AUTH_EVENT_KIND = 22242;

/**
 * NIP-42 canonical authentication event (`kind: 22242`), structure only — the
 * ephemeral event a client signs and sends inside a client-to-relay `AUTH`
 * message. Like `nip01.event()`/`textNote()` it does not verify the signature;
 * compose `.check(signatureCheck())` for that.
 *
 * The kind is fixed with a literal schema, so it both validates to and infers
 * exactly `22242`. The `"relay"`/`"challenge"` tags are NOT required by the base
 * schema: NIP-42 only says the event *should* carry them ("it should have at
 * least two tags"), and matching them against the connection's relay URL and
 * challenge is a relay-side verification step that depends on context the schema
 * doesn't have. Those are exposed as opt-in checks
 * (`challengeTagCheck`/`relayTagCheck`/`createdAtCheck`) instead of baked in.
 */
function authEvent() {
  return zodObject(
    {
      id: eventId(),
      pubkey: pubkey(),
      created_at: timestamp(),
      kind: zodLiteral(AUTH_EVENT_KIND),
      tags: tags(),
      content: zodString(),
      sig: signature(),
    },
    // Fixed event shape, same as nip01.event()/textNote(): reject unknown keys
    // rather than silently strip them.
    { catchall: zodNever() },
  );
}

/**
 * Relay-to-client `AUTH` message: `["AUTH", challenge]`. The challenge is an
 * arbitrary relay-chosen string (NIP-42 places no format constraint on it).
 */
function relayAuthMessage() {
  return zodTuple([zodLiteral("AUTH"), zodString()]);
}

/**
 * Client-to-relay `AUTH` message: `["AUTH", signedAuthEvent]`, carrying the
 * `authEvent()` (`kind: 22242`) the client signed to request authentication.
 * The relay answers it with an `OK` message, not another `AUTH`. Structure
 * only; compose `.check(signatureCheck())` on `authEvent()` to verify the
 * signature.
 */
function clientAuthMessage() {
  return zodTuple([zodLiteral("AUTH"), authEvent()]);
}

/**
 * Value of the first tag named `name` (its second element), or `undefined`.
 * `eventTags` is the array {@link guardEventTags} returns — the caller has
 * already rejected a non-array `tags` with the canonical malformed-event message
 * — so this only scans: {@link isNamedTag} skips a null/non-array element, and
 * the result stays `unknown` (the tag-value checks compare it with `!==`, so a
 * non-string value simply fails the match with nothing to coerce).
 */
function firstTagValue(eventTags: unknown[], name: string): unknown {
  return eventTags.find((tag) => isNamedTag(tag, name))?.[1];
}

/**
 * Opt-in check: the auth event's `"challenge"` tag matches the challenge the
 * relay previously sent over this connection. Parameterized because the
 * expected challenge is connection state, not something the schema can know —
 * the same reasoning as `signatureCheck()`. Compose on `authEvent()`:
 * `authEvent().check(challengeTagCheck(challenge))`.
 *
 * A non-array `tags` (reachable only through a consumer's loose schema) fails
 * with the shared malformed-event message via {@link guardEventTags}, the same
 * as the other tag checks — not a misleading challenge-mismatch message.
 *
 * `challenge` fails **closed**: a non-string (e.g. an `undefined` reaching this
 * on the untyped JS path) would make an auth event that carries *no* challenge
 * tag compare `undefined !== undefined` and silently pass, disabling the check.
 * The factory throws at composition time instead, the same guard as
 * `createdAtCheck`.
 */
function challengeTagCheck(challenge: string): core.$ZodCheck<NostrEventLike> {
  if (typeof challenge !== "string") {
    throw new TypeError("challengeTagCheck: `challenge` must be a string");
  }
  return makeCheck<NostrEventLike>((payload) => {
    const tags = guardEventTags(payload);
    if (tags === undefined) return;
    if (firstTagValue(tags, "challenge") !== challenge) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message:
          'Invalid auth event (the "challenge" tag must match the challenge sent by the relay)',
      });
    }
  });
}

/**
 * Opt-in check: the auth event's `"relay"` tag matches the relay's URL. Compared
 * as exact strings — NIP-42 says URL normalization "can be applied", so a
 * consumer that wants to match loosely (e.g. by domain, ignoring a trailing
 * slash) normalizes both sides before comparing. Compose on `authEvent()`:
 * `authEvent().check(relayTagCheck(relayUrl))`.
 *
 * A non-array `tags` fails with the shared malformed-event message via
 * {@link guardEventTags}, the same as the other tag checks.
 *
 * `relayUrl` fails **closed** the same way as `challengeTagCheck`'s `challenge`:
 * a non-string would let an auth event with no `relay` tag pass silently, so the
 * factory throws at composition time.
 */
function relayTagCheck(relayUrl: string): core.$ZodCheck<NostrEventLike> {
  if (typeof relayUrl !== "string") {
    throw new TypeError("relayTagCheck: `relayUrl` must be a string");
  }
  return makeCheck<NostrEventLike>((payload) => {
    const tags = guardEventTags(payload);
    if (tags === undefined) return;
    if (firstTagValue(tags, "relay") !== relayUrl) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message:
          'Invalid auth event (the "relay" tag must match the relay URL)',
      });
    }
  });
}

/**
 * Opt-in check: the auth event's `created_at` is close to the current time.
 * `now` is the reference time in unix seconds (the caller supplies it, keeping
 * the check pure and testable) and `toleranceSeconds` is the allowed absolute
 * difference — defaulting to `600` (~10 minutes), the window NIP-42 gives as an
 * example. The default can be overridden in either direction. Compose on
 * `authEvent()`: `authEvent().check(createdAtCheck(nowInSeconds))`.
 *
 * NIP-42 makes the relay's time check a MUST, so this fails **closed** on
 * misconfiguration: a non-finite `now`, or a `toleranceSeconds` that isn't
 * finite and non-negative, would make the `Math.abs(...) > tolerance`
 * comparison silently accept every timestamp (`NaN`/`Infinity` comparisons are
 * always false). Rather than let that pass, the factory throws so the mistake
 * surfaces at composition time instead of quietly disabling the check.
 */
function createdAtCheck(
  now: number,
  toleranceSeconds = 600,
): core.$ZodCheck<NostrEventLike> {
  if (!Number.isFinite(now)) {
    throw new TypeError(
      "createdAtCheck: `now` must be a finite unix timestamp in seconds",
    );
  }
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
    throw new TypeError(
      "createdAtCheck: `toleranceSeconds` must be a finite, non-negative number",
    );
  }
  return makeCheck<NostrEventLike>((payload) => {
    if (Math.abs(payload.value.created_at - now) > toleranceSeconds) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: `Invalid auth event (created_at must be within ${toleranceSeconds}s of the current time)`,
      });
    }
  });
}

/** NIP-42 client-relay authentication (`AUTH`) handshake messages, event, and opt-in verification checks */
export const nip42 = {
  /** Canonical authentication event (`kind: 22242`, structure only) */
  authEvent,
  /** Relay-to-client `AUTH` message */
  relayMessage: {
    /** Relay-to-client `["AUTH", challenge]` */
    auth: relayAuthMessage,
  },
  /** Client-to-relay `AUTH` message */
  clientMessage: {
    /** Client-to-relay `["AUTH", signedAuthEvent]` */
    auth: clientAuthMessage,
  },
  /** Opt-in check: the `"challenge"` tag matches the relay's challenge */
  challengeTagCheck,
  /** Opt-in check: the `"relay"` tag matches the relay URL */
  relayTagCheck,
  /** Opt-in check: `created_at` is within `toleranceSeconds` (default 600) of `now` */
  createdAtCheck,
};
