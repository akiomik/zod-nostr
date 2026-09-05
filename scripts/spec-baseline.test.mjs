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

// Shaped like the real thing and readable as not being it. Copying an entry's
// actual commit and hash in here would put the revision this repository records
// in a second place, which is the one thing `spec-baseline.json` exists to
// prevent — and would invite the next reader to keep the copy up to date.
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const OTHER_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";
const HASH = `${COMMIT}${COMMIT.slice(0, 24)}`;
const OTHER_HASH = `${OTHER_COMMIT}${OTHER_COMMIT.slice(0, 24)}`;
// Marks that `HASH` does not start with, so `unlike` cannot return `HASH`
// however `HASH` is spelled. Reached by index, so two calls differ as well.
const MARKS = [..."abcdef"].filter((mark) => mark !== HASH[0]);

/**
 * The nth hash unlike `HASH` and unlike every other `unlike`, for `nth` below
 * `MARKS.length` — six, or five when `HASH` starts with a hex letter. Past that
 * the mark is `undefined`, which would make a hash that is not one and change
 * which diagnostic a case asserts rather than failing as the misuse it is.
 */
const unlike = (nth) => {
  if (nth >= MARKS.length) throw new RangeError(`no mark ${nth} to build with`);
  return `${MARKS[nth]}${HASH.slice(1)}`;
};

// Instants as `landed` holds them, invented for the same reason the commit and
// the hashes above are: these were `nips.01`'s and `luds.16`'s real values, put
// back on the very entries they came from, which is the copy this file's header
// says not to make. Every assertion is on shape or on entries agreeing with
// each other, so no case needs the real ones.
const LANDED = "2020-01-02T03:04:05Z";
const OTHER_LANDED = "2021-06-07T08:09:10Z";

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
        nips: { "01": { commit: COMMIT, landed: LANDED, sha256: HASH } },
        luds: {
          16: {
            commit: OTHER_COMMIT,
            landed: OTHER_LANDED,
            sha256: OTHER_HASH,
          },
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
      [{ commit: "0123456" }, "has no 40-character lowercase-hex commit"],
      [{ commit: undefined }, "has no 40-character lowercase-hex commit"],
      [{ sha256: "abc" }, "has no 64-character lowercase-hex sha256"],
      [{ landed: "yesterday" }, "has no YYYY-MM-DDTHH:MM:SSZ instant"],
      // A bare day is what this field used to hold, so it is the likeliest
      // thing to be written here by hand or left behind by a half-done edit.
      [{ landed: "2026-09-04" }, "has no YYYY-MM-DDTHH:MM:SSZ instant"],
      // One instant, one spelling: an offset or a fraction is the same moment
      // written another way, and entries at one commit are compared as text.
      [
        { landed: "2026-09-04T13:19:51+09:00" },
        "has no YYYY-MM-DDTHH:MM:SSZ instant",
      ],
      [
        { landed: "2026-09-04T04:19:51.000Z" },
        "has no YYYY-MM-DDTHH:MM:SSZ instant",
      ],
      [
        { landed: "2026-90-04T00:00:00Z" },
        "lands at an instant that does not exist, 2026-90-04T00:00:00Z",
      ],
      [
        { landed: "2026-02-30T00:00:00Z" },
        "lands at an instant that does not exist, 2026-02-30T00:00:00Z",
      ],
      [
        { landed: "2999-01-01T00:00:00Z" },
        "lands at an instant this clock has not reached, 2999-01-01T00:00:00Z",
      ],
    ])("rejects %o", (patch, message) => {
      expect(specBaselineProblems(withEntry("nips", "01", patch))).toEqual([
        `spec-baseline.json: \`nips.01\` ${message}`,
      ]);
    });

    it("accepts a leap day that does exist", () => {
      expect(
        specBaselineProblems(
          withEntry("nips", "01", { landed: "2024-02-29T12:00:00Z" }),
        ),
      ).toEqual([]);
    });

    // An instant says which moment it is, so "has it come?" has one answer
    // wherever it is asked from. The day of slack a bare date needed is gone,
    // and a minute ahead is ahead.
    it("accepts now and rejects a minute from now", () => {
      const at = (offset) =>
        `${new Date(Date.now() + offset).toISOString().slice(0, 19)}Z`;
      expect(
        specBaselineProblems(withEntry("nips", "01", { landed: at(0) })),
      ).toEqual([]);
      expect(
        specBaselineProblems(withEntry("nips", "01", { landed: at(60_000) })),
      ).toEqual([
        expect.stringContaining(
          "lands at an instant this clock has not reached",
        ),
      ]);
    });

    // One commit landed once, so two entries recording it must agree about
    // when — a transposed digit is otherwise a real instant at a real commit.
    it("rejects two entries landing one commit differently", () => {
      // A third instant, so the disagreement is in the case rather than in the
      // fixture's defaults happening to differ.
      const elsewhen = "2022-03-04T05:06:07Z";
      const input = withEntry("luds", 16, { commit: COMMIT, landed: elsewhen });
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining(`lands 0123456 at ${elsewhen}`),
      ]);
    });

    // Judged on a commit that is one, as the paste check is on a hash that is:
    // two placeholders disagreeing about an instant they do not have is noise.
    it("does not land entries by a commit that is not one", () => {
      const input = repository();
      for (const [id, landed] of [
        ["01", "2026-01-01T00:00:00Z"],
        ["05", "2026-02-02T00:00:00Z"],
      ])
        input.baseline.documents.nips[id] = {
          commit: "TODO",
          landed,
          sha256: unlike(id === "01" ? 0 : 1),
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
          landed: OTHER_LANDED,
          sha256: unlike(id === "05" ? 0 : 1),
        };
      input.files.push("nip05.ts", "nip10.ts");
      expect(
        specBaselineProblems(input).filter((problem) =>
          problem.includes("lands 0123456"),
        ),
      ).toHaveLength(1);
    });

    // JavaScript reaches integer-like keys first, so an unsorted pass reads
    // `10` before `01` and names the entry the others agree with as the one
    // that disagrees. Entries are read in sorted order instead, which for a
    // baseline written in order is the order it is written in.
    it("names the entry later in sorted order as the one that disagrees", () => {
      const input = repository();
      input.baseline.documents.nips = {
        10: {
          commit: COMMIT,
          landed: OTHER_LANDED,
          sha256: unlike(0),
        },
        "01": { commit: COMMIT, landed: LANDED, sha256: HASH },
      };
      input.files = ["nip01.ts", "nip10.ts", "lud16.ts"];
      expect(specBaselineProblems(input)).toEqual([
        `spec-baseline.json: \`nips.10\` lands 0123456 at ${OTHER_LANDED}, which \`nips.01\` lands at ${LANDED}`,
      ]);
    });

    // Two entries wrong in two ways are two edits. Folding them into one
    // report would cost a second build to learn about the second.
    it("reports each instant a commit is given, not only the first wrong one", () => {
      const input = repository();
      for (const [id, landed] of [
        ["05", "2026-09-01T00:00:00Z"],
        ["10", "2026-09-02T00:00:00Z"],
      ])
        input.baseline.documents.nips[id] = {
          commit: COMMIT,
          landed,
          sha256: unlike(id === "05" ? 0 : 1),
        };
      input.files.push("nip05.ts", "nip10.ts");
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining(
          "`nips.05` lands 0123456 at 2026-09-01T00:00:00Z",
        ),
        expect.stringContaining(
          "`nips.10` lands 0123456 at 2026-09-02T00:00:00Z",
        ),
      ]);
    });

    it("accepts two entries agreeing about one commit", () => {
      const input = withEntry("luds", 16, {
        commit: COMMIT,
        landed: LANDED,
      });
      expect(specBaselineProblems(input)).toEqual([]);
    });

    it("counts a mis-keyed entry in the paste check", () => {
      const input = repository();
      input.baseline.documents.nips["7d"] = {
        commit: OTHER_COMMIT,
        landed: OTHER_LANDED,
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
        "7d": { commit: COMMIT, landed: LANDED, sha256: HASH },
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
        1: { commit: COMMIT, landed: LANDED, sha256: HASH },
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
        "7D": { commit: COMMIT, landed: LANDED, sha256: HASH },
      };
      input.files = ["lud16.ts"];
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("`nips.7D` has no `src/nip7d.ts`"),
      ]);
    });

    // Keeping only the last file seen would let the second satisfy the entry
    // the first claims, and make the diagnostic depend on directory order.
    it("reports two modules claiming one document", () => {
      const input = repository();
      input.files.push("legacy/nip01.ts");
      expect(specBaselineProblems(input)).toEqual([
        "src/: `nips.01` is claimed by `src/nip01.ts` and `src/legacy/nip01.ts`",
      ]);
    });

    it("names both when neither is baselined", () => {
      const input = repository();
      input.baseline.documents.nips = {};
      input.files.push("legacy/nip01.ts");
      expect(specBaselineProblems(input)).toEqual([
        expect.stringContaining("is claimed by"),
        expect.stringContaining("`src/nip01.ts` has no `nips.01` entry"),
        expect.stringContaining("`src/legacy/nip01.ts` has no `nips.01` entry"),
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
        "7D": { commit: COMMIT, landed: LANDED, sha256: HASH },
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

    // Valid JSON that `biome check` passes, so the guard the header leans on
    // does not catch it.
    it.each([
      ["null", null],
      ["an array", []],
    ])("reports a baseline that is %s", (_description, baseline) => {
      expect(specBaselineProblems({ baseline, files: [] })).toEqual([
        "spec-baseline.json: holds no object to compare",
      ]);
    });

    it("names both when neither is there", () => {
      expect(specBaselineProblems({ baseline: {}, files: [] })).toEqual([
        "spec-baseline.json: has no `sources` and no `documents` to compare",
      ]);
    });

    it("reports a family that only `documents` knows about", () => {
      const input = repository();
      input.baseline.documents.buds = {
        "01": {
          commit: COMMIT,
          landed: LANDED,
          sha256: unlike(0),
        },
      };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `documents.buds` has no `sources` entry",
      ]);
    });

    // An entry says what it says wherever it is written, so a family that only
    // `documents` knows about still has its entries judged.
    it("judges the entries of a family `sources` does not declare", () => {
      const input = repository();
      input.baseline.documents.buds = {
        "01": { commit: "x", landed: "nope", sha256: "no" },
      };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `documents.buds` has no `sources` entry",
        expect.stringContaining(
          "`buds.01` has no 40-character lowercase-hex commit",
        ),
        expect.stringContaining(
          "`buds.01` has no YYYY-MM-DDTHH:MM:SSZ instant",
        ),
        expect.stringContaining(
          "`buds.01` has no 64-character lowercase-hex sha256",
        ),
      ]);
    });

    it("reports a family that only `sources` knows about", () => {
      const input = repository();
      input.baseline.sources.buds = { label: "BUD", repository: LUDS };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.buds` has no `documents` entry",
      ]);
    });

    // Copying a `sources` block and editing only its key. Without this the
    // second family is judged against modules that are not its own, and the
    // collision that caused it is never named.
    it("reports two families sharing one label", () => {
      const input = repository();
      input.baseline.sources.nips2 = { label: "NIP", repository: NIPS };
      input.baseline.documents.nips2 = {};
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.nips` (`NIP`) and `sources.nips2` (`NIP`) share one label",
      ]);
    });

    // The copy is as likely to be written above the original as below. Taking
    // the first family to claim the label would hand the modules to the copy
    // and tell the original that its own were missing.
    it("judges neither family by the other's modules, in either order", () => {
      const input = repository();
      input.baseline.sources = {
        nips2: { label: "NIP", repository: NIPS },
        ...input.baseline.sources,
      };
      input.baseline.documents = {
        nips2: {},
        ...input.baseline.documents,
      };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.nips2` (`NIP`) and `sources.nips` (`NIP`) share one label",
      ]);
    });

    // Matched the way the modules are, so one spelling cannot slip past.
    it("reports a shared label whose spelling differs by case", () => {
      const input = repository();
      input.baseline.sources.nips2 = { label: "nip", repository: NIPS };
      input.baseline.documents.nips2 = {};
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.nips` (`NIP`) and `sources.nips2` (`nip`) share one label",
      ]);
    });

    // The mirror of the case above: a label is all it takes to find a family's
    // modules, so one declared in `sources` alone still has them spoken for.
    // Reporting only the missing `documents` would name the file to fix in a
    // second run, after the first was fixed.
    it("reports the modules of a family `documents` does not hold", () => {
      const input = repository();
      input.baseline.sources.buds = { label: "BUD", repository: LUDS };
      input.files.push("bud01.ts", "bud02.ts");
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.buds` has no `documents` entry",
        "spec-baseline.json: `src/bud01.ts` has no `buds.01` entry",
        "spec-baseline.json: `src/bud02.ts` has no `buds.02` entry",
      ]);
    });

    // `in` would find these on `Object.prototype` and skip the family in
    // silence, leaving its entries and modules unexamined.
    it.each([["toString"], ["constructor"]])(
      "reports a `documents.%s` family with no `sources` entry",
      (family) => {
        const input = repository();
        input.baseline.documents[family] = {
          "01": {
            commit: COMMIT,
            landed: LANDED,
            sha256: unlike(0),
          },
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

    // Symmetric with the undeclared case: what a `sources` value cannot say is
    // its label and repository, not what its entries say.
    it("judges the entries of a family whose source is not an object", () => {
      const input = repository();
      input.baseline.sources.luds = null;
      input.baseline.documents.luds[16] = {
        commit: "x",
        landed: "nope",
        sha256: "no",
      };
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `sources.luds` describes no family",
        expect.stringContaining("`luds.16` has no 40-character lowercase-hex"),
        expect.stringContaining(
          "`luds.16` has no YYYY-MM-DDTHH:MM:SSZ instant",
        ),
        expect.stringContaining("`luds.16` has no 64-character lowercase-hex"),
      ]);
    });

    // Read as the no entries it has, not skipped: the label is there, so the
    // modules wanting an entry are named in the same run as the family.
    it("reports a family whose entries are not an object, and its modules", () => {
      const input = repository();
      input.baseline.documents.luds = null;
      input.files.push("lud99.ts");
      expect(specBaselineProblems(input)).toEqual([
        "spec-baseline.json: `documents.luds` holds no entries",
        "spec-baseline.json: `src/lud16.ts` has no `luds.16` entry",
        "spec-baseline.json: `src/lud99.ts` has no `luds.99` entry",
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
  it("says nothing was checked when no family is declared", () => {
    expect(specBaselineSummary({ baseline: { documents: {} } })).toBe(
      "Spec baseline check passed — spec-baseline.json declares no families, " +
        "so nothing in src/ was checked.",
    );
  });

  it("counts each family", () => {
    expect(specBaselineSummary(repository())).toBe(
      "Spec baseline check passed — 1 nips, 1 luds baselined, " +
        "for the families spec-baseline.json declares.",
    );
  });
});
