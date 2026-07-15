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

export function zodBoolean(): core.$ZodBoolean<boolean> {
  const def = { type: "boolean", coerce: false };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodBoolean(def as any) as core.$ZodBoolean<boolean>;
}

/** zod core's own URL format check (accepts any scheme, not just http/https) */
export function zodUrl(): core.$ZodURL {
  const def = { type: "string", format: "url", check: "string_format" };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodURL(def as any) as core.$ZodURL;
}

export function zodLiteral<T extends core.util.Literal>(
  value: T,
): core.$ZodLiteral<T> {
  const def = { type: "literal", values: [value] };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodLiteral(def as any) as core.$ZodLiteral<T>;
}

export function zodArray<T extends core.SomeType>(
  element: T,
): core.$ZodArray<T> {
  const def = { type: "array", element };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodArray(def as any) as unknown as core.$ZodArray<T>;
}

export function zodTuple<T extends core.SomeType[]>(
  items: [...T],
  rest: core.SomeType | null = null,
): core.$ZodTuple<T> {
  const def = { type: "tuple", items, rest };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodTuple(def as any) as unknown as core.$ZodTuple<T>;
}

export function zodUnion<T extends core.SomeType[]>(
  options: [...T],
): core.$ZodUnion<T> {
  const def = { type: "union", options };
  // biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
  return new core.$ZodUnion(def as any) as unknown as core.$ZodUnion<T>;
}

export function zodObject<Shape extends core.$ZodShape>(
  shape: Shape,
  options: {
    catchall?: core.SomeType;
    checks?: core.$ZodCheck<Record<string, unknown>>[];
  } = {},
): core.$ZodObject<Shape> {
  const def = { type: "object", shape, ...options };
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
