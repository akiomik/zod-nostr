// Asserts that `spec-baseline.json` records every specification the source
// implements, and that README.md agrees with it.
//
// Three files name the same set of specs: the modules under `src/`, the
// baseline, and the README (its `Supported NIPs` table and the coverage
// paragraph above it). The README also repeats each NIP's commit and date so a
// reader can click straight through to the spec text a schema targets. Nothing
// else in the repository would notice those copies drifting apart: a NIP module
// added without a baseline entry ships with no recorded provenance, and a
// baseline bumped without the matching README cell leaves readers clicking
// through to superseded spec text — both with CI green. This check makes each a
// build failure.
//
// `src/` is the authority on what is implemented, so the module files of a
// declared family decide which of its documents must be baselined. Two things
// that follows from, both deliberate: a specification implemented inside an
// existing module rather than its own file is invisible here, and so is a
// module of a family `sources` never declares — no filename rule separates a
// `bolt11.ts` from a `bech32.ts`, so guessing produced worse diagnostics than
// it prevented. Both are human steps that 0004 records; this check covers what
// it can decide. A NIP is then cross-checked cell by cell,
// since the table quotes its whole revision. A document from any other family
// (LUD-01, LUD-16) has no row to quote, so the check asserts the weaker thing
// the README can carry: that the README links the family's repository and that
// the link's text enumerates exactly the family's baselined documents. That
// catches a document added or removed on either side, but not a stale revision
// — for those, the JSON is the only source.
//
// Deliberately offline. Whether the upstream text has moved since a baseline
// was recorded is a different question with a different answer over time; this
// check only asserts that the repository agrees with itself, so it can run in
// the same CI step as the rest of the suite without a network dependency.
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = "spec-baseline.json";
const README = "README.md";
const SOURCE = "src";
const TABLE_FAMILY = "nips";

const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Document ids are two characters, digits or uppercase letters: upstream
// already numbers some NIPs in hex (`7D`, `C0`). Module filenames spell the
// same id in lowercase (`nip7d.ts`).
const DOCUMENT = /^[0-9A-Z]{2}$/;
// A family label names a document series (`NIP`, `LUD`) and is interpolated
// into the patterns that find its modules and mentions, so it is held to
// letters: anything else is not a label, and would reach `RegExp` as syntax.
const LABEL = /^[A-Za-z]+$/;
const TABLE_ROW = /^\*\*NIP-([0-9A-Z]{2})\*\*$/;
const BASELINE_COLUMN = "Spec baseline";
const TABLE_HEADING = "\n## Supported NIPs\n";
// What identifies the intro's coverage paragraph is that it links to the table
// and names NIPs, not its wording: anchoring on the prose would fail a
// rewording that changed nothing about the list.
const TABLE_LINK = "](#supported-nips)";
const NAMES_A_NIP = /NIP-[0-9A-Z]{2}/;

/**
 * The texts of the README's links to `repository`. A family with no table row
 * enumerates its documents in that link text (`[LUD-01 and LUD-16](…/luds)`),
 * which is where the check reads them from: scanning the whole README instead
 * would misread any passing mention — "does not decode to a LUD-01 URL" — as a
 * missing baseline.
 */
function linkTexts(readme, repository) {
  const escaped = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const link = new RegExp(`\\[([^\\]]*)\\]\\(${escaped}[^)]*\\)`, "g");
  return [...readme.matchAll(link)].map(([, text]) => text).join("\n");
}

/**
 * The documents a family implements, as id → path, read from
 * `<label><id>.ts` anywhere under `src/`. Matched case-insensitively and
 * recursively, because neither the lowercase filename nor the flat layout is
 * enforced by anything: a `nip7D.ts`, or a module filed under a subdirectory,
 * would otherwise be exempt from baselining rather than reported. The path is
 * kept so a diagnostic can name the file that exists rather than the one it
 * assumed.
 */
function implemented(label) {
  const module = new RegExp(`^${label}([0-9a-z]{2})\\.ts$`, "i");
  return new Map(
    readdirSync(join(root, SOURCE), { recursive: true })
      .map((file) => [basename(file).match(module)?.[1], file])
      .filter(([id]) => id)
      .map(([id, file]) => [id.toUpperCase(), file]),
  );
}

/**
 * The paragraphs above the table that both link to it and name NIPs — the
 * coverage summary, and nothing else. Paragraphs are taken whole, so neither
 * rewrapping nor rewording one can truncate what the check reads, and every
 * candidate is returned rather than the nearest: picking one would let a second
 * such paragraph quietly become the thing enforced while the real summary went
 * stale.
 */
function coverageParagraphs(readme) {
  const heading = readme.indexOf(TABLE_HEADING);
  return readme
    .slice(0, heading === -1 ? undefined : heading)
    .split("\n\n")
    .filter(
      (paragraph) =>
        paragraph.includes(TABLE_LINK) && NAMES_A_NIP.test(paragraph),
    );
}

/**
 * README's `Supported NIPs` table split into header, delimiter, and body rows,
 * or null if the section is gone — reported like any other disagreement rather
 * than thrown, so a run that also has baseline problems still prints them. The
 * header and delimiter are returned because they decide what the table renders:
 * Markdown drops body cells past the header's column count, so a header trimmed
 * back to its pre-baseline form would erase every recorded revision from the
 * rendered page while each row still read correctly here.
 */
function supportedNipsTable(readme) {
  const heading = readme.indexOf(TABLE_HEADING);
  if (heading === -1) return null;
  // A section that runs to the end of the file has no following heading; slicing
  // to `-1` would silently swallow the rest of the README instead.
  const next = readme.indexOf("\n## ", heading + 1);
  const section = readme.slice(heading, next === -1 ? undefined : next);
  const [header, delimiter, ...rows] = section
    .split("\n")
    .filter((line) => line.startsWith("|"));
  return { header, delimiter, rows };
}

/**
 * A Markdown table row's cells, including the empty ones its pipes bound. An
 * escaped `\\|` is cell content, not a boundary — splitting on it would both
 * miscount the row's columns and shift every cell after it.
 */
function cellsOf(line) {
  return line.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(join(root, BASELINE), "utf8"));
  // `null` parses fine and would reach the first property read as a TypeError,
  // which is the stack trace this whole branch exists to avoid.
  if (
    baseline === null ||
    typeof baseline !== "object" ||
    Array.isArray(baseline)
  )
    throw new Error("does not hold an object");
} catch (cause) {
  // Reported the same way as every other disagreement, rather than as a stack
  // trace from a file this check exists to read.
  console.error(`Spec baseline check failed (1 problem(s)):\n`);
  console.error(`  - ${BASELINE}: ${cause.message}`);
  process.exit(1);
}
// Normalized so a CRLF checkout fails on a real disagreement rather than on
// line endings, which would otherwise read as a missing section.
const readme = readFileSync(join(root, README), "utf8").replace(/\r\n/g, "\n");
const errors = [];

const sources = baseline.sources ?? {};
const families = Object.keys(sources);
if (families.length === 0) errors.push(`${BASELINE}: no \`sources\` recorded`);

for (const family of families) {
  const { label, repository } = sources[family] ?? {};
  if (!label) errors.push(`${BASELINE}: \`sources.${family}\` has no label`);
  else if (!LABEL.test(label))
    errors.push(
      `${BASELINE}: \`sources.${family}.label\` is \`${label}\`, which is not a series name`,
    );
  const named = label && LABEL.test(label);
  if (!repository)
    errors.push(`${BASELINE}: \`sources.${family}\` has no repository`);
  else if (!readme.includes(repository))
    errors.push(`${README}: does not link ${repository} (\`${family}\`)`);

  // Without a repository there is no link to read, and reporting each document
  // as unnamed would bury the one real problem under a message per entry.
  const enumerated = repository ? linkTexts(readme, repository) : null;
  const documents = baseline[family];
  if (!documents || Object.keys(documents).length === 0) {
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
    // require at least that the README's link to the family enumerates them.
    if (
      family !== TABLE_FAMILY &&
      named &&
      enumerated !== null &&
      !enumerated.includes(`${label}-${id}`)
    )
      errors.push(
        `${README}: its link to ${repository} does not name ${label}-${id}`,
      );
  }

  // The other direction for a family with no table: the link enumerating a
  // document that was never baselined.
  if (family !== TABLE_FAMILY && named && enumerated !== null) {
    const mentions = enumerated.matchAll(
      new RegExp(`${label}-([0-9A-Z]{2})`, "g"),
    );
    for (const [, id] of mentions) {
      if (!(id in documents))
        errors.push(
          `${README}: its link to ${repository} names ${label}-${id}, which has no entry in ${BASELINE}`,
        );
    }
  }

  // `src/` decides what must be baselined: a spec module with no entry ships
  // with no recorded provenance, and an entry with no module is dead weight.
  if (!named) continue;
  const modules = implemented(label);
  for (const [id, file] of modules) {
    if (!(id in documents))
      errors.push(
        `${BASELINE}: \`${SOURCE}/${file}\` has no \`${family}.${id}\` entry`,
      );
  }
  for (const id of Object.keys(documents)) {
    if (!modules.has(id))
      errors.push(
        `${BASELINE}: \`${family}.${id}\` has no \`${SOURCE}/${label.toLowerCase()}${id.toLowerCase()}.ts\``,
      );
  }
}

// Two documents sharing a hash means one was pasted from the other — the most
// likely way the field the whole design rests on gets corrupted, and one of the
// few things about it that can be judged without the text.
const hashes = new Map();
for (const family of families) {
  for (const [id, entry] of Object.entries(baseline[family] ?? {})) {
    const where = `${family}.${id}`;
    const first = hashes.get(entry?.sha256);
    if (first)
      errors.push(
        `${BASELINE}: \`${where}\` and \`${first}\` record the same sha256; two documents cannot have identical text`,
      );
    else if (entry?.sha256) hashes.set(entry.sha256, where);
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
const table = supportedNipsTable(readme);
if (table === null) errors.push(`${README}: no "Supported NIPs" section`);

// Which column carries the revision is read from the header rather than assumed,
// so dropping or moving it is reported instead of silently changing what is
// compared. A body row wider than the header renders with its extra cells cut.
const header = table?.header ? cellsOf(table.header) : [];
const column = header.indexOf(BASELINE_COLUMN);
if (table && column === -1)
  errors.push(
    `${README}: the Supported NIPs table has no \`${BASELINE_COLUMN}\` column`,
  );
const widths = new Set(
  [table?.header, table?.delimiter, ...(table?.rows ?? [])]
    .filter(Boolean)
    .map((line) => cellsOf(line).length),
);
if (widths.size > 1)
  errors.push(
    `${README}: the Supported NIPs table's rows do not all have the same number of columns, so Markdown drops the cells past its header`,
  );

const rows = table?.rows ?? null;
for (const row of rows ?? []) {
  const cells = cellsOf(row);
  const nip = cells[1]?.match(TABLE_ROW)?.[1];
  if (!nip) {
    errors.push(`${README}: cannot read a NIP number from row: ${row}`);
    continue;
  }
  if (tabled.has(nip))
    errors.push(`${README}: NIP-${nip} has more than one row in the table`);
  tabled.add(nip);
  const entry = baseline[TABLE_FAMILY]?.[nip];
  if (!entry) {
    errors.push(`${README}: NIP-${nip} has no entry in ${BASELINE}`);
    continue;
  }
  if (!repository || column === -1) continue; // already reported
  const expected = `[${entry.date}](${repository}/blob/${entry.commit}/${nip}.md)`;
  if (cells[column] !== expected)
    errors.push(
      `${README}: NIP-${nip}'s spec baseline cell disagrees with ${BASELINE}:\n` +
        `    ${README}: ${cells[column]}\n` +
        `    expected: ${expected}`,
    );
}

// The coverage paragraph is the README's third copy of the NIP list, and the
// one a reader meets first.
const candidates = coverageParagraphs(readme);
// More than one and there is no telling which summarizes coverage — enforcing
// either would leave the other free to go stale.
if (candidates.length > 1)
  errors.push(
    `${README}: ${candidates.length} paragraphs above the Supported NIPs table link to it and name NIPs; only the coverage summary should`,
  );
if (candidates.length === 0)
  errors.push(
    `${README}: no paragraph above the Supported NIPs table both links to it and names the covered NIPs`,
  );
const covers = candidates.length === 1 ? candidates[0] : null;
const covered = new Set(
  covers ? [...covers.matchAll(/NIP-([0-9A-Z]{2})/g)].map(([, id]) => id) : [],
);

// A section reported as missing above would otherwise make every baselined NIP
// look individually absent, burying the one problem there is.
for (const nip of Object.keys(baseline[TABLE_FAMILY] ?? {})) {
  if (rows && !tabled.has(nip))
    errors.push(
      `${README}: NIP-${nip} is baselined in ${BASELINE} but absent from the Supported NIPs table`,
    );
  if (covers && !covered.has(nip))
    errors.push(
      `${README}: NIP-${nip} is baselined in ${BASELINE} but absent from the intro coverage paragraph`,
    );
}
for (const nip of covered) {
  if (rows && !tabled.has(nip))
    errors.push(
      `${README}: the intro coverage paragraph names NIP-${nip}, which has no row in the Supported NIPs table`,
    );
}

if (errors.length > 0) {
  console.error(`Spec baseline check failed (${errors.length} problem(s)):\n`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    `\nEvery spec module under ${SOURCE}/ must be baselined in ${BASELINE}, and ${README} must quote what it records.`,
  );
  process.exit(1);
}

const counts = families
  .map((family) => `${Object.keys(baseline[family]).length} ${family}`)
  .join(", ");
console.log(
  `Spec baseline check passed — ${counts} baselined from ${SOURCE}/; ${tabled.size} NIPs cross-checked against ${README}.`,
);
