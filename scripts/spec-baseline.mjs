// Asserts that `spec-baseline.json` and the spec modules under `src/` agree,
// family by family, about what is baselined. Which families there are is what
// `spec-baseline.json` says: this checks what it declares, not what `src/`
// might imply.
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
// - `sources` says which families exist, and this checks what it says: within a
//   family it declares, the modules and the entries must match each other. A
//   family it does not name is not checked, because no filename rule separates
//   a `bolt11.ts` worth baselining from a `bech32.ts` that is an ordinary
//   helper. Naming a family on one side of the file only is reported, since
//   that is a half-finished edit rather than a declaration.
//
// It takes its two inputs as data and returns what it found, so every rule
// below is pinned by `spec-baseline.test.mjs` without a fixture repository.
// Reading the files, printing, and exiting are `spec-baseline-check.mjs`'s job.
import { basename } from "node:path";

export const BASELINE = "spec-baseline.json";
export const SOURCE = "src";

// Lowercase hex, as git and `sha256sum` write them, and as every entry here
// does: accepting either case would let one hash be written two ways, and the
// paste check compares them as text.
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
 * What is wrong with `date`, or null. Digit-shaped is not enough: a transposed
 * month (`2026-90-04`) or year (`2062-06-13`) is otherwise a real string that
 * nothing else here would notice, and each is named for what it is rather than
 * folded into one message. The day of slack is for a maintainer reading a date
 * east of UTC, for whom today has already begun.
 */
function dateProblem(date) {
  if (typeof date !== "string" || !DATE.test(date))
    return "has no YYYY-MM-DD date";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return `dates a day that does not exist, ${date}`;
  if (date > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
    return `dates a day that has not come, ${date}`;
  return null;
}

/** Whether `value` is something to read keys off, rather than to throw on. */
function holds(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The documents a family implements, as id → path, from `<label><id>.ts`
 * anywhere under `src/`. Matched case-insensitively, since neither the
 * lowercase filename nor the flat layout is enforced by anything, and on two
 * id characters, which is what a document id is — `DOCUMENT` says the same of
 * the baseline's keys. A module of another width is not one of these.
 */
function moduleIds(label, files) {
  const module = new RegExp(`^${label}([0-9a-z]{2})\\.ts$`, "i");
  const found = new Map();
  for (const file of files) {
    const id = basename(file).match(module)?.[1];
    // Every file that claims an id, not the last one seen: two modules for one
    // document is a problem of its own, and keeping only one would make which
    // file a diagnostic names depend on the order the directory was read in.
    if (id)
      found.set(id.toUpperCase(), [
        ...(found.get(id.toUpperCase()) ?? []),
        file,
      ]);
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
  if (!holds(baseline)) return [`${BASELINE}: holds no object to compare`];
  const missing = ["sources", "documents"].filter(
    (key) => !holds(baseline[key]),
  );
  if (missing.length > 0)
    return [
      `${BASELINE}: has no ${missing.map((key) => `\`${key}\``).join(" and no ")} to compare`,
    ];

  const problems = [];
  // Two documents sharing a hash means one was pasted from the other, and two
  // entries at one commit disagreeing about its date means one was mistyped —
  // the likeliest corruptions of the fields the baseline rests on, and the ones
  // judgeable without the upstream text.
  const hashes = new Map();
  const dated = new Map();

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

  // Every family with entries, not only the declared ones: an entry says what
  // it says wherever it is written, and holding it back until its family is
  // declared would report the same file over two runs.
  for (const family of Object.keys(baseline.documents)) {
    const source = baseline.sources[family];
    // Declared means named *and* describing a family: a `sources` value that is
    // not an object says nothing about a label or a repository, but its
    // entries still say what they say, so they are judged all the same.
    const named = Object.hasOwn(baseline.sources, family);
    const declared = named && holds(source);
    if (named && !declared)
      problems.push(`${BASELINE}: \`sources.${family}\` describes no family`);
    const documents = baseline.documents[family];
    if (!holds(documents)) {
      problems.push(`${BASELINE}: \`documents.${family}\` holds no entries`);
      continue;
    }

    // Reported rather than thrown on: a family added without its label is the
    // same half-finished edit as one added without its entries, and crashing
    // would take the rest of the report with it. A regex coerces what it tests,
    // so `true` would read as `"true"` without the type check.
    const { label, repository } = declared ? source : {};
    const labelled = typeof label === "string" && LABEL.test(label);
    if (declared && !labelled)
      problems.push(
        `${BASELINE}: \`sources.${family}\` has no label naming a document series`,
      );
    if (
      declared &&
      (typeof repository !== "string" || repository.trim() === "")
    )
      problems.push(`${BASELINE}: \`sources.${family}\` has no repository`);
    const modules = labelled ? moduleIds(label, files) : new Map();
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

      // The fields are judged before the key is, so an entry that is both
      // mis-keyed and carries a pasted hash says so in one run rather than
      // over two. Tested for being strings first, for the reason the label is:
      // a regex coerces what it tests, and an array of one hash would key the
      // maps below by the array, quietly excusing itself from both checks.
      const committed =
        typeof entry.commit === "string" && COMMIT.test(entry.commit);
      if (!committed)
        problems.push(`${where} has no 40-character lowercase-hex commit`);
      const undated = dateProblem(entry.date);
      if (undated) problems.push(`${where} ${undated}`);
      const hashed =
        typeof entry.sha256 === "string" && SHA256.test(entry.sha256);
      if (!hashed)
        problems.push(`${where} has no 64-character lowercase-hex sha256`);

      if (hashed) {
        const pasted = hashes.get(entry.sha256);
        if (pasted)
          problems.push(`${where} and \`${pasted}\` record the same sha256`);
        else hashes.set(entry.sha256, `${family}.${id}`);
      }

      // One commit has one committer date, so two entries recording it must
      // agree about when it landed.
      if (committed && !undated) {
        const first = dated.get(entry.commit);
        if (first === undefined)
          dated.set(entry.commit, { date: entry.date, at: `${family}.${id}` });
        else if (first.date !== entry.date && !first.reported) {
          // One disagreement about one commit is one problem, however many
          // entries share it.
          first.reported = true;
          problems.push(
            `${where} dates ${entry.commit.slice(0, 7)} to ${entry.date}, which \`${first.at}\` dates to ${first.date}`,
          );
        }
      }

      if (!DOCUMENT.test(id)) {
        // Cross-checking a misspelled id against the modules would bury this
        // under a message naming the module that does exist.
        problems.push(
          `${where} is not a document id: two characters, digits or uppercase, as the upstream filename is`,
        );
        excused.add(id.toUpperCase());
        continue;
      }

      if (!labelled) continue; // the check below needs a usable label
      if (!modules.has(id))
        problems.push(
          `${where} has no \`${SOURCE}/${label.toLowerCase()}${id.toLowerCase()}.ts\``,
        );
    }

    // Within a declared family, `src/` decides: a module with no entry has no
    // provenance recorded for it.
    for (const [id, paths] of modules) {
      if (paths.length > 1)
        problems.push(
          `${SOURCE}/: \`${family}.${id}\` is claimed by ${paths.map((path) => `\`${SOURCE}/${path}\``).join(" and ")}`,
        );
      if (!Object.hasOwn(documents, id) && !excused.has(id))
        for (const path of paths)
          problems.push(
            `${BASELINE}: \`${SOURCE}/${path}\` has no \`${family}.${id}\` entry`,
          );
    }
  }

  return problems;
}

/** The line the CLI prints when nothing disagrees. */
export function specBaselineSummary({ baseline }) {
  const families = Object.keys(baseline.documents);
  if (families.length === 0)
    return `Spec baseline check passed — ${BASELINE} declares no families, so nothing in ${SOURCE}/ was checked.`;
  const counts = families
    .map(
      (family) => `${Object.keys(baseline.documents[family]).length} ${family}`,
    )
    .join(", ");
  return (
    `Spec baseline check passed — ${counts} baselined, ` +
    `for the families ${BASELINE} declares.`
  );
}
