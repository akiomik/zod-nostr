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
// - It reads a table written with outer pipes, as this README's is. GFM allows
//   them to be left off; a table without them is reported as no table, loudly
//   rather than silently, and writing one is a choice nobody here has made.
// - The modules it reads are those of a family `sources` registers. A module
//   of a family nobody registered is invisible: no filename rule separates a
//   `bolt11.ts` worth baselining from a `bech32.ts` that is an ordinary
//   helper, so 0004 leaves registering a family to the person adding it.
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
const TABLE_HEADING = "## Supported NIPs";
const BASELINE_COLUMN = "Spec baseline";
const NIP_COLUMN = "NIP";

const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Markdown allows a block up to three leading spaces, and ignores what trails
// it. A fourth space makes the line something else, and inside a table that
// means the table stopped.
const ROW = /^ {0,3}\|/;
// A delimiter row carries at least one dash. Without that, `|  |  |  |` — a
// row of empty cells, which Markdown renders as an ordinary row — reads as the
// start of a table of its own and stops the scan mid-table.
const DELIMITER = /^ {0,3}\|[\s:|-]*-[\s:|-]*\|\s*$/;
const FENCE = /^\s*(```|~~~)/;
// What ends the section: an ATX heading of the same or higher level, or the
// underline of a setext one. A `### ` subsection belongs to the section; a
// thematic break does not underline anything, so it needs a line above it.
const HEADING = /^ {0,3}#{1,2} /;
const UNDERLINE = /^ {0,3}(=+|-+)\s*$/;
const TABLE_ROW = /^\*\*NIP-([0-9A-Z]{2})\*\*$/;
// A document id is the stem of its upstream filename, so it is spelled the way
// the file is: two characters, digits or uppercase (`01`, `7D`). A lowercase
// key would build a permalink to a file that does not exist.
const DOCUMENT = /^[0-9A-Z]{2}$/;
// A label names a document series and is interpolated into the pattern that
// finds its modules, so it is held to letters: `LUD(` would reach `RegExp` as
// syntax, and `L.D` would quietly match modules of another family.
const LABEL = /^[A-Za-z]+$/;

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

/** Whether `value` is something to read keys off, rather than to throw on. */
function holds(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
 * The lines of the `Supported NIPs` section, or null. Both ends are found
 * outside fences: a fenced sample of this heading before the real one would
 * otherwise anchor the section on the sample, and one after it would cut the
 * section short — either way reporting a table that is right there as missing.
 */
function sectionLines(readme) {
  const all = readme.split("\n");
  const lines = [];
  let fenced = false;
  let found = false;
  for (const line of all) {
    if (FENCE.test(line)) {
      fenced = !fenced;
    } else if (!fenced) {
      if (!found) {
        found = line.trim() === TABLE_HEADING;
        if (found) lines.push(line);
        continue;
      }
      if (HEADING.test(line)) break;
      // A row is not a heading's content, so dashes under one are a thematic
      // break, not an underline — taking them for one would delete the row.
      const above = lines.at(-1) ?? "";
      if (UNDERLINE.test(line) && above.trim() !== "" && !ROW.test(above)) {
        lines.pop(); // the line it underlines is that heading, not our content
        break;
      }
    }
    if (found) lines.push(line);
  }
  return found ? lines : null;
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
  const lines = sectionLines(readme);
  if (lines === null) return null;
  let fenced = false;
  for (const [index, header] of lines.entries()) {
    if (FENCE.test(header)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !ROW.test(header)) continue;
    if (!DELIMITER.test(lines[index + 1] ?? "")) continue;
    const cells = cellsOf(header);
    const nip = cells.indexOf(NIP_COLUMN);
    // Either column marks this as the table rather than a legend beside it.
    // Recognizing it on one of them lets the other be reported as renamed,
    // instead of the table being reported as missing.
    if (nip === -1 && !cells.includes(BASELINE_COLUMN)) continue;

    // A blank line, or an indent Markdown reads as something other than a row,
    // ends the table where it renders — so it is worth reporting on its own.
    // The rows past it are still collected, because they still say which NIPs
    // the README names, and a NIP missing from all of them is a separate
    // problem that should not wait for the break to be fixed. A genuine second
    // table below carries its own delimiter and ends the scan instead.
    const rows = [];
    let interrupted = false;
    for (let line = index + 2; line < lines.length; line += 1) {
      const text = lines[line];
      if (FENCE.test(text)) {
        // A fence ends the table where it renders. Skip its content, then keep
        // reading only if rows follow — those still name NIPs, and only then
        // has anything been cut off. A fence merely following the last row
        // costs the table nothing.
        line += 1;
        while (line < lines.length && !FENCE.test(lines[line])) line += 1;
        const beyond = lines.slice(line + 1);
        const next = beyond.find((following) => following.trim() !== "");
        if (next === undefined || !ROW.test(next.trimStart())) break;
        if (DELIMITER.test(beyond[beyond.indexOf(next) + 1] ?? "")) break;
        interrupted = true;
        continue;
      }
      // A row of dashes is a row: Markdown only reads a delimiter directly
      // under the header, so one further down does not start a table of its
      // own, and breaking on it would drop every row below it.
      if (ROW.test(text)) {
        rows.push(text);
        continue;
      }
      // Indented past what Markdown reads as a row: the table has ended here,
      // but the line still says which NIP it names.
      if (text.trim() !== "" && ROW.test(text.trimStart())) {
        interrupted = true;
        rows.push(text.trimStart());
        continue;
      }
      // Blank, or prose — an HTML comment, a stray sentence. Keep reading only
      // while rows follow, so what they name is still known.
      const ahead = lines.slice(line + 1);
      const rest = ahead.find((following) => following.trim() !== "");
      if (rest === undefined || !ROW.test(rest.trimStart())) break;
      // Located from here, not from the section start: a line that repeats an
      // earlier one — a header pasted below the table — would otherwise be
      // found at its first occurrence, whose successor is the real delimiter.
      if (DELIMITER.test(ahead[ahead.indexOf(rest) + 1] ?? "")) break;
      interrupted = true;
    }
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
  // Checked for being objects, not merely present: the loops below reach them
  // with `in` and `Object.entries`, which throw on anything else.
  if (!holds(baseline.sources) || !holds(baseline.documents))
    return [`${BASELINE}: has no \`sources\` and \`documents\` to compare`];
  const hashes = new Map();
  // Ids already reported at their entry — misspelled, or holding nothing to
  // compare — in the spelling the rest of the repository uses. The module and
  // the row that match them are there, so calling either an orphan of a
  // missing entry would be false. One set, one spelling: keeping two, keyed
  // differently, is how a lowercase id slipped past both.
  const excused = new Set();
  // Ids whose entry was reported for the fields a link is built from, so the
  // comparison does not tell its reader to paste `blob/undefined` into the
  // README.
  const unusable = new Set();
  // Both are keyed by family as well as id: `luds.01` saying nothing about a
  // revision is no reason to stop reporting what `nips.01` says.

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

  for (const [family, source] of Object.entries(baseline.sources)) {
    if (!holds(source)) {
      problems.push(`${BASELINE}: \`sources.${family}\` describes no family`);
      continue;
    }
    const { label, repository } = source;
    const documents = baseline.documents[family];
    if (!(family in baseline.documents)) continue; // already reported
    if (!holds(documents)) {
      problems.push(`${BASELINE}: \`documents.${family}\` holds no entries`);
      continue;
    }
    // Reported rather than thrown on: a family added without its label is the
    // same half-finished edit as one added without its entries, and crashing
    // would take the rest of the report with it.
    if (!label)
      problems.push(`${BASELINE}: \`sources.${family}\` has no label`);
    else if (!LABEL.test(label))
      problems.push(
        `${BASELINE}: \`sources.${family}.label\` is \`${label}\`, which is not a series name`,
      );
    if (!repository)
      problems.push(`${BASELINE}: \`sources.${family}\` has no repository`);
    const named = label && LABEL.test(label);
    const modules = named ? moduleIds(label, files) : new Map();

    for (const [id, entry] of Object.entries(documents)) {
      const where = `${BASELINE}: \`${family}.${id}\``;
      if (!holds(entry)) {
        problems.push(`${where} records no revision`);
        excused.add(`${family}.${id.toUpperCase()}`);
        continue;
      }
      if (!DOCUMENT.test(id)) {
        // Cross-checking a misspelled id would bury this under messages naming
        // the module and row that do exist, under the id it should have had.
        problems.push(`${where} is not a two-character document id`);
        excused.add(`${family}.${id.toUpperCase()}`);
        continue;
      }
      if (!COMMIT.test(entry.commit)) {
        problems.push(`${where} has no 40-character commit`);
        unusable.add(`${family}.${id}`);
      }
      if (!isCalendarDate(entry.date)) {
        problems.push(`${where} has no YYYY-MM-DD calendar date`);
        unusable.add(`${family}.${id}`);
      }
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

      if (!named) continue; // the checks below need a usable label
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
      if (!(id in documents) && !excused.has(`${family}.${id}`))
        problems.push(
          `${BASELINE}: \`${SOURCE}/${file}\` has no \`${family}.${id}\` entry`,
        );
  }

  // Everything below reads the table family by name. Missing from one side it
  // is reported above; missing from both it is reported here, because a
  // renamed key would otherwise skip the whole table cross-check in silence.
  if (
    !(TABLE_FAMILY in baseline.sources) &&
    !(TABLE_FAMILY in baseline.documents)
  )
    problems.push(
      `${BASELINE}: no \`${TABLE_FAMILY}\` family, so nothing says what the ${README} table should quote`,
    );
  if (
    !holds(baseline.sources[TABLE_FAMILY]) ||
    !holds(baseline.documents[TABLE_FAMILY])
  )
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
  if (table.nip === -1)
    problems.push(
      `${README}: the Supported NIPs table has no \`${NIP_COLUMN}\` column`,
    );

  if (table.interrupted)
    problems.push(
      `${README}: the Supported NIPs table breaks off before its rows end, so what follows it does not render as part of it`,
    );

  const { repository } = baseline.sources[TABLE_FAMILY];
  // A missing repository is reported with its family; building `expected`
  // around it would report every row as disagreeing with a link to `undefined`.
  const tabled = new Set();
  for (const row of table.nip === -1 ? [] : table.rows) {
    const cells = cellsOf(row);
    const nip = cells[table.nip]?.match(TABLE_ROW)?.[1];
    if (!nip) {
      problems.push(`${README}: cannot read a NIP number from row: ${row}`);
      continue;
    }
    tabled.add(nip);
    const entry = baseline.documents[TABLE_FAMILY][nip];
    const known = `${TABLE_FAMILY}.${nip}`;
    if (excused.has(known)) continue; // reported at its entry
    if (!entry) {
      problems.push(`${README}: NIP-${nip} has no entry in ${BASELINE}`);
      continue;
    }
    if (column === -1 || !repository || unusable.has(known)) continue; // reported
    const expected = `[${entry.date}](${repository}/blob/${entry.commit}/${nip}.md)`;
    if (cells[column] !== expected)
      problems.push(
        `${README}: NIP-${nip}'s spec baseline cell disagrees with ${BASELINE}:\n` +
          `    ${README}: ${cells[column]}\n` +
          `    expected: ${expected}`,
      );
  }

  // A misspelled id is reported as such above; asking the table for a row it
  // could not name would repeat that as a second, misleading message. A break
  // does not suppress this — the rows past it were still read.
  // Without the column naming them, which rows name which NIP is unknown, so
  // calling each of them absent would be fourteen guesses at one problem.
  const named = table.nip !== -1;
  for (const nip of named ? Object.keys(baseline.documents[TABLE_FAMILY]) : [])
    if (DOCUMENT.test(nip) && !tabled.has(nip))
      problems.push(
        `${README}: NIP-${nip} is baselined in ${BASELINE} but absent from the Supported NIPs table`,
      );

  return problems;
}

/** The line the CLI prints when nothing disagrees. */
export function specBaselineSummary({ baseline }) {
  const counts = Object.keys(baseline.documents)
    .map(
      (family) => `${Object.keys(baseline.documents[family]).length} ${family}`,
    )
    .join(", ");
  return (
    `Spec baseline check passed — ${counts} baselined from ${SOURCE}/; ` +
    `${Object.keys(baseline.documents[TABLE_FAMILY] ?? {}).length} NIPs cross-checked against ${README}.`
  );
}
