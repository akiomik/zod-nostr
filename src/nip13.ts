import type * as core from "zod/v4/core";
import { makeCheck, type NostrEventLike } from "./core/checks.js";
import {
  zodLiteral,
  zodOptional,
  zodString,
  zodTuple,
} from "./core/primitives.js";

/** NIP-13 names the proof-of-work tag `nonce`. */
const NONCE_TAG_NAME = "nonce";

/**
 * Canonical non-negative decimal integer (no leading zeros): `"0"`, `"20"`, …
 * A NIP-13 target difficulty is a leading-zero-bit **count**, so its wire form
 * is a plain non-negative integer — the same canonical-decimal shape used for a
 * `<kind>` coordinate (see `nip10`'s event-address check).
 */
const DIFFICULTY_RE = /^(0|[1-9]\d*)$/;

/**
 * The `nonce` tag's committed target difficulty (its third element): a string
 * validated as a non-negative decimal integer. Modeled strictly, the same way
 * `nip10.eTag()` validates its marker enum rather than accepting any string.
 */
function targetDifficulty(): core.$ZodString<string> {
  return zodString([
    makeCheck<string>((payload) => {
      if (!DIFFICULTY_RE.test(payload.value)) {
        payload.issues.push({
          code: "custom",
          input: payload.value,
          message:
            "Invalid target difficulty (expected a non-negative integer)",
        });
      }
    }),
  ]);
}

/**
 * NIP-13 proof-of-work `nonce` tag: `["nonce", <nonce>, <target difficulty>?]`.
 *
 * - `<nonce>` — the value a miner varies to change the event id. NIP-13 places
 *   no format constraint on it (it is typically a decimal counter but need not
 *   be), so it is a plain string.
 * - `<target difficulty>` — the difficulty the miner **commits** to, validated
 *   as a non-negative integer string when present. It is **optional**: NIP-13
 *   says the tag *SHOULD* carry the commitment, not MUST, so a two-element
 *   `["nonce", <nonce>]` is spec-valid and accepted (design.md, "faithful to
 *   the spec, never reject spec-valid input"). Enforcing the commitment against
 *   a required difficulty is a separate, opt-in concern — see
 *   {@link commitmentCheck}.
 *
 * This models the tag verbatim: like the other tag schemas it is a fixed tuple,
 * so a fourth element is rejected. The tag's **structure** is kept separate from
 * verifying the event's achieved difficulty ({@link powCheck}).
 */
function nonceTag() {
  return zodTuple([
    zodLiteral(NONCE_TAG_NAME),
    zodString(),
    zodOptional(targetDifficulty()),
  ]);
}

/**
 * Counts the leading zero **bits** of a hex string, per NIP-13 (each hex digit
 * is 4 bits, so a digit `<= 7` still contributes leading zeros within its
 * nibble). Mirrors NIP-13's reference `countLeadingZeroes`.
 */
function countLeadingZeroBits(hex: string): number {
  let count = 0;
  for (const char of hex) {
    const nibble = Number.parseInt(char, 16);
    if (nibble === 0) {
      count += 4;
      continue;
    }
    // Math.clz32 counts leading zeros in a 32-bit word; the nibble occupies the
    // low 4 bits, so subtract the 28 high zero bits that aren't part of it.
    return count + Math.clz32(nibble) - 28;
  }
  return count;
}

/**
 * Fail-closed guard for a difficulty argument. A `NaN`, negative, or fractional
 * `minDifficulty` would make the `< minDifficulty` comparison silently accept
 * every event (a `< NaN` test is always false), quietly disabling the check —
 * the same failure mode `nip42.createdAtCheck` guards against. Throw at
 * composition time instead, so the mistake surfaces rather than passing.
 */
function assertDifficulty(fnName: string, minDifficulty: number): void {
  if (!Number.isInteger(minDifficulty) || minDifficulty < 0) {
    throw new TypeError(
      `${fnName}: \`minDifficulty\` must be a non-negative integer`,
    );
  }
}

/**
 * Opt-in check: the event's **achieved** proof of work meets `minDifficulty` —
 * its `id` has at least `minDifficulty` leading zero bits. This inspects only
 * the `id`, not the `nonce` tag; the committed target is a separate concern
 * ({@link commitmentCheck}).
 *
 * Compose it onto an id-bearing event schema the same way as `signatureCheck()`
 * (i.e. `event()`/`nip10.textNote()`/`nip42.authEvent()`, not the id-less
 * `eventTemplate()`/`unsignedEvent()`):
 * `zostr.event().check(zostr.nip13.powCheck(20))`.
 *
 * `minDifficulty` fails closed (see {@link assertDifficulty}). `0` is valid and
 * accepts any event (no requirement).
 */
function powCheck(minDifficulty: number): core.$ZodCheck<NostrEventLike> {
  assertDifficulty("powCheck", minDifficulty);
  return makeCheck<NostrEventLike>((payload) => {
    if (countLeadingZeroBits(payload.value.id) < minDifficulty) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: `Insufficient proof of work (the id must have at least ${minDifficulty} leading zero bits)`,
      });
    }
  });
}

/** The committed target of the event's first `nonce` tag, if it is valid. */
function committedTarget(tags: readonly string[][]): number | undefined {
  const target = tags.find((tag) => tag[0] === NONCE_TAG_NAME)?.[2];
  if (target === undefined || !DIFFICULTY_RE.test(target)) return undefined;
  return Number(target);
}

/**
 * Opt-in check: the event **commits** to a target of at least `minDifficulty` —
 * its `nonce` tag carries a committed target difficulty (its third element) that
 * is `>= minDifficulty`. This is NIP-13's anti-spam guard: a note that merely
 * got lucky at a low committed target can be rejected even if its actual
 * difficulty is high, so achieving difficulty ({@link powCheck}) and committing
 * to it are checked separately and composed together for full validation:
 *
 * ```ts
 * zostr.event()
 *   .check(zostr.signatureCheck())
 *   .check(zostr.nip13.powCheck(20))
 *   .check(zostr.nip13.commitmentCheck(20));
 * ```
 *
 * Composing this check is how a consumer opts into requiring a commitment
 * (NIP-13's "a client MAY reject a note missing a difficulty commitment"): a
 * missing `nonce` tag, a missing/invalid target, or a target below
 * `minDifficulty` all fail. When several `nonce` tags are present (NIP-13 uses
 * one) the first is checked, matching how the other tag checks read tags.
 *
 * `minDifficulty` fails closed (see {@link assertDifficulty}).
 */
function commitmentCheck(
  minDifficulty: number,
): core.$ZodCheck<NostrEventLike> {
  assertDifficulty("commitmentCheck", minDifficulty);
  return makeCheck<NostrEventLike>((payload) => {
    const target = committedTarget(payload.value.tags);
    if (target === undefined || target < minDifficulty) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: `Missing or insufficient proof-of-work commitment (the "nonce" tag must commit to a target of at least ${minDifficulty})`,
      });
    }
  });
}

/** NIP-13 proof of work: the `nonce` tag schema and opt-in verification checks */
export const nip13 = {
  /** `["nonce", <nonce>, <target difficulty>?]` tag schema */
  nonceTag,
  /** Opt-in check: the id has at least `minDifficulty` leading zero bits */
  powCheck,
  /** Opt-in check: the `nonce` tag commits to a target of at least `minDifficulty` */
  commitmentCheck,
};
