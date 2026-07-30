import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
