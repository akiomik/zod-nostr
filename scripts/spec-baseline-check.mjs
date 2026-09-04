// Asserts that `spec-baseline.json` records every specification `src/`
// implements, and that README.md's `Supported NIPs` table quotes what it
// records.
//
// Three files name the same set of specs: the spec modules, the baseline, and
// the table. The table repeats each revision so a reader can click straight
// through to the spec text a schema targets, which makes it a second copy of a
// fact — and nothing else in the repository would notice the copies drifting
// apart. A NIP module added without an entry ships with no recorded provenance;
// an entry bumped without its table cell leaves readers clicking through to
// superseded spec text. Both would otherwise pass CI.
//
// The scope is deliberately narrow, and worth stating because the natural pull
// is to widen it:
//
// - It compares the repository against itself, never upstream. Whether a spec
//   has moved since a baseline was recorded is a different question with a
//   different answer over time, and answering it here would make an unrelated
//   upstream edit fail an innocent pull request.
// - It assumes `spec-baseline.json` is well-formed JSON written by a
//   maintainer. Guarding each way a hand-corrupted file could be malformed
//   costs more code than the case is worth: the build fails either way, and
//   `biome check` already rejects invalid JSON.
// - It checks what a maintainer plausibly gets wrong — updating one file and
//   not the other — not what a maintainer would have to go out of their way to
//   write.
//
// `specBaselineProblems` takes the three inputs as data and returns what it
// found, so every rule below is pinned by `spec-baseline-check.test.mjs`
// without a fixture repository. Reading the files and exiting is the CLI's job.
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE = "spec-baseline.json";
const README = "README.md";
const SOURCE = "src";
const TABLE_FAMILY = "nips";
const TABLE_HEADING = "\n## Supported NIPs\n";
const BASELINE_COLUMN = "Spec baseline";
const NIP_COLUMN = "NIP";

const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DELIMITER = /^\|[\s:|-]+\|$/;
const TABLE_ROW = /^\*\*NIP-([0-9A-Z]{2})\*\*$/;

/**
 * Whether `date` is a real day, not merely digit-shaped. A transposed month
 * (`2026-90-04`) is copied into the README cell by the normal workflow, so the
 * cell comparison agrees with it and nothing else here would notice.
 */
function isCalendarDate(date) {
  if (!DATE.test(date ?? "")) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

/** A Markdown row's cells. An escaped `\|` is content, not a boundary. */
function cellsOf(line) {
  return line.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/**
 * The documents a family implements, as id → path, from `<label><id>.ts`
 * anywhere under `src/`. Matched case-insensitively, since neither the
 * lowercase filename nor the flat layout is enforced by anything.
 */
function moduleIds(label, files) {
  const module = new RegExp(`^${label}([0-9a-z]{2})\\.ts$`, "i");
  const found = new Map();
  for (const file of files) {
    const id = basename(file).match(module)?.[1];
    if (id) found.set(id.toUpperCase(), file);
  }
  return found;
}

/**
 * README's `Supported NIPs` table: its header line and its body rows, or null.
 *
 * Identified by shape rather than by position — the first block in the section
 * that has a delimiter row and a `NIP` column. Taking the first pipe-led block
 * instead would read a fenced example, or a legend table, as the table and
 * report its rows as malformed NIPs.
 */
function supportedNipsTable(readme) {
  const heading = readme.indexOf(TABLE_HEADING);
  if (heading === -1) return null;
  const next = readme.indexOf("\n## ", heading + 1);
  const lines = readme
    .slice(heading + 1, next === -1 ? undefined : next)
    .split("\n");
  for (const [index, header] of lines.entries()) {
    if (!header.startsWith("|")) continue;
    if (!DELIMITER.test(lines[index + 1] ?? "")) continue;
    if (!cellsOf(header).includes(NIP_COLUMN)) continue;
    const rows = [];
    for (let row = index + 2; lines[row]?.startsWith("|"); row += 1)
      rows.push(lines[row]);
    return { header, rows };
  }
  return null;
}

/**
 * Everything the three inputs disagree about, as messages. `files` are the
 * paths under `src/`; `baseline` is the parsed `spec-baseline.json`.
 */
export function specBaselineProblems({ baseline, readme: text, files }) {
  // Normalized so a CRLF checkout fails on a real disagreement, not on newlines.
  const readme = text.replace(/\r\n/g, "\n");
  const problems = [];
  const hashes = new Map();

  for (const [family, { label }] of Object.entries(baseline.sources)) {
    const documents = baseline.documents[family];
    const modules = moduleIds(label, files);

    for (const [id, entry] of Object.entries(documents)) {
      const where = `${BASELINE}: \`${family}.${id}\``;
      if (!COMMIT.test(entry.commit))
        problems.push(`${where} has no 40-character commit`);
      if (!isCalendarDate(entry.date))
        problems.push(`${where} has no YYYY-MM-DD calendar date`);
      if (!SHA256.test(entry.sha256))
        problems.push(`${where} has no 64-character sha256`);

      // Two documents sharing a hash means one was pasted from the other — the
      // likeliest corruption of the field the baseline rests on, and one of the
      // few things about it judgeable without the text.
      const pasted = hashes.get(entry.sha256);
      if (pasted)
        problems.push(`${where} and \`${pasted}\` record the same sha256`);
      else hashes.set(entry.sha256, `${family}.${id}`);

      if (!modules.has(id))
        problems.push(
          `${where} has no \`${SOURCE}/${label.toLowerCase()}${id.toLowerCase()}.ts\``,
        );
      // A family with no table row is held to the weaker thing the README can
      // carry: that it names the document at all.
      if (family !== TABLE_FAMILY && !readme.includes(`${label}-${id}`))
        problems.push(`${README}: never mentions ${label}-${id}`);
    }

    // `src/` is the authority: a spec module with no entry has no provenance.
    for (const [id, file] of modules)
      if (!(id in documents))
        problems.push(
          `${BASELINE}: \`${SOURCE}/${file}\` has no \`${family}.${id}\` entry`,
        );
  }

  const table = supportedNipsTable(readme);
  if (table === null) {
    problems.push(`${README}: no "Supported NIPs" section with a NIP table`);
    return problems;
  }

  // Which column carries the revision is read from the header rather than
  // assumed, so moving it is fine and dropping it is reported.
  const column = cellsOf(table.header).indexOf(BASELINE_COLUMN);
  if (column === -1)
    problems.push(
      `${README}: the Supported NIPs table has no \`${BASELINE_COLUMN}\` column`,
    );

  const { repository } = baseline.sources[TABLE_FAMILY];
  const tabled = new Set();
  for (const row of table.rows) {
    const cells = cellsOf(row);
    const nip = cells[1]?.match(TABLE_ROW)?.[1];
    if (!nip) {
      problems.push(`${README}: cannot read a NIP number from row: ${row}`);
      continue;
    }
    tabled.add(nip);
    const entry = baseline.documents[TABLE_FAMILY][nip];
    if (!entry) {
      problems.push(`${README}: NIP-${nip} has no entry in ${BASELINE}`);
      continue;
    }
    if (column === -1) continue; // already reported
    const expected = `[${entry.date}](${repository}/blob/${entry.commit}/${nip}.md)`;
    if (cells[column] !== expected)
      problems.push(
        `${README}: NIP-${nip}'s spec baseline cell disagrees with ${BASELINE}:\n` +
          `    ${README}: ${cells[column]}\n` +
          `    expected: ${expected}`,
      );
  }

  for (const nip of Object.keys(baseline.documents[TABLE_FAMILY]))
    if (!tabled.has(nip))
      problems.push(
        `${README}: NIP-${nip} is baselined in ${BASELINE} but absent from the Supported NIPs table`,
      );

  return problems;
}

function main() {
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
      `\nEvery spec module under ${SOURCE}/ must be baselined in ${BASELINE}, and ${README} must quote what it records.`,
    );
    process.exit(1);
  }

  const counts = Object.keys(baseline.sources)
    .map(
      (family) => `${Object.keys(baseline.documents[family]).length} ${family}`,
    )
    .join(", ");
  console.log(
    `Spec baseline check passed — ${counts} baselined from ${SOURCE}/; ` +
      `${Object.keys(baseline.documents[TABLE_FAMILY]).length} NIPs cross-checked against ${README}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
