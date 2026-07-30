import type * as core from "zod/v4/core";
import {
  makeCheck,
  type NostrEventLike,
  nonEmptyStringCheck,
} from "./core/checks.js";
import {
  zodLiteral,
  zodNever,
  zodNumber,
  zodObject,
  zodOptional,
  zodString,
  zodTuple,
  zodUnion,
} from "./core/primitives.js";
import { eventId, pubkey, signature, tags, timestamp } from "./nip01.js";

/** NIP-10 defines kind 1 as a plaintext text note. */
const TEXT_NOTE_KIND = 1;

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
 * NIP-10 kind:1 text note. This is the NIP-01 event shape constrained to
 * `kind === 1` (the only difference from `event()`), whose definition as a
 * plaintext note belongs to NIP-10. It validates the minimum **structural**
 * form only — like `event()` it does not verify the signature (compose
 * `.check(signatureCheck())`), and it does not validate NIP-10's reply/thread
 * `e`/`p` tag conventions (compose `.check(threadCheck())` /
 * `.check(participantsCheck(...))` for those). Unknown keys are rejected, the
 * same as `event()`.
 */
function textNote() {
  return zodObject(
    {
      id: eventId(),
      pubkey: pubkey(),
      created_at: timestamp(),
      kind: zodNumber([kindLiteralCheck(TEXT_NOTE_KIND)]),
      tags: tags(),
      content: zodString(),
      sig: signature(),
    },
    { catchall: zodNever() },
  );
}

/**
 * The markers a marked `e` tag may carry, in reply-stack order: `"root"` (the
 * thread's originating event) and `"reply"` (the direct parent). Single source
 * of truth shared by {@link eTag}'s schema and {@link threadCheck}, so the two
 * can never disagree on which markers are valid.
 */
const E_TAG_MARKERS = ["root", "reply"] as const;

/** Membership form of {@link E_TAG_MARKERS} for {@link threadCheck}. */
const E_TAG_MARKER_SET: ReadonlySet<string> = new Set(E_TAG_MARKERS);

/**
 * The value of a marked `e` tag's marker slot: a real marker
 * ({@link E_TAG_MARKERS}) or `""`. The empty string is a positional
 * placeholder meaning "no marker" — the marked scheme's fields are positional,
 * so it lets a later `<pubkey>` be present on an *unmarked* reference, which is
 * how the scheme cites an event ("mention"s it) without implying it is the
 * root or the direct parent. Absent (a shorter tag) means the same thing.
 */
function marker() {
  return zodUnion([zodLiteral(""), ...E_TAG_MARKERS.map((m) => zodLiteral(m))]);
}

/**
 * NIP-10 marked `e` tag (the PREFERRED reply/thread scheme):
 * `["e", <event-id>, <relay-url>, <marker>?, <pubkey>?]`.
 *
 * - `<event-id>` is a 64-char lowercase hex event id.
 * - `<relay-url>` is a recommended relay for the reference. Its **position is
 *   required** but the value may be `""` — NIP-10 says clients "may instead
 *   leave it as `\"\"`", i.e. present-but-empty, never absent. It is a plain
 *   string, not a validated URL: `""` is allowed and relay hints are often
 *   loosely formatted, while a valid URL is only a SHOULD.
 * - `<marker>` (optional) is `"root"`, `"reply"`, or `""` — see {@link marker}.
 *   `""` (or a shorter tag) is an *unmarked* reference: since the fields are
 *   positional, `["e", id, relay, "", pubkey]` is how the scheme attaches a
 *   `<pubkey>` to a plain mention (neither root nor direct parent).
 * - `<pubkey>` (optional) is the 64-char hex pubkey of the referenced event's
 *   author.
 *
 * This models the marked format verbatim, so the deprecated **positional**
 * scheme (bare `["e", <id>]` / `["e", <id>, <relay>]` whose meaning comes from
 * position) is intentionally out of scope — a 2-element tag fails here because
 * the marked format always carries the relay position. No trailing elements
 * beyond `<pubkey>` are allowed.
 */
function eTag() {
  return zodTuple([
    zodLiteral("e"),
    eventId(),
    zodString(),
    zodOptional(marker()),
    zodOptional(pubkey()),
  ]);
}

/**
 * NIP-10 `q` tag, used when citing an event in `.content` via NIP-21:
 * `["q", <event-id> or <event-address>, <relay-url>, <pubkey-if-a-regular-event>?]`.
 *
 * - The first value is the cited event's id **or** a NIP-01 addressable
 *   coordinate (`<kind>:<pubkey>:<d>`). The two are not structurally
 *   distinguished here — it is validated only as a non-empty string, because a
 *   precise "id or address" union would need an address-coordinate schema that
 *   NIP-10 does not itself define (it belongs to NIP-01's `a` coordinate).
 * - `<relay-url>` position is required but may be `""`, same as {@link eTag}.
 * - `<pubkey>` (optional) is present only when citing a regular (non-
 *   addressable) event; a 64-char hex pubkey.
 */
function qTag() {
  return zodTuple([
    zodLiteral("q"),
    zodString([nonEmptyStringCheck("q tag reference")]),
    zodString(),
    zodOptional(pubkey()),
  ]);
}

/**
 * Opt-in check: the event's marked `e` tags follow NIP-10's reply/thread
 * conventions. For each `e` tag carrying a marker (4th element), the marker
 * must be `"root"` or `"reply"` — the legacy `"mention"` marker and any unknown
 * value are rejected — and the event may carry **at most one** `"root"` and at
 * most one `"reply"` (a thread has a single root and a single direct parent).
 *
 * `e` tags with no marker (the deprecated positional scheme, or a
 * present-but-empty `""` marker) are left untouched — this check only governs
 * the marked scheme. Compose on `textNote()`:
 * `textNote().check(threadCheck())`.
 */
function threadCheck(): core.$ZodCheck<NostrEventLike> {
  return makeCheck<NostrEventLike>((payload) => {
    let rootCount = 0;
    let replyCount = 0;
    for (const tag of payload.value.tags) {
      if (tag[0] !== "e") continue;
      const value = tag[3];
      // Unmarked (positional scheme) or present-but-empty: not our concern.
      if (value === undefined || value === "") continue;
      if (!E_TAG_MARKER_SET.has(value)) {
        payload.issues.push({
          code: "custom",
          input: payload.value,
          message: `Invalid "e" tag marker (expected "root" or "reply"): ${value}`,
        });
        continue;
      }
      if (value === "root") rootCount++;
      else replyCount++;
    }
    if (rootCount > 1) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message:
          'Invalid thread (at most one "root"-marked "e" tag is allowed)',
      });
    }
    if (replyCount > 1) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message:
          'Invalid thread (at most one "reply"-marked "e" tag is allowed)',
      });
    }
  });
}

/**
 * Opt-in check: the event's `p` tags include every expected participant pubkey.
 * NIP-10 says a reply to event E should carry all of E's `p` tags plus E's
 * author (and the authors of any `e`/`q` referenced events) as `p` tags, so
 * everyone in the conversation is notified. The expected set is context the
 * schema can't know — it comes from the events being replied to/quoted — so it
 * is a parameter, the same as `nip42.relayTagCheck(relayUrl)`.
 *
 * Only presence is checked (`p` tags ⊇ `expected`), not order or the absence
 * of extra participants: NIP-10 states the reply's `p` tags may be "in no
 * particular order" and lists the required members as a minimum. Compose on
 * `textNote()`: `textNote().check(participantsCheck([author, ...eTagPubkeys]))`.
 */
function participantsCheck(
  expected: readonly string[],
): core.$ZodCheck<NostrEventLike> {
  const required = new Set(expected);
  return makeCheck<NostrEventLike>((payload) => {
    const present = new Set<string>();
    for (const tag of payload.value.tags) {
      if (tag[0] === "p" && tag[1] !== undefined) {
        present.add(tag[1]);
      }
    }
    const missing = [...required].filter((pk) => !present.has(pk));
    if (missing.length > 0) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: `Invalid participants (the "p" tags must include: ${missing.join(", ")})`,
      });
    }
  });
}

/** NIP-10 text notes and threads (kind:1 event, reply/quote tags, opt-in thread checks) */
export const nip10 = {
  /** Event schema fixed to kind:1 (structure only; thread tag conventions are opt-in checks) */
  textNote,
  /** Marked `e` tag (PREFERRED reply/thread scheme): `["e", id, relay, marker?, pubkey?]` */
  eTag,
  /** `q` tag for citing an event via NIP-21: `["q", id-or-address, relay, pubkey?]` */
  qTag,
  /** Opt-in check: marked `e` tags use only `root`/`reply`, at most one of each */
  threadCheck,
  /** Opt-in check: the `p` tags include every expected participant pubkey */
  participantsCheck,
};
