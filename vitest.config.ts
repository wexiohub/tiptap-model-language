import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The Tiptap/ProseMirror + DOM surfaces (extension wiring, suggestion,
      // tooltip, token list, the validation debounce/dispatch glue) are covered
      // by the end-to-end suite; these unit tests target the pure logic. The
      // pure part of validation lives in `mapDiagnostics` (diagnostics.ts) and
      // IS covered here.
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/extension.ts",
        "src/autocomplete/suggestion.ts",
        "src/autocomplete/token-list.tsx",
        "src/tooltip/tooltip.ts",
        "src/validation/validation.ts",
      ],
      reporter: ["text", "html"],
    },
  },
});
