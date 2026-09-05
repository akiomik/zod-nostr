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
// the same report as everything else it catches. Each read is caught on its
// own, so the report names the file that failed rather than both of them.
const unread = [];
let text = null;
let files = null;
try {
  text = readFileSync(join(root, BASELINE), "utf8");
} catch (cause) {
  // Not `cause.message`: what a `throw` carries is not always an Error.
  unread.push(`could not read ${BASELINE}: ${cause?.message ?? cause}`);
}
try {
  files = readdirSync(join(root, SOURCE), { recursive: true });
} catch (cause) {
  unread.push(`could not read ${SOURCE}/: ${cause?.message ?? cause}`);
}

// Parsed and checked outside those catches. A baseline that is not JSON is not
// a file that could not be read, and neither is a rule that throws: reporting
// either as one would send the reader to check paths and permissions. Both are
// left to fail as themselves, as `spec-baseline.mjs` says they are.
// Branched on `unread` and not on `baseline`, which a file holding `null` makes
// falsy: the rules have a message for that, and the summary would throw on it.
const baseline = unread.length > 0 ? null : JSON.parse(text);
const problems =
  unread.length > 0 ? unread : specBaselineProblems({ baseline, files });

if (problems.length > 0) {
  console.error(
    `Spec baseline check failed (${problems.length} problem(s)):\n`,
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  // Two closings, because on the unread path no comparison ran: describing one
  // that did not happen is the same overstatement in the report that this line
  // was widened to remove from it.
  console.error(
    unread.length > 0
      ? `\nWithout ${BASELINE} and ${SOURCE}/ both readable, there is nothing to compare.`
      : `\n${BASELINE} and the spec modules under ${SOURCE}/ must agree about what is baselined, family by family, for the families ${BASELINE} declares.`,
  );
  // Set, not `process.exit(1)`: writes to a pipe — which stderr is under CI —
  // are asynchronous, and exiting does not wait for them. A report this size
  // fits a pipe's buffer, so nothing is lost today; against a reader that does
  // not drain at once, `process.exit(1)` delivers a fraction of what it wrote.
  process.exitCode = 1;
} else {
  console.log(specBaselineSummary({ baseline }));
}
