import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/perf/vitest-setup.ts"],
  },
});
