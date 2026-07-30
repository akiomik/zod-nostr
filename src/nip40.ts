import type * as core from "zod/v4/core";
import {
  integerStringCheck,
  integerStringPattern,
  makeCheck,
  type NostrEventLike,
} from "./core/checks.js";
import { zodLiteral, zodString, zodTuple } from "./core/primitives.js";

/** NIP-40 names the expiration timestamp tag `expiration`. */
const EXPIRATION_TAG_NAME = "expiration";

/**
 * An integer unix timestamp in seconds, as it appears on the wire (a tag value
 * is always a string). NIP-40 says the expiration is "a unix timestamp in
 * seconds" in the same format as `created_at`, so this mirrors `nip01.timestamp`
 * exactly, only as a string: an integer with no bound, leading zeros accepted
 * (no canonical encoding), negatives not rejected (a pre-Epoch value is
 * undefined, not invalid, under POSIX). Single source of truth shared by
 * {@link expirationTag}'s schema (via {@link integerStringCheck}) and
 * {@link expirationCheck}'s bare predicate, so the two can never disagree on
 * what a valid expiration value is.
 */
const TIMESTAMP_RE = integerStringPattern({ signed: true });

/** The `expiration` tag's timestamp value (its second element). */
function expirationTimestamp(): core.$ZodString<string> {
  return zodString([
    integerStringCheck("expiration", {
      signed: true,
      expected: "an integer unix timestamp in seconds",
    }),
  ]);
}

/**
 * NIP-40 expiration tag: `["expiration", <unix timestamp in seconds>]`.
 *
 * The timestamp is the time at which the event SHOULD be considered expired
 * (and MAY be deleted by relays), in the same format as `created_at`. Like the
 * other tag schemas it is a fixed tuple, so a third element is rejected, and the
 * value is validated as an integer unix-seconds string (see
 * {@link expirationTimestamp}).
 *
 * This models the tag's **structure** only. Whether an event is *currently*
 * expired depends on the reference time — context the schema cannot see — so
 * that comparison is a separate, opt-in {@link expirationCheck}, the same way
 * `nip13.nonceTag` is separate from `nip13.powCheck`.
 */
function expirationTag() {
  return zodTuple([zodLiteral(EXPIRATION_TAG_NAME), expirationTimestamp()]);
}

/**
 * Opt-in check: the event is **not expired** at the reference time `now` (unix
 * seconds — the caller supplies it, keeping the check pure and testable, the
 * same shape as `nip42.createdAtCheck`). Compose it onto an event schema like
 * `signatureCheck()`: `zostr.event().check(zostr.nip40.expirationCheck(now))`.
 *
 * An event is expired when an `expiration` tag's timestamp is at or before `now`
 * (NIP-40: expired *at* that timestamp, hence `<=`). NIP-40 places no limit on
 * how many `expiration` tags an event may carry and NIP-01 does not forbid
 * duplicate tags, so the event is rejected if *any* `expiration` tag has reached
 * its time (or is malformed) — tag order does not change the verdict. The scan
 * stops at the first problem it finds: the outcome is a single pass/fail, so one
 * issue is reported rather than one per offending tag.
 *
 * Distinct outcomes, deliberately not collapsed together:
 * - no `expiration` tag → the event has no expiry → **passes**;
 * - an `expiration` tag whose value is missing or not a valid integer
 *   timestamp → a malformed expiration → **fails** (structural validity is
 *   {@link expirationTag}'s job, but a garbage value here must not be silently
 *   treated as "no expiry");
 * - a non-array `tags`, or a non-array/non-string tag element (the untyped JS
 *   path) → a malformed event → **fails**, without throwing (zod's
 *   `safeParse`-never-throws contract, the same graceful degradation as
 *   `nip13.powCheck`).
 *
 * Comparison uses `BigInt` so a timestamp beyond `Number.MAX_SAFE_INTEGER` is
 * compared exactly rather than rounded (a rounded `Number` could flip the
 * verdict, and an out-of-range value would become `Infinity` and never expire).
 * A `bigint`-vs-`number` comparison is valid in JS, so a fractional `now` is
 * still handled correctly.
 *
 * `now` fails **closed**: a non-finite value would make every `<= now`
 * comparison behave unpredictably, so the factory throws at composition time
 * rather than quietly disabling the check (the same guard as
 * `nip42.createdAtCheck`).
 */
function expirationCheck(now: number): core.$ZodCheck<NostrEventLike> {
  if (!Number.isFinite(now)) {
    throw new TypeError(
      "expirationCheck: `now` must be a finite unix timestamp in seconds",
    );
  }
  return makeCheck<NostrEventLike>((payload) => {
    const { tags } = payload.value;
    if (!Array.isArray(tags)) {
      // A non-array `tags` is a malformed event, not one without an expiry.
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: 'Invalid event (expected "tags" to be an array of tags)',
      });
      return;
    }
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag[0] !== EXPIRATION_TAG_NAME) continue;
      const value = tag[1];
      if (typeof value !== "string" || !TIMESTAMP_RE.test(value)) {
        payload.issues.push({
          code: "custom",
          input: payload.value,
          message:
            'Invalid "expiration" tag (expected an integer unix timestamp in seconds)',
        });
        return;
      }
      // BigInt keeps timestamps beyond Number.MAX_SAFE_INTEGER exact; `<=` is
      // valid against a (possibly fractional) number `now`.
      if (BigInt(value) <= now) {
        payload.issues.push({
          code: "custom",
          input: payload.value,
          message:
            'Event has expired (an "expiration" tag is at or before the current time)',
        });
        return;
      }
    }
  });
}

/** NIP-40 expiration timestamps (the `expiration` tag schema + opt-in not-expired check) */
export const nip40 = {
  /** `["expiration", <unix timestamp in seconds>]` tag schema (structure only) */
  expirationTag,
  /** Opt-in check: the event is not expired at `now` (unix seconds) */
  expirationCheck,
};
