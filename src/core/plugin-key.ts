import { PluginKey } from "@tiptap/pm/state";
import type { ModelSyntaxState } from "./types";

/** Shared plugin key — the state carries namespaces, schema and diagnostics. */
export const key = new PluginKey<ModelSyntaxState>("modelSyntax");
