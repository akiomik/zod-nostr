// Asserts that `spec-baseline.json` records every specification `src/`
// implements, and nothing it does not.
//
// Two places name the same set of specs: the modules and the baseline. A spec
// module added without an entry ships with no recorded provenance, and an entry
// with no module is dead weight; neither would otherwise fail CI. The revision
// an entry records is a fact kept in one place — README.md points at this file
// rather than repeating it — so there is nothing for it to disagree with.
//
// The scope is deliberately narrow, and worth stating because the natural pull
// is to widen it:
//
// - It compares the repository against itself, never upstream. Whether a spec
//   has moved since a baseline was recorded is a different question with a
//   different answer over time, and answering it here would make an unrelated
//   upstream edit fail an innocent pull request.
// - It reads no Markdown. Which specs the README says are covered is prose;
//   holding it to the baseline means parsing Markdown, and a parser is a large
//   thing to maintain in order to police a fact this file already holds alone.
// - It assumes `spec-baseline.json` is well-formed JSON written by a
//   maintainer. Guarding each way a hand-corrupted file could be malformed
//   costs more code than the case is worth: the build fails either way, and
//   `biome check` already rejects invalid JSON.
// - The modules it reads are those of a family `sources` registers. A module of
//   a family nobody registered is invisible: no filename rule separates a
//   `bolt11.ts` worth baselining from a `bech32.ts` that is an ordinary helper,
//   so 0004 leaves registering a family to the person adding it.
//
// It takes its two inputs as data and returns what it found, so every rule
// below is pinned by `spec-baseline.test.mjs` without a fixture repository.
// Reading the files, printing, and exiting are `spec-baseline-check.mjs`'s job.
import { basename } from "node:path";

export const BASELINE = "spec-baseline.json";
export const SOURCE = "src";

const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// A document id is the stem of its upstream filename, so it is spelled the way
// the file is: two characters, digits or uppercase (`01`, `7D`).
const DOCUMENT = /^[0-9A-Z]{2}$/;
// A label names a document series and is interpolated into the pattern that
// finds its modules, so it is held to letters: `LUD(` would reach `RegExp` as
// syntax, and `L.D` would quietly match modules of another family.
const LABEL = /^[A-Za-z]+$/;

/**
 * Whether `date` is a day that has happened, not merely digit-shaped. A
 * transposed month (`2026-90-04`) or year (`2062-06-13`) is otherwise a real
 * string that nothing else here would notice. The day of slack is for a
 * maintainer reading a date east of UTC, for whom today has already begun.
 */
function isCalendarDate(date) {
  if (typeof date !== "string" || !DATE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    date <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  );
}

/** Whether `value` is something to read keys off, rather than to throw on. */
function holds(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
 * Everything the baseline and the modules disagree about, as messages. `files`
 * are the paths under `src/`; `baseline` is the parsed `spec-baseline.json`.
 */
export function specBaselineProblems({ baseline, files }) {
  // Checked for being objects, not merely present: the loops below reach them
  // with `Object.entries`, which throws on anything else.
  if (!holds(baseline.sources) || !holds(baseline.documents))
    return [`${BASELINE}: has no \`sources\` and \`documents\` to compare`];

  const problems = [];
  const hashes = new Map();

  // `sources` says what a family is and `documents` holds its entries, so a
  // family in one and not the other is the same "updated one file and not the
  // other" mistake the rest of this checks for.
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
    if (!Object.hasOwn(baseline.documents, family)) continue; // reported above
    if (!holds(source)) {
      problems.push(`${BASELINE}: \`sources.${family}\` describes no family`);
      continue;
    }
    const documents = baseline.documents[family];
    if (!holds(documents)) {
      problems.push(`${BASELINE}: \`documents.${family}\` holds no entries`);
      continue;
    }

    // Reported rather than thrown on: a family added without its label is the
    // same half-finished edit as one added without its entries, and crashing
    // would take the rest of the report with it. A regex coerces what it tests,
    // so `true` would read as `"true"` without the type check.
    const { label, repository } = source;
    const named = typeof label === "string" && LABEL.test(label);
    if (!named)
      problems.push(
        `${BASELINE}: \`sources.${family}\` has no label naming a document series`,
      );
    if (typeof repository !== "string" || repository.trim() === "")
      problems.push(`${BASELINE}: \`sources.${family}\` has no repository`);
    const modules = named ? moduleIds(label, files) : new Map();
    // Ids already reported at their entry, in the spelling the modules use: the
    // module that matches one is there, so calling it an orphan of a missing
    // entry would be false.
    const excused = new Set();

    for (const [id, entry] of Object.entries(documents)) {
      const where = `${BASELINE}: \`${family}.${id}\``;
      if (!holds(entry)) {
        problems.push(`${where} records no revision`);
        excused.add(id.toUpperCase());
        continue;
      }
      if (!DOCUMENT.test(id)) {
        // Cross-checking a misspelled id against the modules would bury this
        // under a message naming the module that does exist.
        problems.push(`${where} is not a two-character document id`);
        excused.add(id.toUpperCase());
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

      if (!named) continue; // the check below needs a usable label
      if (!modules.has(id))
        problems.push(
          `${where} has no \`${SOURCE}/${label.toLowerCase()}${id}.ts\``,
        );
    }

    // `src/` is the authority: a spec module with no entry has no provenance.
    for (const [id, file] of modules)
      if (!Object.hasOwn(documents, id) && !excused.has(id))
        problems.push(
          `${BASELINE}: \`${SOURCE}/${file}\` has no \`${family}.${id}\` entry`,
        );
  }

  return problems;
}

/** The line the CLI prints when nothing disagrees. */
export function specBaselineSummary({ baseline }) {
  const counts = Object.keys(baseline.documents)
    .map(
      (family) => `${Object.keys(baseline.documents[family]).length} ${family}`,
    )
    .join(", ");
  return `Spec baseline check passed — ${counts} baselined from ${SOURCE}/.`;
}
