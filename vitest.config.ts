import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Stated rather than left to the default, and by extension rather than by
    // place: the library's tests live beside the source and the checks that
    // gate the build carry their own under `scripts/`, so naming directories
    // would drop whichever one a later edit forgot.
    include: ["**/*.test.{ts,mjs}"],
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
