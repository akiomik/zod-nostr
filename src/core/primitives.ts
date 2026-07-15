import * as core from "zod/v4/core";

/**
 * `new core.$ZodX(def)` goes through `$constructor`, which doesn't propagate
 * the def's type arguments to the return type. Cast through `any` in one place here.
 */

export function zodString(
  checks: core.$ZodCheck<string>[] = [],
): core.$ZodString<string> {
  const def = { type: "string", coerce: false, checks };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodString(def as any) as core.$ZodString<string>;
}

export function zodNumber(
  checks: core.$ZodCheck<number>[] = [],
): core.$ZodNumber<number> {
  const def = { type: "number", coerce: false, checks };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodNumber(def as any) as core.$ZodNumber<number>;
}

export function zodArray<T extends core.SomeType>(
  element: T,
): core.$ZodArray<T> {
  const def = { type: "array", element };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodArray(def as any) as unknown as core.$ZodArray<T>;
}

export function zodObject<Shape extends core.$ZodShape>(
  shape: Shape,
): core.$ZodObject<Shape> {
  const def = { type: "object", shape };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodObject(def as any) as core.$ZodObject<Shape>;
}

export function zodUnknown<T>(
  checks: core.$ZodCheck<T>[] = [],
): core.$ZodType<T, T> {
  const def = { type: "unknown", checks };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodUnknown(def as any) as unknown as core.$ZodType<T, T>;
}

export function zodOptional<T extends core.SomeType>(
  innerType: T,
): core.$ZodOptional<T> {
  const def = { type: "optional", innerType };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodOptional(def as any) as unknown as core.$ZodOptional<T>;
}
