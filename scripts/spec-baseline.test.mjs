import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { specBaselineProblems } from "./spec-baseline.mjs";

// The contract of `scripts/spec-baseline.mjs`. Every rule it enforces is
// pinned here by the edit that should trip it, and every guarantee it makes
// about reading Markdown is pinned by an edit that should *not*. Without this,
// "the diagnostic could be better" is an open-ended question about a script
// nothing else exercises; with it, the answer is either a case listed below or
// a deliberate change to one.
//
// The function takes its three inputs as data, so a case is a small object
// rather than a fixture repository.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
    it("reports a family that only `documents` knows about", () => {
      const input = repository();
      input.baseline.documents.buds = {
        "01": { commit: COMMIT, date: "2026-09-04", sha256: HASH },
      };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `documents.buds` has no `sources` entry",
      ]);
    });

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
      const problems = specBaselineProblems(input);
      expect(problems).toContainEqual(
        "spec-baseline.json: `nips.7d` is not a two-character document id",
      );
      expect(problems).not.toContainEqual(
        expect.stringContaining("`nips.7d` has no `src/nip7d.ts`"),
      );
      expect(problems).not.toContainEqual(
        expect.stringContaining("NIP-7d is baselined"),
      );
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

  it("passes against this repository", () => {
    expect(
      specBaselineProblems({
        baseline: JSON.parse(
          readFileSync(join(root, "spec-baseline.json"), "utf8"),
        ),
        readme: readFileSync(join(root, "README.md"), "utf8"),
        files: readdirSync(join(root, "src"), { recursive: true }),
      }),
    ).toEqual([]);
  });
});
