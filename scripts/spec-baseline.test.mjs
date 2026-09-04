import { describe, expect, it } from "vitest";
import { specBaselineProblems, specBaselineSummary } from "./spec-baseline.mjs";

// The contract of `scripts/spec-baseline.mjs`. Every rule it enforces is
// pinned here by the edit that should trip it, and every guarantee it makes
// about reading Markdown is pinned by an edit that should *not*. Without this,
// "the diagnostic could be better" is an open-ended question about a script
// nothing else exercises; with it, the answer is either a case listed below or
// a deliberate change to one.
//
// The function takes its three inputs as data, so a case is a small object
// rather than a fixture repository. Whether *this* repository agrees with
// itself is `npm run test:spec-baseline`'s question, not this file's — asking
// it here too would fail the earlier `npm test` step and hide the answer the
// CLI is written to give.

const COMMIT = "c3fd9af17939316bf6d0d83a5759100f8b0a1bdb";
const OTHER_COMMIT = "bd93433261872bf69bbe75e29376504b848d5353";
const HASH = "6cd76682e7ec2d635f1f46b3660f621cdad1193d9174d316674b91f8d683af26";
const OTHER_HASH =
  "e4e5b4f130a0f902cd295f8917f907a3bd53f0c37ad2117508716798464194ad";
const NIPS = "https://github.com/nostr-protocol/nips";
const LUDS = "https://github.com/lnurl/luds";

/** A repository that agrees with itself: one NIP, one LUD, one module each. */
function repository(overrides = {}) {
  const baseline = {
    sources: {
      nips: { label: "NIP", repository: NIPS },
      luds: { label: "LUD", repository: LUDS },
    },
    documents: {
      nips: { "01": { commit: COMMIT, date: "2026-09-04", sha256: HASH } },
      luds: {
        16: { commit: OTHER_COMMIT, date: "2026-07-16", sha256: OTHER_HASH },
      },
    },
  };
  const readme = [
    "# zod-nostr",
    "",
    "Covers NIP-01, and carries LUD-16 behind the profile fields.",
    "",
    "## Supported NIPs",
    "",
    "| NIP | Spec baseline | Coverage |",
    "| --- | --- | --- |",
    `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
    "",
    "## Development",
    "",
  ].join("\n");
  return {
    baseline,
    readme,
    files: ["nip01.ts", "lud16.ts"],
    ...overrides,
  };
}

/** The repository with one baseline entry field replaced. */
function withEntry(family, id, patch) {
  const input = repository();
  const documents = input.baseline.documents[family];
  documents[id] = { ...documents[id], ...patch };
  return input;
}

describe("specBaselineProblems", () => {
  it("reports nothing when the three agree", () => {
    expect(specBaselineProblems(repository())).toEqual([]);
  });

  describe("the entries it can judge without the spec text", () => {
    // A malformed `commit` or `date` also stops the README cell matching, so
    // these cases pin the entry's own diagnostic as the first one reported.
    it.each([
      [{ commit: "c3fd9af" }, "has no 40-character commit"],
      [{ sha256: "abc" }, "has no 64-character sha256"],
      [{ date: "yesterday" }, "has no YYYY-MM-DD calendar date"],
      [{ date: "2026-90-04" }, "has no YYYY-MM-DD calendar date"],
      [{ date: "2026-02-30" }, "has no YYYY-MM-DD calendar date"],
    ])("rejects %o", (patch, message) => {
      const problems = specBaselineProblems(withEntry("nips", "01", patch));
      expect(problems[0]).toBe(`spec-baseline.json: \`nips.01\` ${message}`);
    });

    // The link a cell is compared against is built from these, so reporting
    // them and then demanding `blob/undefined` in the README would be absurd.
    it.each([
      [{ commit: undefined }, "has no 40-character commit"],
      [{ date: "2026-90-04" }, "has no YYYY-MM-DD calendar date"],
    ])("does not compare a cell against %o", (patch, message) => {
      expect(specBaselineProblems(withEntry("nips", "01", patch))).toEqual([
        `spec-baseline.json: \`nips.01\` ${message}`,
      ]);
    });

    // A day of slack: a maintainer east of UTC reads today's date off a commit
    // page while UTC is still on yesterday.
    it("accepts today and tomorrow", () => {
      const day = (offset) =>
        new Date(Date.now() + offset).toISOString().slice(0, 10);
      for (const date of [day(0), day(86_400_000)]) {
        const input = withEntry("nips", "01", { date });
        input.readme = input.readme.replace("[2026-09-04]", `[${date}]`);
        expect(specBaselineProblems(input)).toEqual([]);
      }
    });

    it("rejects a day that has not happened", () => {
      const input = withEntry("nips", "01", { date: "2999-01-01" });
      input.readme = input.readme.replace("[2026-09-04]", "[2999-01-01]");
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `nips.01` has no YYYY-MM-DD calendar date",
      ]);
    });

    it("accepts a leap day that does exist", () => {
      const input = withEntry("nips", "01", { date: "2024-02-29" });
      input.readme = input.readme.replace("[2026-09-04]", "[2024-02-29]");
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("does not call two malformed entries a paste of each other", () => {
      const input = withEntry("nips", "01", { sha256: "nope" });
      input.baseline.documents.luds["16"].sha256 = "nope";
      const problems = specBaselineProblems(input);
      expect(problems.filter((p) => p.includes("same sha256"))).toEqual([]);
    });

    it("rejects two documents recording the same sha256", () => {
      const problems = specBaselineProblems(
        withEntry("luds", "16", { sha256: HASH }),
      );
      expect(problems).toEqual([
        expect.stringContaining("`luds.16` and `nips.01` record the same"),
      ]);
    });
  });

  describe("the modules under src/ decide what must be baselined", () => {
    it("reports a spec module with no entry", () => {
      const input = repository();
      input.files.push("nip09.ts");
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `src/nip09.ts` has no `nips.09` entry",
      ]);
    });

    it("reports an entry with no module", () => {
      const input = repository();
      input.files = ["lud16.ts"];
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("`nips.01` has no `src/nip01.ts`"),
      ]);
    });

    it("finds a module in a subdirectory", () => {
      const input = repository();
      input.files = ["nips/nip01.ts", "lud16.ts"];
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("finds a module whose hex id is uppercase", () => {
      const input = repository();
      input.baseline.documents.nips = {
        "7D": { commit: COMMIT, date: "2026-09-04", sha256: HASH },
      };
      input.files = ["nip7D.ts", "lud16.ts"];
      input.readme = input.readme
        .replace("**NIP-01**", "**NIP-7D**")
        .replace("/01.md", "/7D.md")
        .replace("Covers NIP-01,", "Covers NIP-7D,");
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("ignores a module that is not named for a document", () => {
      const input = repository();
      input.files.push("bech32.ts", "internet-identifier.ts", "nip01.test.ts");
      expect(specBaselineProblems(input)).toEqual([]);
    });
  });

  describe("sources and documents must name the same families", () => {
    it.each([["sources"], ["documents"]])(
      "reports a baseline with no `%s` at all",
      (key) => {
        const input = repository();
        delete input.baseline[key];
        expect(specBaselineProblems(input)).toEqual([
          "spec-baseline.json: has no `sources` and `documents` to compare",
        ]);
      },
    );

    it("reports a family that only `documents` knows about", () => {
      const input = repository();
      input.baseline.documents.buds = {
        "01": { commit: COMMIT, date: "2026-09-04", sha256: HASH },
      };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `documents.buds` has no `sources` entry",
      ]);
    });

    // `in` would find these on `Object.prototype` and skip the family in
    // silence, leaving its entries and modules unexamined.
    it.each([["toString"], ["constructor"]])(
      "reports a `documents.%s` family with no `sources` entry",
      (family) => {
        const input = repository();
        input.baseline.documents[family] = {
          "01": { commit: COMMIT, date: "2026-09-04", sha256: HASH },
        };
        expect(specBaselineProblems(input)).toEqual([
          `spec-baseline.json: \`documents.${family}\` has no \`sources\` entry`,
        ]);
      },
    );

    it.each([["toString"], ["constructor"]])(
      "reports a `sources.%s` family with no `documents` entry",
      (family) => {
        const input = repository();
        input.baseline.sources[family] = { label: "BUD", repository: LUDS };
        expect(specBaselineProblems(input)).toEqual([
          `spec-baseline.json: \`sources.${family}\` has no \`documents\` entry`,
        ]);
      },
    );

    it("reports a family that only `sources` knows about", () => {
      const input = repository();
      input.baseline.sources.buds = { label: "BUD", repository: "https://x" };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.buds` has no `documents` entry",
      ]);
    });

    // Everything about the table reads the `nips` family by name, so a
    // mismatch there must stop before it, not throw past its own report.
    it("reports a misspelled `documents` key for the table family", () => {
      const input = repository();
      input.baseline.documents.nip = input.baseline.documents.nips;
      delete input.baseline.documents.nips;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `documents.nip` has no `sources` entry",
        "spec-baseline.json: `sources.nips` has no `documents` entry",
      ]);
    });

    it("reports the table family missing from both sides", () => {
      const input = repository();
      input.baseline.sources.nip = input.baseline.sources.nips;
      input.baseline.documents.nip = input.baseline.documents.nips;
      delete input.baseline.sources.nips;
      delete input.baseline.documents.nips;
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("no `nips` family"),
      ]);
    });

    it("reports a misspelled `sources` key for the table family", () => {
      const input = repository();
      input.baseline.sources.nip = input.baseline.sources.nips;
      delete input.baseline.sources.nips;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `documents.nips` has no `sources` entry",
        "spec-baseline.json: `sources.nip` has no `documents` entry",
      ]);
    });
  });

  describe("a family that does not describe itself", () => {
    it("reports a missing label instead of crashing on it", () => {
      const input = repository();
      input.baseline.sources.luds = { repository: LUDS };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.luds` has no label",
      ]);
    });

    it("reports a missing repository", () => {
      const input = repository();
      input.baseline.sources.luds = { label: "LUD" };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.luds` has no repository",
      ]);
    });

    // The table's own family reaches further into the checks than any other,
    // so its half-finished edits get their own cases.
    it("reports the table family's missing repository once, not per row", () => {
      const input = repository();
      input.baseline.sources.nips = { label: "NIP" };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.nips` has no repository",
      ]);
    });

    // One spelling for what has already been reported: the module and the row
    // are both there, so neither is an orphan of a missing entry.
    // Only a case difference names the id it should have had; `1` for `01`
    // names none, so the module and the row are reported on their own terms.
    it("reports a typo of another shape alongside what it orphans", () => {
      const input = repository();
      input.baseline.documents.nips = {
        1: { commit: COMMIT, date: "2026-09-04", sha256: HASH },
      };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `nips.1` is not a two-character document id",
        expect.stringContaining("`src/nip01.ts` has no `nips.01` entry"),
        "README.md: NIP-01 has no entry in spec-baseline.json",
      ]);
    });

    it("reports a lowercase id whose entry is also malformed just once", () => {
      const input = repository();
      input.baseline.documents.nips = { "7d": null };
      input.files = ["nip7d.ts", "lud16.ts"];
      input.readme = input.readme
        .replace("**NIP-01**", "**NIP-7D**")
        .replace("/01.md", "/7D.md")
        .replace("Covers NIP-01,", "Covers NIP-7D,");
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `nips.7d` records no revision",
      ]);
    });

    it("reports a table family that is not an object without blaming the README", () => {
      const input = repository();
      input.baseline.documents.nips = "todo";
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `documents.nips` holds no entries",
      ]);
    });

    it.each([["sources"], ["documents"]])(
      "reports a `%s` that is not an object",
      (key) => {
        const input = repository();
        input.baseline[key] = "todo";
        expect(specBaselineProblems(input)).toEqual([
          "spec-baseline.json: has no `sources` and `documents` to compare",
        ]);
      },
    );

    it("reports a label that is not a series name", () => {
      const input = repository();
      input.baseline.sources.luds.label = "LUD(";
      // Reported once: the checks that would use the label are skipped, not
      // attempted with a label that cannot name anything.
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("is not a series name"),
      ]);
    });

    // A regex coerces what it tests, so neither of these is a series name even
    // though `LABEL` alone would say so.
    it.each([
      ["true", true],
      ["an array", ["NIP"]],
    ])("reports a label that is %s", (_description, label) => {
      const input = repository();
      input.baseline.sources.luds.label = label;
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("which is not a series name"),
      ]);
    });

    it("reports an empty repository once, not twice", () => {
      const input = repository();
      input.baseline.sources.nips.repository = "";
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.nips` has no repository",
      ]);
    });

    it("reports a repository that trims away to nothing", () => {
      const input = repository();
      input.baseline.sources.nips.repository = "/";
      input.readme = input.readme.replace("[2026-09-04]", "[1999-01-01]");
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.nips` has no repository",
      ]);
    });

    it("reports a repository that is not a string instead of crashing on it", () => {
      const input = repository();
      input.baseline.sources.nips.repository = 42;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.nips` has no repository",
      ]);
    });

    it("reports a family that is not an object instead of crashing on it", () => {
      const input = repository();
      input.baseline.sources.luds = null;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.luds` describes no family",
      ]);
    });

    // Keyed by family as well as id: one family's bad entry is no reason to
    // stop reporting what another family's entry of the same number says.
    it("does not let one family's bad entry silence another's", () => {
      const input = repository();
      input.baseline.documents.luds["01"] = null;
      input.readme = input.readme.replace("[2026-09-04]", "[2020-01-01]");
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `luds.01` records no revision",
        expect.stringContaining("NIP-01's spec baseline cell disagrees"),
      ]);
    });

    it.each([
      ["null", null],
      ["a string", "todo"],
    ])("reports an entry that is %s", (_label, entry) => {
      const input = repository();
      input.baseline.documents.luds["16"] = entry;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `luds.16` records no revision",
      ]);
    });

    // The row is there, so telling its reader the NIP has no entry is false.
    it("does not also call a malformed entry's row unbaselined", () => {
      const input = repository();
      input.baseline.documents.nips["01"] = null;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `nips.01` records no revision",
      ]);
    });
  });

  describe("a document id is spelled like its upstream filename", () => {
    it("rejects a lowercase hex id without blaming files that exist", () => {
      const input = repository();
      input.baseline.documents.nips = {
        "7d": { commit: COMMIT, date: "2026-09-04", sha256: HASH },
      };
      input.files = ["nip7d.ts", "lud16.ts"];
      input.readme = input.readme
        .replace("**NIP-01**", "**NIP-7D**")
        .replace("/01.md", "/7D.md")
        .replace("Covers NIP-01,", "Covers NIP-7D,");
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `nips.7d` is not a two-character document id",
      ]);
    });
  });

  describe("a family with no table row", () => {
    it("must be named in the README", () => {
      const input = repository();
      input.readme = input.readme.replace("LUD-16", "the lightning address");
      expect(specBaselineProblems(input)).toEqual([
        "README.md: never mentions LUD-16",
      ]);
    });

    // Held to the same prose the NIPs are: inside a fence, or inside a cell of
    // the table, is no more a mention for one family than for the other.
    it.each([
      [
        "inside a fence",
        (text) =>
          text
            .replace("carries LUD-16", "carries")
            .replace(
              "## Supported NIPs",
              "```md\nLUD-16\n```\n\n## Supported NIPs",
            ),
      ],
      [
        "inside a table cell",
        (text) =>
          text
            .replace("carries LUD-16", "carries")
            .replace("| Events |", "| Events, LUD-16 |"),
      ],
    ])("is not satisfied by a mention %s", (_label, mangle) => {
      const input = repository();
      input.readme = mangle(input.readme);
      expect(specBaselineProblems(input)).toEqual([
        "README.md: never mentions LUD-16",
      ]);
    });

    it("may be named anywhere, in any prose", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "carries LUD-16 behind the profile fields",
        "does not decode to a LUD-01 URL, and carries LUD-16",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });
  });

  describe("the Supported NIPs table", () => {
    it("must quote the revision its entry records", () => {
      const input = repository();
      input.readme = input.readme.replace("[2026-09-04]", "[2020-01-01]");
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("NIP-01's spec baseline cell disagrees"),
      ]);
    });

    it("must have a row for every baselined NIP", () => {
      const input = repository();
      input.readme = input.readme.replace(/^\| \*\*NIP-01\*\*.*$/m, "");
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("NIP-01 is baselined"),
      ]);
    });

    it("must not have a row for an unbaselined NIP", () => {
      const input = repository();
      input.readme = input.readme.replace("**NIP-01**", "**NIP-99**");
      expect(specBaselineProblems(input)).toEqual([
        "README.md: NIP-99 has no entry in spec-baseline.json",
        expect.stringContaining("NIP-01 is baselined"),
      ]);
    });

    it("reports a row whose first cell is not a NIP", () => {
      const input = repository();
      input.readme = input.readme.replace("**NIP-01**", "NIP one");
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("cannot read a NIP number from row"),
        expect.stringContaining("NIP-01 is baselined"),
      ]);
    });

    it("reports a renamed Spec baseline column once, not per row", () => {
      const input = repository();
      input.readme = input.readme.replace("| Spec baseline |", "| Revision |");
      expect(specBaselineProblems(input)).toEqual([
        "README.md: the Supported NIPs table has no `Spec baseline` column",
      ]);
    });

    it("reads the column position from the header, so the column may move", () => {
      const input = repository();
      input.readme = input.readme
        .replace(
          "| NIP | Spec baseline | Coverage |",
          "| NIP | Coverage | Spec baseline |",
        )
        .replace(
          `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
          `| **NIP-01** | Events | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) |`,
        );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("is found by its shape, not by being the first pipe-led block", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "| NIP | Spec baseline | Coverage |",
        [
          "| Legend | Meaning |",
          "| --- | --- |",
          "| x | y |",
          "",
          "| NIP | Spec baseline | Coverage |",
        ].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    // A fence closes on its own character and length, so what a block shows is
    // not read as ending it.
    it.each([
      ["another fence style inside it", "~~~"],
      ["a shorter run of its own character", "``"],
      ["indented code that looks like one", "    ```"],
    ])("is not confused by %s", (_label, inner) => {
      const input = repository();
      input.readme = input.readme.replace(
        "## Supported NIPs",
        ["```md", inner, "```", "", "## Supported NIPs"].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("is not anchored on a fenced sample of its heading above it", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "## Supported NIPs",
        ["```md", "## Supported NIPs", "```", "", "## Supported NIPs"].join(
          "\n",
        ),
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    // Markdown reads a delimiter only under the header, so one further down is
    // an ordinary row — breaking on it would drop every row below.
    it("keeps reading past a second delimiter row", () => {
      const input = repository();
      input.baseline.documents.nips["05"] = {
        commit: OTHER_COMMIT,
        date: "2026-06-13",
        sha256: HASH.replace(/^6/, "9"),
      };
      input.files.push("nip05.ts");
      input.readme = input.readme.replace("NIP-01,", "NIP-01, NIP-05,");
      input.readme = input.readme.replace(
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |\n| --- | --- | --- |\n| **NIP-05** | [2020-01-01](${NIPS}/blob/${COMMIT}/05.md) | Ids |`,
      );
      expect(specBaselineProblems(input)).toEqual([
        "README.md: cannot read a NIP number from row: | --- | --- | --- |",
        expect.stringContaining("NIP-05's spec baseline cell disagrees"),
      ]);
    });

    it("keeps reading rows past a fence between them", () => {
      const input = repository();
      input.baseline.documents.nips["05"] = {
        commit: OTHER_COMMIT,
        date: "2026-06-13",
        sha256: HASH.replace(/^6/, "a"),
      };
      input.files.push("nip05.ts");
      input.readme = input.readme.replace("NIP-01,", "NIP-01, NIP-05,");
      input.readme = input.readme.replace(
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |\n\`\`\`\n| not | a | row |\n\`\`\`\n| **NIP-05** | [2020-01-01](${NIPS}/blob/${COMMIT}/05.md) | Ids |`,
      );
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("breaks off before its rows end"),
        expect.stringContaining("NIP-05's spec baseline cell disagrees"),
      ]);
    });

    it("does not read a fence abutting its last row as rows", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "| Events |\n",
        "| Events |\n```\n| not | a | row |\n```\n",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("is not cut short by a fenced sample of its own heading", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "| NIP | Spec baseline | Coverage |",
        [
          "```md",
          "## Supported NIPs",
          "```",
          "",
          "| NIP | Spec baseline | Coverage |",
        ].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("is not a fenced example of itself", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "| NIP | Spec baseline | Coverage |",
        [
          "```markdown",
          "| NIP | Spec baseline | Coverage |",
          "| --- | --- | --- |",
          "| **NIP-99** | [2020-01-01](https://example.com/99.md) | Example |",
          "```",
          "",
          "| NIP | Spec baseline | Coverage |",
        ].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("reads the NIP column from the header too, so it may move", () => {
      const input = repository();
      input.readme = input.readme
        .replace(
          "| NIP | Spec baseline | Coverage |",
          "| Coverage | NIP | Spec baseline |",
        )
        .replace(
          `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
          `| Events | **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) |`,
        );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("is not a table at all without its delimiter row", () => {
      const input = repository();
      input.readme = input.readme.replace("| --- | --- | --- |\n", "");
      expect(specBaselineProblems(input)).toEqual([
        'README.md: no "Supported NIPs" section with a NIP table',
      ]);
    });

    it("reports a missing section once, not per NIP", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "## Supported NIPs",
        "## Supported specs",
      );
      expect(specBaselineProblems(input)).toEqual([
        'README.md: no "Supported NIPs" section with a NIP table',
      ]);
    });

    // A section ends at a heading of the same or higher level, however it is
    // written — otherwise a table further down is adopted as this one.
    it.each([
      ["an h1", "# Appendix"],
      ["a setext h2", "Appendix\n--------"],
    ])(
      "does not read a table from a later section headed by %s",
      (_l, heading) => {
        const input = repository();
        input.readme = input.readme
          .replace(/^\|.*$/gm, "")
          .replace("## Development", `${heading}\n\n## Development`)
          .replace(
            "## Development",
            [
              "## Development",
              "",
              "| NIP | Spec baseline | Coverage |",
              "| --- | --- | --- |",
              `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
            ].join("\n"),
          );
        expect(specBaselineProblems(input)).toEqual([
          'README.md: no "Supported NIPs" section with a NIP table',
        ]);
      },
    );

    // A row is not a heading's content, so dashes under one break the page,
    // not the table — deleting the row above them would be a false absence.
    // A section split into two tables names its NIPs across both, so reading
    // only the first would report every row of the second as missing.
    it("reads every table in the section", () => {
      const input = repository();
      input.baseline.documents.nips["05"] = {
        commit: OTHER_COMMIT,
        date: "2026-06-13",
        sha256: HASH.replace(/^6/, "b"),
      };
      input.files.push("nip05.ts");
      input.readme = input.readme.replace("NIP-01,", "NIP-01, NIP-05,");
      input.readme = input.readme.replace(
        "\n\n## Development",
        [
          "",
          "### Extensions",
          "",
          "| NIP | Spec baseline | Coverage |",
          "| --- | --- | --- |",
          `| **NIP-05** | [2026-06-13](${NIPS}/blob/${OTHER_COMMIT}/05.md) | Ids |`,
          "",
          "## Development",
        ].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    // Leaving the scan on a fence's closing marker would have the next table
    // read it as an opening one, and every fence after it the wrong way round.
    it("keeps its fence parity past a fence abutting a row", () => {
      const input = repository();
      input.baseline.documents.nips["05"] = {
        commit: OTHER_COMMIT,
        date: "2026-06-13",
        sha256: HASH.replace(/^6/, "c"),
      };
      input.files.push("nip05.ts");
      input.readme = input.readme.replace("NIP-01,", "NIP-01, NIP-05,");
      input.readme = input.readme.replace(
        "\n\n## Development",
        [
          "",
          "```js",
          "x",
          "```",
          "",
          "| NIP | Spec baseline | Coverage |",
          "| --- | --- | --- |",
          `| **NIP-05** | [2026-06-13](${NIPS}/blob/${OTHER_COMMIT}/05.md) | Ids |`,
          "",
          "## Development",
        ].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("still ignores a fenced example after a fence abutting a row", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "\n\n## Development",
        [
          "",
          "```js",
          "x",
          "```",
          "",
          "```md",
          "| NIP | Spec baseline | Coverage |",
          "| --- | --- | --- |",
          "| **NIP-99** | [2020-01-01](https://example.com/99.md) | Example |",
          "```",
          "",
          "## Development",
        ].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("waits for every table to be readable before calling a NIP absent", () => {
      const input = repository();
      input.baseline.documents.nips["05"] = {
        commit: OTHER_COMMIT,
        date: "2026-06-13",
        sha256: HASH.replace(/^6/, "d"),
      };
      input.files.push("nip05.ts");
      input.readme = input.readme.replace("NIP-01,", "NIP-01, NIP-05,");
      input.readme = input.readme.replace(
        "\n\n## Development",
        [
          "",
          "",
          "| Number | Spec baseline | Coverage |",
          "| --- | --- | --- |",
          `| **NIP-05** | [2026-06-13](${NIPS}/blob/${OTHER_COMMIT}/05.md) | Ids |`,
          "",
          "## Development",
        ].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([
        "README.md: the Supported NIPs table has no `NIP` column",
      ]);
    });

    it("reports a row with no Spec baseline cell as that, not as drift", () => {
      const input = repository();
      input.readme = input.readme.replace(
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
        "| **NIP-01** |",
      );
      expect(specBaselineProblems(input)).toEqual([
        "README.md: NIP-01's row has no `Spec baseline` cell",
      ]);
    });

    // Dashes under anything that is not a paragraph are a thematic break, so
    // reading one as a heading's underline would end the section early.
    it.each([
      ["a fenced block", "```js\nx\n```"],
      ["an HTML comment", "<!-- a note -->"],
      ["a list item", "- a bullet"],
      ["a quote", "> quoted"],
    ])("keeps reading past a thematic break under %s", (_label, above) => {
      const input = repository();
      input.readme = input.readme.replace(
        "| NIP | Spec baseline | Coverage |",
        `${above}\n---\n\n| NIP | Spec baseline | Coverage |`,
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    // GFM renders a table only when the delimiter has as many cells as the
    // header, so a column added to one and not the other renders as nothing.
    it("reports a delimiter with fewer cells than its header", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "| --- | --- | --- |",
        "| --- | --- |",
      );
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("does not have as many cells as its header"),
      ]);
    });

    it("reads a delimiter that leaves off its trailing pipe", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "| --- | --- | --- |",
        "| --- | --- | ---",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    // The table is not the README's only list of these, and a NIP added to
    // every file the check reads can still leave the sentence above it stale.
    // Rows are removed by where they are, not by what they say: removing the
    // first line that reads like one would leave a repeat of it in the prose,
    // standing in for the mention the table cannot give.
    it("does not let a repeated row stand in for a mention", () => {
      const input = repository();
      const row = `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`;
      input.readme = input.readme
        .replace("Covers NIP-01, and", "Covers and")
        .replace(row, `${row}\n${row}`);
      expect(specBaselineProblems(input)).toEqual([
        "README.md: never mentions NIP-01 outside the table",
      ]);
    });

    it("does not let a fenced copy of a row stand in for a mention", () => {
      const input = repository();
      const row = `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`;
      input.readme = input.readme
        .replace("Covers NIP-01, and", "Covers and")
        .replace(
          "## Supported NIPs",
          `\`\`\`md\n${row}\n\`\`\`\n\n## Supported NIPs`,
        );
      expect(specBaselineProblems(input)).toEqual([
        "README.md: never mentions NIP-01 outside the table",
      ]);
    });

    it("requires a NIP to be named outside the table", () => {
      const input = repository();
      input.readme = input.readme.replace("Covers NIP-01, and", "Covers and");
      expect(specBaselineProblems(input)).toEqual([
        "README.md: never mentions NIP-01 outside the table",
      ]);
    });

    it("reports a missing column once, not once per table", () => {
      const input = repository();
      input.readme = input.readme
        .replace("| Spec baseline | Coverage |", "| Revision | Coverage |")
        .replace(
          "\n\n## Development",
          [
            "",
            "",
            "| NIP | Revision | Coverage |",
            "| --- | --- | --- |",
            "| **NIP-01** | x | Events |",
            "",
            "## Development",
          ].join("\n"),
        );
      expect(
        specBaselineProblems(input).filter((problem) =>
          problem.includes("`Spec baseline` column"),
        ),
      ).toHaveLength(1);
    });

    it("reads a row that leaves off its trailing pipe", () => {
      const input = repository();
      input.readme = input.readme.replace(
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events`,
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("finds a heading written with a closing run of hashes", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "## Supported NIPs",
        "## Supported NIPs ##",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("keeps its heading under a thematic break", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "## Supported NIPs\n",
        "## Supported NIPs\n---\n",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    // The rows are read by the family's label, so renaming it renames both
    // halves rather than letting the modules and the table drift apart.
    it("reads rows by the family's label", () => {
      const input = repository();
      input.baseline.sources.nips.label = "NOSTR";
      input.files = ["nostr01.ts", "lud16.ts"];
      input.readme = input.readme
        .replace("| NIP | Spec baseline", "| NOSTR | Spec baseline")
        .replace("**NIP-01**", "**NOSTR-01**")
        .replace("Covers NIP-01,", "Covers NOSTR-01,");
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("builds a link from a repository written with a trailing slash", () => {
      const input = repository();
      input.baseline.sources.nips.repository = `${NIPS}/`;
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("keeps its last row under a thematic break", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "\n\n## Development",
        "\n---\n\n## Development",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("reports a renamed NIP column as one, not as a missing table", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "| NIP | Spec baseline | Coverage |",
        "| **NIP** | Spec baseline | Coverage |",
      );
      // Once, not once per NIP: which row names which is exactly what the
      // missing column made unknowable.
      expect(specBaselineProblems(input)).toEqual([
        "README.md: the Supported NIPs table has no `NIP` column",
      ]);
    });

    it("keeps reading past a subsection of its own", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "| NIP | Spec baseline | Coverage |",
        "### The table\n\n| NIP | Spec baseline | Coverage |",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    // Markdown renders a row of empty cells as a row, so reading it as the
    // start of another table would stop the scan while the table goes on.
    it("does not mistake a row of empty cells for a delimiter", () => {
      const input = repository();
      input.readme = input.readme.replace(
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
        `|  |  |  |\n| **NIP-01** | [2020-01-01](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
      );
      expect(specBaselineProblems(input)).toEqual([
        "README.md: cannot read a NIP number from row: |  |  |  |",
        expect.stringContaining("NIP-01's spec baseline cell disagrees"),
      ]);
    });

    // Indented four spaces it is a code block: it shows the heading rather
    // than being one, the same as a fenced sample does.
    it("is not anchored on an indented sample of its heading", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "## Supported NIPs",
        "    ## Supported NIPs\n\n## Supported NIPs",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("does not accept a mention made in indented code", () => {
      const input = repository();
      input.readme = input.readme
        .replace("Covers NIP-01, and", "Covers and")
        .replace("## Supported NIPs", "    NIP-01\n\n## Supported NIPs");
      expect(specBaselineProblems(input)).toEqual([
        "README.md: never mentions NIP-01 outside the table",
      ]);
    });

    it("does not call a fenced sample of its heading a second section", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "## Development",
        "```md\n## Supported NIPs\n```\n\n## Development",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("reports a second section after a setext heading closes the first", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "## Development",
        [
          "Other",
          "-----",
          "",
          "## Supported NIPs",
          "",
          "| NIP | Spec baseline | Coverage |",
          "| --- | --- | --- |",
          "| **NIP-01** | [1999-01-01](https://bogus) | Events |",
          "",
          "## Development",
        ].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining('more than one "Supported NIPs" section'),
      ]);
    });

    it("reports a second section of the same name", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "## Development",
        [
          "## Supported NIPs",
          "",
          "| NIP | Spec baseline | Coverage |",
          "| --- | --- | --- |",
          "| **NIP-99** | x | Example |",
          "",
          "## Development",
        ].join("\n"),
      );
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining('more than one "Supported NIPs" section'),
      ]);
    });

    it("does not read a table from a later section", () => {
      const input = repository();
      input.readme = input.readme
        .replace("## Supported NIPs", "## Supported specs")
        .replace(
          "## Development",
          [
            "## Development",
            "",
            "| NIP | Spec baseline |",
            "| --- | --- |",
          ].join("\n"),
        );
      expect(specBaselineProblems(input)).toEqual([
        'README.md: no "Supported NIPs" section with a NIP table',
      ]);
    });

    // Markdown ends a table at a blank or indented line too, so the rows after
    // one do not render as rows — saying each is "absent" would point at the
    // wrong fix.
    it.each([
      ["a blank line inside it", "\n| **NIP-01**"],
      ["a row indented out of it", "    | **NIP-01**"],
    ])("reports being broken off by %s", (_label, replacement) => {
      const input = repository();
      input.readme = input.readme.replace("| **NIP-01**", replacement);
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("breaks off before its rows end"),
      ]);
    });

    // Markdown allows a block three spaces of indentation and ignores trailing
    // space, so neither is a break — and neither should fail the build.
    it.each([
      ["indented up to three spaces", (t) => t.replace(/^\| /gm, "  | ")],
      ["trailing whitespace", (t) => t.replace(/^(\|.*\|)$/gm, "$1  ")],
    ])("accepts a table %s", (_label, reformat) => {
      const input = repository();
      input.readme = reformat(input.readme);
      expect(specBaselineProblems(input)).toEqual([]);
    });

    // A break stops the table rendering, but the rows past it still say which
    // NIPs the README names, so a NIP missing from all of them is still its own
    // problem rather than one hidden until the break is fixed.
    it("still reports a NIP no row names at all", () => {
      const input = repository();
      input.baseline.documents.nips["05"] = {
        commit: OTHER_COMMIT,
        date: "2026-06-13",
        sha256: HASH.replace(/^6/, "7"),
      };
      input.files.push("nip05.ts");
      input.readme = input.readme.replace("NIP-01,", "NIP-01, NIP-05,");
      input.readme = input.readme.replace("| **NIP-01**", "\n| **NIP-01**");
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("breaks off before its rows end"),
        expect.stringContaining("NIP-05 is baselined"),
      ]);
    });

    it("reports a family whose entries are not an object", () => {
      const input = repository();
      input.baseline.documents.luds = null;
      input.files.push("lud99.ts");
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `documents.luds` holds no entries",
      ]);
    });

    // Found from where the scan is, not from the section start: a line that
    // repeats an earlier one would otherwise be judged by that one's successor.
    it("reports a break even when the orphaned line repeats the header", () => {
      const input = repository();
      input.readme = input.readme.replace(
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |\n\n| NIP | Spec baseline | Coverage |`,
      );
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("breaks off before its rows end"),
        expect.stringContaining("cannot read a NIP number from row"),
      ]);
    });

    it("does not call a second table below it a break", () => {
      const input = repository();
      input.readme = input.readme.replace(
        "\n## Development",
        "\n| Legend | Meaning |\n| --- | --- |\n| x | y |\n\n## Development",
      );
      expect(specBaselineProblems(input)).toEqual([]);
    });

    // Rows past prose still say which NIPs the README names, so drift in them
    // is reported rather than lost behind a row that looks absent.
    it("keeps reading rows past a line that is not one", () => {
      const input = repository();
      input.baseline.documents.nips["05"] = {
        commit: OTHER_COMMIT,
        date: "2026-06-13",
        sha256: HASH.replace(/^6/, "8"),
      };
      input.files.push("nip05.ts");
      input.readme = input.readme.replace("NIP-01,", "NIP-01, NIP-05,");
      input.readme = input.readme.replace(
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |`,
        `| **NIP-01** | [2026-09-04](${NIPS}/blob/${COMMIT}/01.md) | Events |\n<!-- a note -->\n| **NIP-05** | [2020-01-01](${NIPS}/blob/${COMMIT}/05.md) | Identifiers |`,
      );
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("breaks off before its rows end"),
        expect.stringContaining("NIP-05's spec baseline cell disagrees"),
      ]);
    });

    it("treats an escaped pipe as cell content, not a column boundary", () => {
      const input = repository();
      input.readme = input.readme.replace("| Events |", "| Events (a \\| b) |");
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("reads a CRLF checkout the same as an LF one", () => {
      const input = repository();
      input.readme = input.readme.replace(/\n/g, "\r\n");
      expect(specBaselineProblems(input)).toEqual([]);
    });
  });
});

describe("specBaselineSummary", () => {
  it("counts each family and the NIPs cross-checked", () => {
    expect(specBaselineSummary(repository())).toBe(
      "Spec baseline check passed — 1 nips, 1 luds baselined from src/; " +
        "1 NIPs cross-checked against README.md.",
    );
  });
});
