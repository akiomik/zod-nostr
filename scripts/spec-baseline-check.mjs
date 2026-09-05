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

// Read here rather than inside the rules, and reported rather than thrown on:
// a `spec-baseline.json` that was renamed or deleted is itself the "edited one
// file and not the other" mistake this check exists to catch, and it deserves
// the same report as everything else it catches. Only the reads are caught: a
// rule that throws is a bug in the rules, and reporting it as a file that could
// not be read would send the reader to check paths and permissions.
let input = null;
let unread = null;
try {
  input = {
    baseline: JSON.parse(readFileSync(join(root, BASELINE), "utf8")),
    files: readdirSync(join(root, SOURCE), { recursive: true }),
  };
} catch (cause) {
  // Not `cause.message`: what a `throw` carries is not always an Error.
  unread = `could not read ${BASELINE} and ${SOURCE}/: ${cause?.message ?? cause}`;
}

const problems = unread ? [unread] : specBaselineProblems(input);

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
  console.log(specBaselineSummary(input));
}
