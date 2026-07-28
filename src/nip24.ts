import type * as core from "zod/v4/core";
import {
  zodBoolean,
  zodNumber,
  zodObject,
  zodOptional,
  zodString,
  zodUrl,
} from "./core/primitives.js";

// NIP-24 "Extra metadata fields" for kind:0 profile content. These augment the
// NIP-01 `name`/`about`/`picture` set; each schema here is strict and
// non-optional so callers can compose their own optional/catch/default policy.

export function displayName(): core.$ZodString<string> {
  return zodString();
}

export function website(): core.$ZodURL {
  return zodUrl();
}

export function banner(): core.$ZodURL {
  return zodUrl();
}

export function bot(): core.$ZodBoolean<boolean> {
  return zodBoolean();
}

/** NIP-24 birthday object (year/month/day, each optional) */
export function birthday() {
  return zodObject({
    year: zodOptional(zodNumber()),
    month: zodOptional(zodNumber()),
    day: zodOptional(zodNumber()),
  });
}
