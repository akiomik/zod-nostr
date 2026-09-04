// Asserts that `spec-baseline.json` is well formed and that README.md's
// `Supported NIPs` table agrees with it.
//
// The README repeats each NIP's commit and date so a reader can click straight
// through to the spec text a schema targets, which means the same fact lives in
// two files. Nothing else in the repository would notice the two drifting
// apart: a maintainer who bumps a baseline entry and misses the matching README
// cell leaves readers clicking through to superseded spec text while CI stays
// green. This check makes that a build failure instead.
//
// Deliberately offline. Whether the upstream text has moved since a baseline
// was recorded is a different question with a different answer over time; this
// check only asserts that the repository agrees with itself, so it can run in
// the same CI step as the rest of the suite without a network dependency.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = "spec-baseline.json";
const README = "README.md";

const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENT = /^\d{2}$/;

/** The rows of README's `Supported NIPs` table, as raw Markdown lines. */
function supportedNipsRows(readme) {
  const heading = readme.indexOf("\n## Supported NIPs\n");
  if (heading === -1) throw new Error(`${README}: no "Supported NIPs" section`);
  const section = readme.slice(heading, readme.indexOf("\n## ", heading + 1));
  return section.split("\n").filter((line) => line.startsWith("| **NIP-"));
}

const baseline = JSON.parse(readFileSync(join(root, BASELINE), "utf8"));
const readme = readFileSync(join(root, README), "utf8");
const errors = [];

const families = Object.keys(baseline.sources ?? {});
if (families.length === 0) errors.push(`${BASELINE}: no \`sources\` recorded`);

for (const family of families) {
  const documents = baseline[family];
  if (!documents) {
    errors.push(`${BASELINE}: \`sources.${family}\` has no matching entries`);
    continue;
  }
  for (const [id, entry] of Object.entries(documents)) {
    const where = `${BASELINE}: \`${family}.${id}\``;
    if (!DOCUMENT.test(id)) errors.push(`${where} is not a two-digit id`);
    if (!COMMIT.test(entry.commit ?? ""))
      errors.push(`${where} has no 40-character commit`);
    if (!DATE.test(entry.date ?? ""))
      errors.push(`${where} has no YYYY-MM-DD date`);
    if (!SHA256.test(entry.sha256 ?? ""))
      errors.push(`${where} has no 64-character sha256`);
  }
}

for (const family of Object.keys(baseline)) {
  if (["note", "sources"].includes(family)) continue;
  if (!families.includes(family))
    errors.push(`${BASELINE}: \`${family}\` has no entry in \`sources\``);
}

// Every table row must name a baselined NIP and quote its recorded revision,
// and every baselined NIP must appear in the table — a NIP added to one file
// and forgotten in the other is the failure this check exists for.
const tabled = new Set();
for (const row of supportedNipsRows(readme)) {
  const cells = row.split("|").map((cell) => cell.trim());
  const nip = cells[1]?.match(/^\*\*NIP-(\d\d)\*\*$/)?.[1];
  if (!nip) {
    errors.push(`${README}: cannot read a NIP number from row: ${row}`);
    continue;
  }
  tabled.add(nip);
  const entry = baseline.nips?.[nip];
  if (!entry) {
    errors.push(`${README}: NIP-${nip} has no entry in ${BASELINE}`);
    continue;
  }
  const expected = `[${entry.date}](${baseline.sources.nips}/blob/${entry.commit}/${nip}.md)`;
  if (cells[2] !== expected)
    errors.push(
      `${README}: NIP-${nip}'s spec baseline cell disagrees with ${BASELINE}:\n` +
        `    ${README}: ${cells[2]}\n` +
        `    expected: ${expected}`,
    );
}

for (const nip of Object.keys(baseline.nips ?? {})) {
  if (!tabled.has(nip))
    errors.push(
      `${README}: NIP-${nip} is baselined in ${BASELINE} but absent from the Supported NIPs table`,
    );
}

if (errors.length > 0) {
  console.error(`Spec baseline check failed (${errors.length} problem(s)):\n`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    `\n${README}'s Supported NIPs table must quote the revision ${BASELINE} records for every NIP.`,
  );
  process.exit(1);
}

const counts = families
  .map((family) => `${Object.keys(baseline[family]).length} ${family}`)
  .join(", ");
console.log(
  `Spec baseline check passed — ${counts}; ${tabled.size} NIPs cross-checked against ${README}.`,
);
