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
// It takes the three inputs as data and returns what it found, so every rule
// below is pinned by `spec-baseline.test.mjs` without a fixture repository.
// Reading the files, printing, and exiting are `spec-baseline-check.mjs`'s job —
// a split that also means this module has no side effect to guard against on
// import, and the CLI needs no guard to decide whether it was run directly.
import { basename } from "node:path";

export const BASELINE = "spec-baseline.json";
export const README = "README.md";
export const SOURCE = "src";
const TABLE_FAMILY = "nips";
const TABLE_HEADING = "\n## Supported NIPs\n";
const BASELINE_COLUMN = "Spec baseline";
const NIP_COLUMN = "NIP";

const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DELIMITER = /^\|[\s:|-]+\|$/;
const FENCE = /^\s*(```|~~~)/;
const TABLE_ROW = /^\*\*NIP-([0-9A-Z]{2})\*\*$/;
// A document id is the stem of its upstream filename, so it is spelled the way
// the file is: two characters, digits or uppercase (`01`, `7D`). A lowercase
// key would build a permalink to a file that does not exist.
const DOCUMENT = /^[0-9A-Z]{2}$/;

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
 * Identified by shape rather than by position — the first block in the section,
 * outside any fence, that has a delimiter row and a `NIP` column. Taking the
 * first pipe-led block instead would read a legend table, or a fenced example
 * of this very table, as the table and report its rows as malformed NIPs.
 */
function supportedNipsTable(readme) {
  const heading = readme.indexOf(TABLE_HEADING);
  if (heading === -1) return null;
  const next = readme.indexOf("\n## ", heading + 1);
  const lines = readme
    .slice(heading + 1, next === -1 ? undefined : next)
    .split("\n");
  let fenced = false;
  for (const [index, header] of lines.entries()) {
    if (FENCE.test(header)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !header.startsWith("|")) continue;
    if (!DELIMITER.test(lines[index + 1] ?? "")) continue;
    const nip = cellsOf(header).indexOf(NIP_COLUMN);
    if (nip === -1) continue;
    const rows = [];
    let end = index + 2;
    for (; lines[end]?.startsWith("|"); end += 1) rows.push(lines[end]);
    // A blank line or an indented row ends the table for Markdown too, leaving
    // what follows to render as text rather than as rows. Spotting that lets it
    // be reported as itself instead of as every remaining NIP being absent —
    // while a genuine second table, which carries its own delimiter, does not
    // count.
    let after = end;
    while (lines[after]?.trim() === "") after += 1;
    const interrupted =
      lines[after]?.trim().startsWith("|") === true &&
      !DELIMITER.test(lines[after + 1] ?? "");
    return { header, rows, nip, interrupted };
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

  // `sources` says what a family is and `documents` holds its entries, so a
  // family in one and not the other is the same "updated one file and not the
  // other" mistake the rest of this checks for — and would otherwise be skipped
  // in one direction and throw in the other.
  for (const family of Object.keys(baseline.documents))
    if (!(family in baseline.sources))
      problems.push(
        `${BASELINE}: \`documents.${family}\` has no \`sources\` entry`,
      );
  for (const family of Object.keys(baseline.sources))
    if (!(family in baseline.documents))
      problems.push(
        `${BASELINE}: \`sources.${family}\` has no \`documents\` entry`,
      );

  for (const [family, { label, repository }] of Object.entries(
    baseline.sources,
  )) {
    const documents = baseline.documents[family];
    if (!documents) continue; // already reported
    // Reported rather than thrown on: a family added without its label is the
    // same half-finished edit as one added without its entries, and crashing
    // would take the rest of the report with it.
    if (!label)
      problems.push(`${BASELINE}: \`sources.${family}\` has no label`);
    if (!repository)
      problems.push(`${BASELINE}: \`sources.${family}\` has no repository`);
    const modules = label ? moduleIds(label, files) : new Map();

    for (const [id, entry] of Object.entries(documents)) {
      const where = `${BASELINE}: \`${family}.${id}\``;
      if (!DOCUMENT.test(id)) {
        // Cross-checking a misspelled id against modules and the table would
        // bury this under messages naming files and rows that do exist.
        problems.push(`${where} is not a two-character document id`);
        continue;
      }
      if (!COMMIT.test(entry.commit))
        problems.push(`${where} has no 40-character commit`);
      if (!isCalendarDate(entry.date))
        problems.push(`${where} has no YYYY-MM-DD calendar date`);
      if (!SHA256.test(entry.sha256))
        problems.push(`${where} has no 64-character sha256`);

      // Two documents sharing a hash means one was pasted from the other — the
      // likeliest corruption of the field the baseline rests on, and one of the
      // few things about it judgeable without the text.
      if (SHA256.test(entry.sha256)) {
        const pasted = hashes.get(entry.sha256);
        if (pasted)
          problems.push(`${where} and \`${pasted}\` record the same sha256`);
        else hashes.set(entry.sha256, `${family}.${id}`);
      }

      if (!label) continue; // the checks below need one
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

  // Everything below reads the table family by name, so a `sources`/`documents`
  // mismatch involving it is reported above and stops here rather than throwing
  // past the report.
  if (!baseline.sources[TABLE_FAMILY] || !baseline.documents[TABLE_FAMILY])
    return problems;

  const table = supportedNipsTable(readme);
  if (table === null) {
    problems.push(`${README}: no "Supported NIPs" section with a NIP table`);
    return problems;
  }

  // Both columns this reads are located from the header rather than assumed,
  // so either may move; dropping the revision one is reported.
  const column = cellsOf(table.header).indexOf(BASELINE_COLUMN);
  if (column === -1)
    problems.push(
      `${README}: the Supported NIPs table has no \`${BASELINE_COLUMN}\` column`,
    );

  const { repository } = baseline.sources[TABLE_FAMILY];
  const tabled = new Set();
  for (const row of table.rows) {
    const cells = cellsOf(row);
    const nip = cells[table.nip]?.match(TABLE_ROW)?.[1];
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

  if (table.interrupted)
    problems.push(
      `${README}: the Supported NIPs table breaks off before its rows end, so what follows it does not render as part of it`,
    );

  // A misspelled id is reported as such above, and rows lost to a broken-off
  // table just above; asking the table for either would repeat that as a
  // second, misleading message.
  for (const nip of Object.keys(baseline.documents[TABLE_FAMILY]))
    if (!table.interrupted && DOCUMENT.test(nip) && !tabled.has(nip))
      problems.push(
        `${README}: NIP-${nip} is baselined in ${BASELINE} but absent from the Supported NIPs table`,
      );

  return problems;
}
