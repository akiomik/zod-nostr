// Asserts that `spec-baseline.json` is well formed and that README.md agrees
// with it.
//
// The README repeats each NIP's commit and date so a reader can click straight
// through to the spec text a schema targets, which means the same fact lives in
// two files. Nothing else in the repository would notice the two drifting
// apart: a maintainer who bumps a baseline entry and misses the matching README
// cell leaves readers clicking through to superseded spec text while CI stays
// green. This check makes that a build failure instead.
//
// A NIP is cross-checked cell by cell, since the table quotes its whole
// revision. A document from any other family (LUD-06, LUD-16) has no row to
// quote, so the check asserts the weaker thing the README can actually carry:
// that the family's repository and every one of its documents are named
// somewhere in the prose. That catches a document added to or removed from the
// baseline without a word in the README, but not a stale one — for those, the
// JSON is the only source.
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
const TABLE_FAMILY = "nips";

const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Document ids are two characters, digits or uppercase letters: upstream
// already numbers some NIPs in hex (`7D`, `C0`).
const DOCUMENT = /^[0-9A-Z]{2}$/;
const TABLE_ROW = /^\*\*NIP-([0-9A-Z]{2})\*\*$/;

/** The rows of README's `Supported NIPs` table, as raw Markdown lines. */
function supportedNipsRows(readme) {
  const heading = readme.indexOf("\n## Supported NIPs\n");
  if (heading === -1) throw new Error(`${README}: no "Supported NIPs" section`);
  // A section that runs to the end of the file has no following heading; slicing
  // to `-1` would silently swallow the rest of the README instead.
  const next = readme.indexOf("\n## ", heading + 1);
  const section = readme.slice(heading, next === -1 ? undefined : next);
  return section.split("\n").filter((line) => line.startsWith("| **NIP-"));
}

const baseline = JSON.parse(readFileSync(join(root, BASELINE), "utf8"));
const readme = readFileSync(join(root, README), "utf8");
const errors = [];

const sources = baseline.sources ?? {};
const families = Object.keys(sources);
if (families.length === 0) errors.push(`${BASELINE}: no \`sources\` recorded`);

for (const family of families) {
  const { label, repository } = sources[family] ?? {};
  if (!label) errors.push(`${BASELINE}: \`sources.${family}\` has no label`);
  if (!repository)
    errors.push(`${BASELINE}: \`sources.${family}\` has no repository`);
  else if (!readme.includes(repository))
    errors.push(`${README}: does not link ${repository} (\`${family}\`)`);

  const documents = baseline[family];
  if (!documents) {
    errors.push(`${BASELINE}: \`sources.${family}\` has no matching entries`);
    continue;
  }
  for (const [id, entry] of Object.entries(documents)) {
    const where = `${BASELINE}: \`${family}.${id}\``;
    if (!DOCUMENT.test(id)) errors.push(`${where} is not a two-character id`);
    if (!COMMIT.test(entry?.commit ?? ""))
      errors.push(`${where} has no 40-character commit`);
    if (!DATE.test(entry?.date ?? ""))
      errors.push(`${where} has no YYYY-MM-DD date`);
    if (!SHA256.test(entry?.sha256 ?? ""))
      errors.push(`${where} has no 64-character sha256`);
    // The NIPs are cross-checked row by row below; the rest have no row, so
    // require at least that the README names them.
    if (family !== TABLE_FAMILY && label && !readme.includes(`${label}-${id}`))
      errors.push(`${README}: never mentions ${label}-${id}`);
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
const repository = sources[TABLE_FAMILY]?.repository;
for (const row of supportedNipsRows(readme)) {
  const cells = row.split("|").map((cell) => cell.trim());
  const nip = cells[1]?.match(TABLE_ROW)?.[1];
  if (!nip) {
    errors.push(`${README}: cannot read a NIP number from row: ${row}`);
    continue;
  }
  tabled.add(nip);
  const entry = baseline[TABLE_FAMILY]?.[nip];
  if (!entry) {
    errors.push(`${README}: NIP-${nip} has no entry in ${BASELINE}`);
    continue;
  }
  if (!repository) continue; // already reported; nothing to compare against
  const expected = `[${entry.date}](${repository}/blob/${entry.commit}/${nip}.md)`;
  if (cells[2] !== expected)
    errors.push(
      `${README}: NIP-${nip}'s spec baseline cell disagrees with ${BASELINE}:\n` +
        `    ${README}: ${cells[2]}\n` +
        `    expected: ${expected}`,
    );
}

for (const nip of Object.keys(baseline[TABLE_FAMILY] ?? {})) {
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
