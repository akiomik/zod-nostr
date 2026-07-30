import type * as core from "zod/v4/core";
import { makeCheck, type NostrEventLike } from "./core/checks.js";
import { zodLiteral, zodTuple } from "./core/primitives.js";

/** NIP-70 marks a protected event with a single-element `["-"]` tag. */
const PROTECTED_TAG_NAME = "-";

/**
 * NIP-70 protected marker tag: `["-"]`.
 *
 * Its mere presence marks the event as *protected*: NIP-70 says a relay MUST
 * reject a protected event by default, and MAY accept it only after the client
 * authenticates (NIP-42) as the event's author. The tag carries no value, so
 * this is a fixed **single-element** tuple — a second element is rejected, the
 * same way the other tag schemas reject extra elements.
 *
 * This models the tag's **structure** only. Deciding whether a given publisher
 * is allowed to publish a protected event depends on the connection's NIP-42
 * authentication state — context the schema cannot see — so that authorization
 * is a separate, opt-in {@link protectedCheck}, the same way `nip40.expirationTag`
 * is separate from `nip40.expirationCheck`.
 */
function protectedTag() {
  return zodTuple([zodLiteral(PROTECTED_TAG_NAME)]);
}

/**
 * Opt-in check: a **protected** event (one carrying a `["-"]` tag) may be
 * published only by its author — its `pubkey` must be among the connection's
 * authenticated pubkeys. This encodes NIP-70's relay-side rule ("check if the
 * authenticated client has the same pubkey as the event being published and only
 * accept the event in that case"). Compose it onto an event schema the same way
 * as `signatureCheck()`:
 * `zostr.event().check(zostr.nip70.protectedCheck(authenticatedPubkeys))`.
 *
 * `authenticatedPubkeys` is the **set** of pubkeys the connection has
 * authenticated. NIP-42 lets a single connection authenticate several pubkeys in
 * a sequence of `AUTH` messages ("Relays MUST treat all pubkeys as authenticated
 * accordingly"), so this takes a list, not a single value; the caller passes a
 * fresh snapshot of the connection's authenticated set (e.g. `[pubkey]` for a
 * single authenticated identity) and re-composes the check when that set changes.
 * The NIP-42 session state itself stays outside — only the resolved pubkeys cross
 * the boundary, the same shape as `nip42.relayTagCheck(relayUrl)`.
 *
 * The check is meaningful only for protected events; a non-protected event has
 * no author restriction and always **passes**.
 *
 * `authenticatedPubkeys` defaults to `[]` — an **unauthenticated** connection —
 * which fails **closed**: every protected event is rejected (NIP-70's default),
 * so a bad or absent set errs toward rejection rather than acceptance. The
 * factory does not throw on a malformed set: a non-array argument (or a
 * non-string element) reaching it through the untyped JS path contributes no
 * authenticated pubkey, so it rejects protected events rather than blowing up
 * before parse — unlike `nip42.createdAtCheck`, where a bad argument would fail
 * *open* and silently accept everything, so it throws instead.
 *
 * Distinct outcomes, deliberately not collapsed together:
 * - no `["-"]` tag → not protected → **passes**;
 * - protected, and `pubkey` is in `authenticatedPubkeys` → **passes**;
 * - protected, and `pubkey` is absent (or not a string) → **fails**;
 * - a non-array `tags` → a malformed event that can't be scanned at all →
 *   **fails**, without throwing (zod's `safeParse`-never-throws contract, the
 *   same graceful degradation as `nip40.expirationCheck`).
 *
 * Detection is intentionally broader than {@link protectedTag}: any tag whose
 * first element is `"-"` marks the event protected here, even a malformed
 * `["-", "x"]` that `protectedTag()` would reject. Requiring an *exactly* shaped
 * marker to trigger the restriction would let a publisher bypass authorization by
 * appending a junk element, so this fails **closed** on any `"-"`-led tag while
 * a non-array tag element is skipped (it can't be a marker and must not throw).
 *
 * Pubkeys are compared as **exact strings** — a NIP-01 pubkey is canonically a
 * 64-character lowercase hex string, and an authenticated pubkey comes from a
 * verified NIP-42 auth event in that same canonical form, so there is nothing to
 * normalize (unlike `nip42.relayTagCheck`'s relay URLs).
 */
function protectedCheck(
  authenticatedPubkeys: readonly string[] = [],
): core.$ZodCheck<NostrEventLike> {
  // Fail closed on a malformed set from the untyped JS path: a non-array
  // argument (or a non-string element) contributes no authenticated pubkey
  // rather than throwing at composition time — `new Set(42)` would throw before
  // parse, defeating the fail-closed contract. A bad set thus rejects protected
  // events, the opposite of `nip42.createdAtCheck` (which throws because a bad
  // argument there would fail *open*).
  const authenticated = new Set(
    Array.isArray(authenticatedPubkeys)
      ? authenticatedPubkeys.filter((pubkey) => typeof pubkey === "string")
      : [],
  );
  return makeCheck<NostrEventLike>((payload) => {
    const { tags, pubkey } = payload.value;
    if (!Array.isArray(tags)) {
      // A non-array `tags` is a malformed event, not a non-protected one.
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: 'Invalid event (expected "tags" to be an array of tags)',
      });
      return;
    }
    const isProtected = tags.some(
      (tag) => Array.isArray(tag) && tag[0] === PROTECTED_TAG_NAME,
    );
    if (
      isProtected &&
      (typeof pubkey !== "string" || !authenticated.has(pubkey))
    ) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message:
          "Protected event may only be published by an authenticated author",
      });
    }
  });
}

/** NIP-70 protected events (the `["-"]` marker tag schema + opt-in author-authorization check) */
export const nip70 = {
  /** `["-"]` protected marker tag schema (structure only) */
  protectedTag,
  /** Opt-in check: a protected event's author must be an authenticated pubkey */
  protectedCheck,
};
