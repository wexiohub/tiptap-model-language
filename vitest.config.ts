import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The Tiptap/ProseMirror + DOM surfaces (extension wiring, suggestion,
      // tooltip, token list) are covered by integration tests in a jsdom
      // harness — tracked separately; these unit tests target the pure logic.
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/extension.ts",
        "src/autocomplete/suggestion.ts",
        "src/autocomplete/token-list.tsx",
        "src/tooltip/tooltip.ts",
      ],
      reporter: ["text", "html"],
    },
  },
});
