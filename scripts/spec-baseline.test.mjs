import { describe, expect, it } from "vitest";
import { specBaselineProblems, specBaselineSummary } from "./spec-baseline.mjs";

// The contract of `scripts/spec-baseline.mjs`. Every rule it enforces is pinned
// here by the edit that should trip it. Without this, "could that diagnostic be
// better?" is an open-ended question about a script nothing else exercises;
// with it, the answer is either a case listed below or a deliberate change to
// one.
//
// The function takes its two inputs as data, so a case is a small object rather
// than a fixture repository. Whether *this* repository agrees with itself is
// `npm run test:spec-baseline`'s question, not this file's.

const COMMIT = "c3fd9af17939316bf6d0d83a5759100f8b0a1bdb";
const OTHER_COMMIT = "bd93433261872bf69bbe75e29376504b848d5353";
const HASH = "6cd76682e7ec2d635f1f46b3660f621cdad1193d9174d316674b91f8d683af26";
const OTHER_HASH =
  "e4e5b4f130a0f902cd295f8917f907a3bd53f0c37ad2117508716798464194ad";
const NIPS = "https://github.com/nostr-protocol/nips";
const LUDS = "https://github.com/lnurl/luds";

/** A repository that agrees with itself: one NIP, one LUD, one module each. */
function repository() {
  return {
    baseline: {
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
    },
    files: ["nip01.ts", "lud16.ts"],
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
  it("reports nothing when the two agree", () => {
    expect(specBaselineProblems(repository())).toEqual([]);
  });

  describe("the entries it can judge without the spec text", () => {
    it.each([
      [{ commit: "c3fd9af" }, "has no 40-character lowercase-hex commit"],
      [{ commit: undefined }, "has no 40-character lowercase-hex commit"],
      [{ sha256: "abc" }, "has no 64-character lowercase-hex sha256"],
      [{ date: "yesterday" }, "has no YYYY-MM-DD calendar date"],
      [{ date: "2026-90-04" }, "has no YYYY-MM-DD calendar date"],
      [{ date: "2026-02-30" }, "has no YYYY-MM-DD calendar date"],
      [{ date: "2999-01-01" }, "has no YYYY-MM-DD calendar date"],
    ])("rejects %o", (patch, message) => {
      expect(specBaselineProblems(withEntry("nips", "01", patch))).toEqual([
        `spec-baseline.json: \`nips.01\` ${message}`,
      ]);
    });

    it("accepts a leap day that does exist", () => {
      expect(
        specBaselineProblems(withEntry("nips", "01", { date: "2024-02-29" })),
      ).toEqual([]);
    });

    // A day of slack: a maintainer east of UTC reads today's date off a commit
    // page while UTC is still on yesterday.
    it("accepts today and tomorrow", () => {
      const day = (offset) =>
        new Date(Date.now() + offset).toISOString().slice(0, 10);
      for (const date of [day(0), day(86_400_000)])
        expect(specBaselineProblems(withEntry("nips", "01", { date }))).toEqual(
          [],
        );
    });

    // One commit has one committer date, so two entries recording it must
    // agree — a transposed day is otherwise a real date at a real commit.
    it("rejects two entries dating one commit differently", () => {
      const input = withEntry("luds", 16, {
        commit: COMMIT,
        date: "2026-09-05",
      });
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("dates c3fd9af to 2026-09-05"),
      ]);
    });

    // Judged on a commit that is one, as the paste check is on a hash that is:
    // two placeholders disagreeing about a date they do not have is noise.
    it("does not date entries by a commit that is not one", () => {
      const input = repository();
      for (const [id, date] of [
        ["01", "2026-01-01"],
        ["05", "2026-02-02"],
      ])
        input.baseline.documents.nips[id] = {
          commit: "TODO",
          date,
          sha256: HASH.replace(/^6/, id === "01" ? "7" : "8"),
        };
      input.files.push("nip05.ts");
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining(
          "`nips.01` has no 40-character lowercase-hex commit",
        ),
        expect.stringContaining(
          "`nips.05` has no 40-character lowercase-hex commit",
        ),
      ]);
    });

    it("reports one disagreement per commit, not per entry", () => {
      const input = repository();
      for (const id of ["05", "10"])
        input.baseline.documents.nips[id] = {
          commit: COMMIT,
          date: "2026-09-05",
          sha256: HASH.replace(/^6/, id === "05" ? "7" : "8"),
        };
      input.files.push("nip05.ts", "nip10.ts");
      expect(
        specBaselineProblems(input).filter((problem) =>
          problem.includes("dates c3fd9af"),
        ),
      ).toHaveLength(1);
    });

    it("accepts two entries agreeing about one commit", () => {
      const input = withEntry("luds", 16, {
        commit: COMMIT,
        date: "2026-09-04",
      });
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("counts a mis-keyed entry in the paste check", () => {
      const input = repository();
      input.baseline.documents.nips["7d"] = {
        commit: OTHER_COMMIT,
        date: "2026-07-16",
        sha256: HASH,
      };
      input.files.push("nip7d.ts");
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("`nips.7d` and `nips.01` record the same"),
        expect.stringContaining("`nips.7d` is not a document id"),
      ]);
    });

    it("rejects two documents recording the same sha256", () => {
      expect(
        specBaselineProblems(withEntry("luds", "16", { sha256: HASH })),
      ).toEqual([
        expect.stringContaining("`luds.16` and `nips.01` record the same"),
      ]);
    });

    it("does not call two malformed entries a paste of each other", () => {
      const input = withEntry("nips", "01", { sha256: "nope" });
      input.baseline.documents.luds[16].sha256 = "nope";
      expect(
        specBaselineProblems(input).filter((problem) =>
          problem.includes("same sha256"),
        ),
      ).toEqual([]);
    });

    // A regex coerces what it tests, so an array of one hash would pass and
    // then key the paste check by the array rather than by the hash.
    it.each([
      [{ commit: [COMMIT] }, "has no 40-character lowercase-hex commit"],
      [{ sha256: [HASH] }, "has no 64-character lowercase-hex sha256"],
    ])("rejects %o", (patch, message) => {
      expect(specBaselineProblems(withEntry("nips", "01", patch))).toEqual([
        `spec-baseline.json: \`nips.01\` ${message}`,
      ]);
    });

    it.each([
      ["null", null],
      ["a string", "todo"],
    ])("reports an entry that is %s", (_description, entry) => {
      const input = repository();
      input.baseline.documents.luds[16] = entry;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `luds.16` records no revision",
      ]);
    });

    // Only a case difference names the id it should have had, and the module
    // that matches it is not an orphan of a missing entry.
    // Two characters, but not the ones the upstream filename has, so the
    // message says what a document id is rather than counting characters.
    it("reports a lowercase id as not being one", () => {
      const input = repository();
      input.baseline.documents.nips = {
        "7d": { commit: COMMIT, date: "2026-09-04", sha256: HASH },
      };
      input.files = ["nip7d.ts", "lud16.ts"];
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `nips.7d` is not a document id: two characters, digits or uppercase, as the upstream filename is",
      ]);
    });

    it("reports a misspelled id without blaming the module it names", () => {
      const input = repository();
      input.baseline.documents.nips = { "7d": null };
      input.files = ["nip7d.ts", "lud16.ts"];
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `nips.7d` records no revision",
      ]);
    });

    it("reports an id of the wrong shape", () => {
      const input = repository();
      input.baseline.documents.nips = {
        1: { commit: COMMIT, date: "2026-09-04", sha256: HASH },
      };
      // `1` names no id, so the module it does not match is reported too.
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("`nips.1` is not a document id"),
        expect.stringContaining("`src/nip01.ts` has no `nips.01` entry"),
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

    // Suggested the way every module here is written, which the ADR states
    // and the check accepts either spelling of.
    it("names the module it looked for in lowercase", () => {
      const input = repository();
      input.baseline.documents.nips = {
        "7D": { commit: COMMIT, date: "2026-09-04", sha256: HASH },
      };
      input.files = ["lud16.ts"];
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("`nips.7D` has no `src/nip7d.ts`"),
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
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("ignores a module that is not named for a document", () => {
      const input = repository();
      input.files.push("bech32.ts", "internet-identifier.ts", "nip01.test.ts");
      expect(specBaselineProblems(input)).toEqual([]);
    });
  });

  describe("sources and documents must name the same families", () => {
    // Named one at a time: reporting both would point at a key that is there.
    it.each([["sources"], ["documents"]])(
      "reports a baseline with no `%s` at all",
      (key) => {
        const input = repository();
        delete input.baseline[key];
        expect(specBaselineProblems(input)).toEqual([
          `spec-baseline.json: has no \`${key}\` to compare`,
        ]);
      },
    );

    it.each([["sources"], ["documents"]])(
      "reports a `%s` that is not an object",
      (key) => {
        const input = repository();
        input.baseline[key] = "todo";
        expect(specBaselineProblems(input)).toEqual([
          `spec-baseline.json: has no \`${key}\` to compare`,
        ]);
      },
    );

    it("names both when neither is there", () => {
      expect(specBaselineProblems({ baseline: {}, files: [] })).toEqual([
        "spec-baseline.json: has no `sources` and no `documents` to compare",
      ]);
    });

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
      input.baseline.sources.buds = { label: "BUD", repository: LUDS };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.buds` has no `documents` entry",
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

    it("reports a family that is not an object instead of crashing on it", () => {
      const input = repository();
      input.baseline.sources.luds = null;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.luds` describes no family",
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
  });

  describe("a family that does not describe itself", () => {
    // A regex coerces what it tests, so neither of these is a series name even
    // though `LABEL` alone would say so.
    it.each([
      ["missing", undefined],
      ["true", true],
      ["an array", ["NIP"]],
      ["regex syntax", "LUD("],
    ])("reports a label that is %s", (_description, label) => {
      const input = repository();
      input.baseline.sources.luds.label = label;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.luds` has no label naming a document series",
      ]);
    });

    it.each([
      ["missing", undefined],
      ["empty", ""],
      ["a number", 42],
    ])("reports a repository that is %s", (_description, repository_) => {
      const input = repository();
      input.baseline.sources.luds.repository = repository_;
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.luds` has no repository",
      ]);
    });
  });
});

describe("specBaselineSummary", () => {
  it("counts each family", () => {
    expect(specBaselineSummary(repository())).toBe(
      "Spec baseline check passed — 1 nips, 1 luds baselined from src/.",
    );
  });
});
