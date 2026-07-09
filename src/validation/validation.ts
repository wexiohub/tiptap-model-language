import type { Editor } from "@tiptap/core";
import { validate } from "model-language";
import { key } from "../core/plugin-key";
import type { ModelSyntaxOptions, ModelSyntaxStorage } from "../core/types";
import { mapDiagnostics } from "./diagnostics";

/**
 * Debounced local validation via the `model-language` package — pushes
 * fieldPath-keyed diagnostics into the plugin state (for squiggles) and
 * surfaces the full result via `onResult`. Runs in-process, no round-trip.
 *
 * This is the DOM glue (debounce + `getState` + `dispatch`); the pure mapping it
 * delegates to lives in `mapDiagnostics` (unit-tested there).
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
    const st = key.getState(editor.state);
    const schema = st?.schema ?? [];
    const directives = st?.directives ?? [];
    // Nothing to check when there's no vocabulary (no fields and no directives)
    // or no tokens. Structural squiggles run in buildDecorations regardless.
    if ((!schema.length && !directives.length) || !template.includes("{{")) {
      if (!editor.isDestroyed)
        editor.view.dispatch(
          editor.state.tr.setMeta(key, { byPath: new Map(), byRange: [] }),
        );
      onResult?.({ diagnostics: [], maxTokenEstimate: null });
      return;
    }
    let result: ReturnType<typeof validate>;
    try {
      result = validate(template, schema, { directives });
    } catch {
      // The package is total (never throws), but guard defensively.
      return;
    }
    const { diagnostics, byPath, byRange } = mapDiagnostics(
      result.diagnostics,
      directives,
      translateDiagnostic,
    );
    if (!editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(key, { byPath, byRange }));
    onResult?.({ diagnostics, maxTokenEstimate: result.maxTokenEstimate });
  }, debounceMs);
}
