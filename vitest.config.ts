import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Stated rather than left to the default: the library's tests live beside
    // the source, and the checks that gate the build carry their own under
    // `scripts/`. An include added later for one would otherwise drop the
    // other without a word.
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // text: local console summary; html: local browsable report;
      // lcov: machine-readable report consumed by Codecov in CI.
      reporter: ["text", "html", "lcov"],
    },
  },
});
