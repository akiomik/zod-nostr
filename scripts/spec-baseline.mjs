// Asserts that `spec-baseline.json` records every specification `src/`
// implements, and that README.md's `Supported NIPs` table quotes what it
// records.
//
// Four places name the same set of specs: the spec modules, the baseline, the
// table, and the README's prose outside it — where the opening `Covers NIP-…`
// sentence names them all. The table repeats each revision so a reader can
// click straight through to the spec text a schema targets, which makes it a
// second copy of a fact, and the sentence is a third — and nothing else in the
// repository would notice the copies drifting apart. A NIP module added
// without an entry ships with no recorded provenance; an entry bumped without
// its table cell leaves readers clicking through to superseded spec text; a
// NIP added to all three leaves the sentence stale. All would otherwise pass
// CI.
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
// - Every table in the `Supported NIPs` section that has a column named for
//   the family is one of these tables, so a list of NIPs deliberately left
//   unbaselined — planned work, say — belongs outside the section, or inside a
//   fence, rather than beside them.
// - A row is marked by its leading pipe, as every row in this README has. GFM
//   lets that one be left off too; a table written without it is reported as
//   no table, loudly rather than silently, and writing one is a choice nobody
//   here has made. A trailing pipe is optional, as GFM has it.
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
const DELIMITER = /^ {0,3}\|[\s:|-]*-[\s:|-]*\|?\s*$/;
// A fence opens with three or more backticks or tildes, indented at most
// three: a deeper indent is a code block, not a fence. It closes on the same
// character, at least as long, carrying nothing else — so a `~~~` shown inside
// a backtick block, or a fence inside indented code, does not end anything.
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
// What ends the section: an ATX heading of the same or higher level, or the
// underline of a setext one. A `### ` subsection belongs to the section; a
// thematic break does not underline anything, so it needs a line above it.
const HEADING = /^ {0,3}#{1,2} /;
const UNDERLINE = /^ {0,3}(=+|-+)\s*$/;
// What a setext underline cannot follow. CommonMark says it underlines a
// paragraph; without block-level parsing the nearest honest test is that the
// line above starts none of the blocks this reader knows — a row, a heading, a
// fence, a list item, a quote, or HTML. Dashes above any of those are a
// thematic break, and reading one as an underline ends the section early.
const NOT_A_PARAGRAPH = /^ {0,3}([-*+>|<]|\d+[.)]|#{1,6} |`{3,}|~{3,})/;

// A document id is the stem of its upstream filename, so it is spelled the way
// the file is: two characters, digits or uppercase (`01`, `7D`). A lowercase
// key would build a permalink to a file that does not exist.
const DOCUMENT = /^[0-9A-Z]{2}$/;
// A label names a document series and is interpolated into the pattern that
// finds its modules, so it is held to letters: `LUD(` would reach `RegExp` as
// syntax, and `L.D` would quietly match modules of another family.
const LABEL = /^[A-Za-z]+$/;

/**
 * Whether `date` is a day that has happened, not merely digit-shaped. A
 * transposed month (`2026-90-04`) or year (`2062-06-13`) is copied into the
 * README cell by the normal workflow, so the cell comparison agrees with it
 * and nothing else here would notice.
 */
function isCalendarDate(date) {
  if (!DATE.test(date ?? "")) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    // A revision cannot have landed later than now, so a transposed year is
    // caught along with a transposed month — both are real days otherwise, and
    // the README cell is copied from the same field, so it agrees either way.
    parsed.getTime() <= Date.now()
  );
}

/**
 * The fence a line leaves open: `open` unchanged if it is not a fence line,
 * the fence it starts if none was open, or null if it closes the open one.
 */
function fenceAfter(line, open) {
  const marker = line.match(FENCE)?.[1];
  if (marker === undefined) return open;
  if (open === null) return marker;
  const closes = marker[0] === open[0] && marker.length >= open.length;
  return closes && line.trim() === marker ? null : open;
}

/** Whether `value` is something to read keys off, rather than to throw on. */
function holds(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * A Markdown row's cells. An escaped `\|` is content, not a boundary, and the
 * outer pipes — which GFM lets a row leave off — bound nothing, so the empty
 * strings they split off are not cells.
 */
function cellsOf(line) {
  const cells = line.trim().split(/(?<!\\)\|/);
  if (cells.at(0)?.trim() === "") cells.shift();
  if (cells.at(-1)?.trim() === "") cells.pop();
  return cells.map((cell) => cell.trim());
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
  let offset = 0;
  let fence = null;
  let found = false;
  // A second heading of the same name would hold rows this scan never reads,
  // and reading only the first of them is a silent answer to a broken README.
  let twice = false;
  for (const [index, line] of all.entries()) {
    const after = fenceAfter(line, fence);
    if (after !== fence) {
      fence = after;
    } else if (fence === null) {
      if (!found) {
        // Markdown lets a heading close with a run of hashes, which changes
        // nothing about what it says.
        found = line.trim().replace(/\s+#+$/, "") === TABLE_HEADING;
        if (found) {
          // From where the scan is: the heading's text may appear earlier, in
          // a fence this loop has already stepped over.
          offset = index;
          lines.push(line);
        }
        continue;
      }
      if (HEADING.test(line)) {
        twice = readme
          .split("\n")
          .slice(index)
          .some((rest) => rest.trim().replace(/\s+#+$/, "") === TABLE_HEADING);
        break;
      }
      const above = lines.at(-1) ?? "";
      const paragraph = above.trim() !== "" && !NOT_A_PARAGRAPH.test(above);
      if (UNDERLINE.test(line) && paragraph) {
        lines.pop(); // the line it underlines is that heading, not our content
        break;
      }
    }
    if (found) lines.push(line);
  }
  return found ? { lines, offset, twice } : null;
}

/**
 * The rows under the header at `index`, whether the table broke off before
 * they ended, and the line the scan stopped at — so the next table in the
 * section is looked for after this one rather than inside it.
 *
 * A blank line, or an indent Markdown reads as something other than a row,
 * ends the table where it renders, which is worth reporting on its own. The
 * rows past it are still collected, because they still say which NIPs the
 * README names, and a NIP missing from all of them is a separate problem that
 * should not wait for the break to be fixed. A table of its own below, which
 * carries its own delimiter, ends the scan instead.
 */
function rowsUnder(lines, index) {
  const rows = [];
  const at = [];
  let interrupted = false;
  let line = index + 2;
  for (; line < lines.length; line += 1) {
    const text = lines[line];
    const opened = fenceAfter(text, null);
    if (opened !== null) {
      // A fence ends the table where it renders. Skip its content, then keep
      // reading only if rows follow — those still name NIPs, and only then has
      // anything been cut off. A fence merely following the last row costs the
      // table nothing.
      line += 1;
      while (line < lines.length && fenceAfter(lines[line], opened) !== null)
        line += 1;
      // Past the closing marker, not on it: leaving the scan there would have
      // the caller read that marker as opening a fence, and every fence after
      // it in the section the wrong way round.
      const beyond = lines.slice(line + 1);
      const next = beyond.find((following) => following.trim() !== "");
      if (next === undefined || !ROW.test(next.trimStart()))
        return { rows, at, interrupted, end: line + 1 };
      if (DELIMITER.test(beyond[beyond.indexOf(next) + 1] ?? ""))
        return { rows, at, interrupted, end: line + 1 };
      interrupted = true;
      continue;
    }
    // A row of dashes is a row: Markdown only reads a delimiter directly under
    // the header, so one further down does not start a table of its own, and
    // breaking on it would drop every row below it.
    if (ROW.test(text)) {
      rows.push(text);
      at.push(line);
      continue;
    }
    // Indented past what Markdown reads as a row: the table has ended here,
    // but the line still says which NIP it names.
    if (text.trim() !== "" && ROW.test(text.trimStart())) {
      interrupted = true;
      rows.push(text.trimStart());
      at.push(line);
      continue;
    }
    // Blank, or prose — an HTML comment, a stray sentence. Keep reading only
    // while rows follow, so what they name is still known.
    const ahead = lines.slice(line + 1);
    const rest = ahead.find((following) => following.trim() !== "");
    if (rest === undefined || !ROW.test(rest.trimStart())) break;
    // Located from here, not from the section start: a line that repeats an
    // earlier one — a header pasted below the table — would otherwise be found
    // at its first occurrence, whose successor is the real delimiter.
    if (DELIMITER.test(ahead[ahead.indexOf(rest) + 1] ?? "")) break;
    interrupted = true;
  }
  return { rows, at, interrupted, end: line };
}

/**
 * The `Supported NIPs` tables: every block in the section, outside a fence,
 * with a delimiter row and one of the two columns this reads. Null if the
 * section is not there at all.
 *
 * Every such block, not the first: a section split into two tables — core and
 * extensions, say — names its NIPs across both, and reading only one would
 * report every row of the other as missing.
 */
function supportedNipsTables(readme, column) {
  const section = sectionLines(readme);
  if (section === null) return null;
  const { lines, offset, twice } = section;
  const tables = [];
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    const after = fenceAfter(header, fence);
    if (after !== fence) {
      fence = after;
      continue;
    }
    if (fence !== null || !ROW.test(header)) continue;
    if (!DELIMITER.test(lines[index + 1] ?? "")) continue;
    const cells = cellsOf(header);
    const nip = cells.indexOf(column);
    // Either column marks a block as one of these tables rather than a legend
    // beside them. Recognizing it on one lets the other be reported as
    // renamed, instead of the table being reported as missing.
    if (nip === -1 && !cells.includes(BASELINE_COLUMN)) continue;
    const { rows, at, interrupted, end } = rowsUnder(lines, index);
    tables.push({
      header,
      rows,
      nip,
      interrupted,
      // GFM renders a table only when its delimiter row has as many cells as
      // its header: adding a column and not extending the delimiter — the
      // half-finished edit this very column invites — leaves the whole block
      // as raw pipes on the page.
      misdelimited: cellsOf(lines[index + 1]).length !== cells.length,
      at: at.map((line) => line + offset),
    });
    index = end - 1; // the loop's own step moves past it
  }
  return { tables, twice };
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
  // Deferred until the prose exists, which needs the table located first.
  const mentions = [];
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
    if (!Object.hasOwn(baseline.sources, family))
      problems.push(
        `${BASELINE}: \`documents.${family}\` has no \`sources\` entry`,
      );
  for (const family of Object.keys(baseline.sources))
    if (!Object.hasOwn(baseline.documents, family))
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
    if (!Object.hasOwn(baseline.documents, family)) continue; // reported
    if (!holds(documents)) {
      problems.push(`${BASELINE}: \`documents.${family}\` holds no entries`);
      continue;
    }
    // Reported rather than thrown on: a family added without its label is the
    // same half-finished edit as one added without its entries, and crashing
    // would take the rest of the report with it.
    if (!label)
      problems.push(`${BASELINE}: \`sources.${family}\` has no label`);
    else if (typeof label !== "string" || !LABEL.test(label))
      problems.push(
        `${BASELINE}: \`sources.${family}.label\` is \`${label}\`, which is not a series name`,
      );
    if (typeof repository !== "string" || repository === "")
      problems.push(`${BASELINE}: \`sources.${family}\` has no repository`);
    const named = typeof label === "string" && LABEL.test(label);
    const modules = named ? moduleIds(label, files) : new Map();

    for (const [id, entry] of Object.entries(documents)) {
      const where = `${BASELINE}: \`${family}.${id}\``;
      if (!holds(entry)) {
        problems.push(`${where} records no revision`);
        excused.add(`${family}.${id.toUpperCase()}`);
        continue;
      }
      if (!DOCUMENT.test(id)) {
        // Cross-checking an id that differs only in case would bury this under
        // messages naming the module and row that do exist under the spelling
        // it should have had. A typo of another shape — `1` for `01` — names no
        // id at all, so what it should have been is not knowable and the module
        // and row are reported on their own terms.
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
      // carry: that it names the document at all. Judged against the same prose
      // the NIPs are, once there is any — a mention inside a fence, or inside a
      // cell of the table, is no more a mention for one family than the other.
      if (family !== TABLE_FAMILY) mentions.push([label, id]);
    }

    // `src/` is the authority: a spec module with no entry has no provenance.
    for (const [id, file] of modules)
      if (!Object.hasOwn(documents, id) && !excused.has(`${family}.${id}`))
        problems.push(
          `${BASELINE}: \`${SOURCE}/${file}\` has no \`${family}.${id}\` entry`,
        );
  }

  // Everything below reads the table family by name. Missing from one side it
  // is reported above; missing from both it is reported here, because a
  // renamed key would otherwise skip the whole table cross-check in silence.
  if (
    !Object.hasOwn(baseline.sources, TABLE_FAMILY) &&
    !Object.hasOwn(baseline.documents, TABLE_FAMILY)
  )
    problems.push(
      `${BASELINE}: no \`${TABLE_FAMILY}\` family, so nothing says what the ${README} table should quote`,
    );
  if (
    !holds(baseline.sources[TABLE_FAMILY]) ||
    !holds(baseline.documents[TABLE_FAMILY])
  )
    return problems;

  // The column heading a row is read by, and the row's own shape, follow the
  // family's label rather than being spelled out here: naming the modules one
  // way and the rows another would let the two halves drift apart in silence.
  const { label: series, repository: source } = baseline.sources[TABLE_FAMILY];
  // A regex coerces what it tests, so `true` reads as `"true"` and `["NIP"]` as
  // `"NIP"` — one crashing later, the other matching modules while matching no
  // column. Both are reported with the family rather than met halfway.
  if (typeof series !== "string" || !LABEL.test(series)) return problems;
  const nipRow = new RegExp(`^\\*\\*${series}-([0-9A-Z]{2})\\*\\*$`);
  // Trailing slashes are trimmed so a link is built the way one is written.
  // Trimmed first, then judged: `"/"` is a string, and trimming it leaves
  // nothing to build a link from — which would skip every cell comparison in
  // silence rather than say so.
  const trimmed =
    typeof source === "string" ? source.replace(/\/+$/, "") : undefined;
  if (source !== undefined && trimmed === "")
    problems.push(`${BASELINE}: \`sources.${TABLE_FAMILY}\` has no repository`);
  const repository = trimmed === "" ? undefined : trimmed;

  const section = supportedNipsTables(readme, series);
  if (section?.twice)
    problems.push(
      `${README}: more than one "Supported NIPs" section, so what the table says is not all of it`,
    );
  const tables = section?.tables ?? null;
  if (tables === null || tables.length === 0) {
    problems.push(`${README}: no "Supported NIPs" section with a NIP table`);
    return problems;
  }
  const tabled = new Set();
  // Which rows name which NIP is what a missing `NIP` column makes unknowable,
  // so the absence check waits until every table in the section could be read:
  // one that could not may hold the very row it would call missing.
  const named = tables.every((table) => table.nip !== -1);

  // One break, one mismatched delimiter, or one missing column is one problem
  // however many tables show it — a reader fixes the section, not each table
  // in turn.
  if (tables.some((table) => table.misdelimited))
    problems.push(
      `${README}: the Supported NIPs table's delimiter row does not have as many cells as its header, so the table does not render as one`,
    );
  if (tables.some((table) => table.interrupted))
    problems.push(
      `${README}: the Supported NIPs table breaks off before its rows end, so what follows it does not render as part of it`,
    );
  if (tables.some((table) => !cellsOf(table.header).includes(BASELINE_COLUMN)))
    problems.push(
      `${README}: the Supported NIPs table has no \`${BASELINE_COLUMN}\` column`,
    );
  if (tables.some((table) => table.nip === -1))
    problems.push(
      `${README}: the Supported NIPs table has no \`${series}\` column`,
    );

  for (const table of tables) {
    // Both columns a table is read by are located from its own header rather
    // than assumed, so either may move; dropping one is reported.
    const column = cellsOf(table.header).indexOf(BASELINE_COLUMN);

    for (const row of table.nip === -1 ? [] : table.rows) {
      const cells = cellsOf(row);
      const nip = cells[table.nip]?.match(nipRow)?.[1];
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
      // A missing repository is reported with its family; building `expected`
      // around it would report every row as disagreeing with `undefined`.
      if (column === -1 || !repository || unusable.has(known)) continue;
      if (column >= cells.length) {
        problems.push(
          `${README}: NIP-${nip}'s row has no \`${BASELINE_COLUMN}\` cell`,
        );
        continue;
      }
      const expected = `[${entry.date}](${repository}/blob/${entry.commit}/${nip}.md)`;
      if (cells[column] !== expected)
        problems.push(
          `${README}: NIP-${nip}'s spec baseline cell disagrees with ${BASELINE}:\n` +
            `    ${README}: ${cells[column]}\n` +
            `    expected: ${expected}`,
        );
    }
  }

  // A misspelled id is reported as such above; asking the table for a row it
  // could not name would repeat that as a second, misleading message. A break
  // does not suppress this — the rows past it were still read.
  // The table is not the README's only list of these: the sentence above it
  // names them too, and a NIP added to every file the check reads can still
  // leave that stale. Held to the same weak thing a family without a table is
  // — a mention — but outside the rows, which would satisfy it trivially.
  // The prose a reader reads: the README without the table's rows, which are
  // removed by where they are rather than by what they say, and without fenced
  // text, where a copy of a row is an example of one rather than a mention.
  const rowLines = new Set(tables.flatMap((table) => table.at));
  let quoted = null;
  const prose = readme
    .split("\n")
    .filter((line, at) => {
      const after = fenceAfter(line, quoted);
      const inside = quoted !== null || after !== quoted;
      quoted = after;
      return !inside && !rowLines.has(at);
    })
    .join("\n");
  for (const [label, id] of mentions)
    if (!prose.includes(`${label}-${id}`))
      problems.push(`${README}: never mentions ${label}-${id}`);

  for (const id of Object.keys(baseline.documents[TABLE_FAMILY]))
    if (DOCUMENT.test(id) && !prose.includes(`${series}-${id}`))
      problems.push(
        `${README}: never mentions ${series}-${id} outside the table`,
      );

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
