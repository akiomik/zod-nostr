// Runs the spec-baseline check over this repository and reports what it found.
// The rules live in `spec-baseline.mjs`, which decides everything as a function
// of the two inputs read here.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASELINE,
  SOURCE,
  specBaselineProblems,
  specBaselineSummary,
} from "./spec-baseline.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(readFileSync(join(root, BASELINE), "utf8"));
const files = readdirSync(join(root, SOURCE), { recursive: true });
const problems = specBaselineProblems({ baseline, files });

if (problems.length > 0) {
  console.error(
    `Spec baseline check failed (${problems.length} problem(s)):\n`,
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    `\nEvery spec module under ${SOURCE}/ must be baselined in ${BASELINE}, and every entry must name a module.`,
  );
  // Set, not `process.exit(1)`: writes to a pipe — which stderr is under CI —
  // are asynchronous, and exiting does not wait for them. A gate that exits
  // having printed nothing is the one outcome this must not produce.
  process.exitCode = 1;
} else {
  console.log(specBaselineSummary({ baseline }));
}
