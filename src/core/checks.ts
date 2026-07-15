import * as core from "zod/v4/core";

/**
 * Builds a plain check that depends only on `zod/v4/core`, so it can be
 * passed to `.check()` on either classic zod or zod/mini.
 * This mirrors zod's own `check()` helper (just attaches fn to a core.$ZodCheck).
 */
export function makeCheck<T>(
  fn: core.CheckFn<T>,
  def: Partial<core.$ZodCheckDef> = {},
): core.$ZodCheck<T> {
  const ch = new core.$ZodCheck({ check: "custom", ...def });
  ch._zod.check = fn;
  return ch;
}

export interface NostrEventLike {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Check factory for event signature verification. Takes verifyEvent as a
 * parameter to keep the core layer decoupled from nostr-tools (also helps testability).
 */
export function signatureCheck(
  verifyEvent: (event: NostrEventLike) => boolean,
): core.$ZodCheck<NostrEventLike> {
  return makeCheck<NostrEventLike>((payload) => {
    if (!verifyEvent(payload.value)) {
      payload.issues.push({
        code: "custom",
        input: payload.value,
        message: "Invalid Nostr event signature",
      });
    }
  });
}
