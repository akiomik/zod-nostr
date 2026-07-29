import type * as core from "zod/v4/core";
import { makeCheck } from "./core/checks.js";
import {
  zodNever,
  zodNumber,
  zodObject,
  zodString,
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
 * `e`/`p` tag conventions. Unknown keys are rejected, the same as `event()`.
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

/** NIP-10 text notes and threads (kind:1 structure; thread tag semantics not modeled) */
export const nip10 = {
  /** Event schema fixed to kind:1 (structure only; see the note on thread tags) */
  textNote,
};
