import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";
import type { DirectiveSpec, FieldSchema } from "model-language";
import { createSuggestionPlugin } from "./autocomplete/suggestion";
import { key } from "./core/plugin-key";
import type {
  DirectiveArgLabel,
  ModelSyntaxOptions,
  ModelSyntaxState,
  ModelSyntaxStorage,
  PluginContext,
} from "./core/types";
import { resolveLabels } from "./core/types";
import { buildDecorations } from "./highlight/decorations";
import { buildValidateSchema } from "./schema/build-schema";
import type { MlNamespace } from "./schema/namespaces";
import { createDiagnosticTooltip } from "./tooltip/tooltip";
import { runValidation } from "./validation/validation";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    modelSyntax: {
      /** Push the namespaces (autocomplete + highlighting) and the org field
       *  schema (local `validate()`). Re-runs validation against the schema. */
      setModelData: (data: {
        namespaces: MlNamespace[];
        schema?: FieldSchema;
        directives?: DirectiveSpec[];
        directiveArgLabel?: DirectiveArgLabel;
        matchKeys?: Record<string, string[]>;
      }) => ReturnType;
    };
  }
}

/**
 * Self-contained model-language editing extension. Add it to any Tiptap editor
 * and it owns the whole experience: raw-text `{{…}}` syntax highlighting, a `{{`
 * autocomplete (variables / filters / control blocks), `flow.<cardId>` hover
 * highlighting, hover diagnostics + quick-fixes, and live validation via the
 * `model-language` package. The host pushes namespaces + schema via
 * `setModelData`; everything else is configured through options.
 */
export const ModelSyntax = Extension.create<
  ModelSyntaxOptions,
  ModelSyntaxStorage
>({
  name: "modelSyntax",

  addOptions() {
    return {
      namespaces: [],
      schema: [],
      directives: [],
      directiveArgLabel: undefined,
      matchKeys: undefined,
      skipValidation: false,
      debounceMs: 300,
      severities: ["error", "warning", "info"],
      labels: {},
      translateDiagnostic: undefined,
      onResult: undefined,
    };
  },

  addStorage() {
    return { timer: null };
  },

  addCommands() {
    return {
      setModelData:
        ({ namespaces, schema, directives, directiveArgLabel, matchKeys }) =>
        ({ tr, dispatch, editor }) => {
          if (dispatch) {
            dispatch(
              tr.setMeta(key, {
                namespaces,
                schema: buildValidateSchema(namespaces, schema ?? []),
                directives: directives ?? this.options.directives,
                directiveArgLabel:
                  directiveArgLabel ?? this.options.directiveArgLabel,
                matchKeys: matchKeys ?? this.options.matchKeys,
              }),
            );
            runValidation(editor, this.options, this.storage);
          }
          return true;
        },
    };
  },

  onCreate() {
    runValidation(this.editor, this.options, this.storage);
  },

  onUpdate({ transaction }) {
    if (!transaction.docChanged) return;
    runValidation(this.editor, this.options, this.storage);
  },

  onDestroy() {
    if (this.storage.timer) clearTimeout(this.storage.timer);
  },

  addProseMirrorPlugins() {
    const labels = resolveLabels(this.options.labels);
    const severities = this.options.severities;
    // Seed the plugin state from the (optional) initial namespaces + schema, so
    // the static case works via `configure` alone — no `setModelData` needed.
    const initialNamespaces = this.options.namespaces;
    const initialSchema = buildValidateSchema(
      this.options.namespaces,
      this.options.schema,
    );
    const initialDirectives = this.options.directives;
    const initialDirectiveArgLabel = this.options.directiveArgLabel;
    const initialMatchKeys = this.options.matchKeys;
    // Flags shared between the main plugin (writer), the tooltip and the
    // autocomplete (readers).
    const ctx: PluginContext = {
      lastTrDocChanged: false,
      lastTrSelectionMoved: false,
      suggestionActive: false,
    };
    const tooltip = createDiagnosticTooltip({
      editor: this.editor,
      ctx,
      labels,
    });

    const main = new Plugin<ModelSyntaxState>({
      key,
      state: {
        init: () => ({
          namespaces: initialNamespaces,
          schema: initialSchema,
          directives: initialDirectives,
          directiveArgLabel: initialDirectiveArgLabel,
          matchKeys: initialMatchKeys,
          byPath: new Map(),
          byRange: [],
        }),
        apply(tr, value, oldState, newState) {
          // Runs before the Suggestion plugin's apply so the flags are fresh
          // when findSuggestionMatch reads them.
          ctx.lastTrDocChanged = tr.docChanged;
          ctx.lastTrSelectionMoved = !oldState.selection.eq(newState.selection);
          const meta = tr.getMeta(key) as Partial<ModelSyntaxState> | undefined;
          return meta ? { ...value, ...meta } : value;
        },
      },
      props: {
        decorations(state) {
          const st = key.getState(state);
          return st
            ? buildDecorations(state.doc, st, { severities, labels })
            : DecorationSet.empty;
        },
        handleDOMEvents: {
          mousemove: (_view, event) => {
            tooltip.setPointer(event.clientX, event.clientY);
            return false;
          },
          mouseover: (_view, event) => {
            const target = event.target as HTMLElement;
            tooltip.scheduleError(target, event.clientX, event.clientY);
            const id = target
              ?.closest?.("[data-card-id]")
              ?.getAttribute("data-card-id");
            if (id)
              document
                .querySelector(`[data-id="${id}"]`)
                ?.classList.add("variable-hover-highlight");
            return false;
          },
          mouseout: (_view, event) => {
            const id = (event.target as HTMLElement)
              ?.closest?.("[data-card-id]")
              ?.getAttribute("data-card-id");
            if (id)
              document
                .querySelector(`[data-id="${id}"]`)
                ?.classList.remove("variable-hover-highlight");
            return false;
          },
          mouseleave: () => {
            tooltip.handleEditorMouseLeave();
            return false;
          },
        },
      },
    });

    const suggestion = createSuggestionPlugin({
      editor: this.editor,
      ctx,
      onOpen: tooltip.hideError,
      labels,
    });

    return [main, suggestion];
  },
});
