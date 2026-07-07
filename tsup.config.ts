import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  treeshake: true,
  minify: false,
  // Framework packages stay external — the host app provides them.
  external: [
    "react",
    "react-dom",
    "@tiptap/core",
    "@tiptap/pm",
    "@tiptap/react",
    "@tiptap/suggestion",
  ],
});
