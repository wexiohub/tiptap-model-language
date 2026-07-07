import type { Editor } from "@tiptap/core";
import { validate } from "model-language";
import { key } from "../core/plugin-key";
import type {
  ModelSyntaxOptions,
  ModelSyntaxStorage,
  TemplateDiagnostic,
  TokenDiagnostic,
} from "../core/types";
import { diagnosticsByPath } from "./diagnostics";

/**
 * Debounced local validation via the `model-language` package — pushes
 * fieldPath-keyed diagnostics into the plugin state (for squiggles) and
 * surfaces the full result via `onResult`. Runs in-process, no round-trip.
 */
export function runValidation(
  editor: Editor,
  options: ModelSyntaxOptions,
  storage: ModelSyntaxStorage,
): void {
  const { skipValidation, debounceMs, onResult, translateDiagnostic } = options;
  if (storage.timer) clearTimeout(storage.timer);
  if (skipValidation) return;

  storage.timer = setTimeout(() => {
    if (!editor || editor.isDestroyed) return;
    const template = editor.getText({ blockSeparator: "\n" });
    const push = (byPath: Map<string, TokenDiagnostic>) => {
      if (editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta(key, { byPath }));
    };
    const schema = key.getState(editor.state)?.schema ?? [];
    // No fields yet (schema still loading) or no tokens → nothing to check
    // semantically. Structural squiggles run in buildDecorations regardless.
    if (!schema.length || !template.includes("{{")) {
      push(new Map());
      onResult?.({ diagnostics: [], maxTokenEstimate: null });
      return;
    }
    let result: ReturnType<typeof validate>;
    try {
      result = validate(template, schema);
    } catch {
      // The package is total (never throws), but guard defensively.
      return;
    }
    const diagnostics: TemplateDiagnostic[] = result.diagnostics.map((d) => {
      const base: TemplateDiagnostic = {
        code: d.code,
        severity: d.severity,
        message: d.message,
        fieldPath: d.fieldPath ?? null,
      };
      // Localize the engine's message (both the panel and the squiggle tooltip
      // read this) — the host maps by `code`.
      return { ...base, message: translateDiagnostic?.(base) ?? base.message };
    });
    push(diagnosticsByPath(diagnostics));
    onResult?.({ diagnostics, maxTokenEstimate: result.maxTokenEstimate });
  }, debounceMs);
}
