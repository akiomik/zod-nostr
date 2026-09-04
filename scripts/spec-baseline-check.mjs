// Runs the spec-baseline check over this repository and reports what it found.
// The rules live in `spec-baseline.mjs`, which decides everything as a function
// of the three inputs read here.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASELINE,
  README,
  SOURCE,
  specBaselineProblems,
  specBaselineSummary,
} from "./spec-baseline.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(readFileSync(join(root, BASELINE), "utf8"));
const readme = readFileSync(join(root, README), "utf8");
const files = readdirSync(join(root, SOURCE), { recursive: true });
const problems = specBaselineProblems({ baseline, readme, files });

if (problems.length > 0) {
  console.error(
    `Spec baseline check failed (${problems.length} problem(s)):\n`,
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    `\nEvery spec module under ${SOURCE}/ must be baselined in ${BASELINE}; ${README}'s table must quote what it records, and its prose must name each document outside that table.`,
  );
  process.exit(1);
}

console.log(specBaselineSummary({ baseline }));
