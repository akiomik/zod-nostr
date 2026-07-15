import type * as core from "zod/v4/core";
import { makeCheck } from "./checks.js";
import { zodString } from "./primitives.js";

export function hexStringSchema(length: number): core.$ZodString<string> {
	const re = new RegExp(`^[0-9a-f]{${length}}$`);
	return zodString([
		makeCheck<string>((payload) => {
			if (!re.test(payload.value)) {
				payload.issues.push({
					code: "invalid_format",
					format: "regex",
					input: payload.value,
					message: `Invalid hex string (expected ${length}-char lowercase hex)`,
				});
			}
		}),
	]);
}
