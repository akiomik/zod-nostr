import * as core from "zod/v4/core";

/**
 * Builds a codec that depends only on `zod/v4/core`, usable from either
 * classic zod or zod/mini. This mirrors zod's own `codec()` helper
 * (just constructs a core.$ZodCodec directly).
 */
export function makeCodec<
	const A extends core.SomeType,
	B extends core.SomeType,
>(
	inSchema: A,
	outSchema: B,
	params: {
		decode: (
			value: core.output<A>,
			payload: core.ParsePayload<core.output<A>>,
		) => core.input<B>;
		encode: (
			value: core.input<B>,
			payload: core.ParsePayload<core.input<B>>,
		) => core.output<A>;
	},
): core.$ZodCodec<A, B> {
	// `new` via $constructor doesn't preserve the def's type arguments, so
	// assert the result against the public signature's A/B explicitly
	// (same treatment as zod's own classic `codec()` implementation).
	const def = {
		type: "pipe",
		in: inSchema,
		out: outSchema,
		transform: params.decode,
		reverseTransform: params.encode,
	};
	// biome-ignore lint/suspicious/noExplicitAny: $constructor doesn't accept a typed def; the return type is asserted explicitly below.
	return new core.$ZodCodec(def as any) as unknown as core.$ZodCodec<A, B>;
}
