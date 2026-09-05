import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // No `include`: vitest's default already collects both the library's tests
    // beside the source and the ones the build's checks carry under `scripts/`.
    // Any list written here would be narrower than that default, and would drop
    // whatever it forgot to name without saying so.
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
