import type { Editor } from "@tiptap/core";
import { type Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion } from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";
import { key } from "../core/plugin-key";
import type { ModelLanguageLabels, PluginContext } from "../core/types";
import {
  buildModelOptions,
  capOptions,
  type ModelTokenOption,
} from "./options";
import { ModelTokenList, type ModelTokenListRef } from "./token-list";

/**
 * The `{{` autocomplete plugin — staged, raw-text completions (no chips). Reads
 * the shared `ctx` to decide when to open (edit vs click/arrow vs meta-push)
 * and calls `onOpen` to dismiss any hover tooltip while the menu is up.
 */
export function createSuggestionPlugin(deps: {
  editor: Editor;
  ctx: PluginContext;
  onOpen: () => void;
  labels: ModelLanguageLabels;
}): Plugin {
  const { editor, ctx, onOpen, labels } = deps;

  return Suggestion<ModelTokenOption>({
    editor,
    char: "{{",
    pluginKey: new PluginKey("modelSyntaxSuggestion"),
    allowSpaces: true,
    startOfLine: false,
    decorationClass: "model-lang-suggestion",

    findSuggestionMatch: ({ $position }) => {
      const before = $position.doc.textBetween(
        Math.max(0, $position.pos - 200),
        $position.pos,
        "\n",
        "\0",
      );
      const mm = before.match(/\{\{([^}\n]*)$/);
      if (!mm) return null;
      // Inside an open string literal → suppress (odd number of quotes).
      if (((mm[1].match(/"/g) || []).length & 1) === 1) return null;
      const start = $position.pos - (before.length - (mm.index ?? 0));
      const docSize = $position.doc.content.size;
      const after = $position.doc.textBetween(
        $position.pos,
        Math.min(docSize, $position.pos + 200),
        "\n",
        "\0",
      );
      // Cursor inside an already-closed token: suppress unless the doc actually
      // changed (typing/deleting) — covers a click/arrow into finished text and
      // a debounced validation meta-push; keeps an open menu alive.
      const closedToken = after.match(/^[^{}\n]*\}\}/);
      if (
        closedToken &&
        !ctx.lastTrDocChanged &&
        (ctx.lastTrSelectionMoved || !ctx.suggestionActive)
      )
        return null;
      // Consume only the rest of the current identifier the cursor is in.
      const wordTail = after.match(/^[\w.]*/);
      const to = $position.pos + (wordTail ? wordTail[0].length : 0);
      return { range: { from: start, to }, query: mm[1] ?? "", text: mm[0] };
    },

    items: ({ query }) => {
      const st = key.getState(editor.state);
      return capOptions(buildModelOptions(st?.namespaces ?? [], query));
    },

    command: ({ editor, range, props }) => {
      // Text that survives just after the replace range — the rest of the token.
      const docSize = editor.state.doc.content.size;
      const tail = editor.state.doc.textBetween(
        range.to,
        Math.min(docSize, range.to + 200),
        "\n",
        "\0",
      );
      const alreadyClosed = /^[^{}\n]*\}\}/.test(tail);
      const needBraces = props.close && !alreadyClosed;
      let content = needBraces ? `{{${props.insert}}}` : `{{${props.insert}`;
      // Editing an operator mid-clause where a value already follows → drop the
      // completion's empty placeholder so we don't get `contains "" "ly"`.
      if (/^\s*("|\[|-?\d|true\b|false\b)/.test(tail))
        content = content.replace(/\s*(?:""|\[""\])$/, "");
      // Avoid a double space against a preserved tail.
      if (content.endsWith(" ") && tail.startsWith(" "))
        content = content.slice(0, -1);
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "text", text: content })
        .run();
      const q = content.indexOf('""');
      if (needBraces) {
        if (q >= 0) editor.commands.setTextSelection(range.from + q + 1);
      } else {
        editor.commands.setTextSelection(
          q >= 0 ? range.from + q + 1 : range.from + content.length,
        );
      }
    },

    render: () => {
      let component: ReactRenderer<ModelTokenListRef>;
      let popup: Instance[] | undefined;
      // Dismiss the menu on scroll (it drifts from the caret) — but not when the
      // scroll happens inside the menu's own list.
      const onScroll = (e: Event) => {
        const el = popup?.[0]?.popper;
        if (el && e.target instanceof Node && el.contains(e.target)) return;
        popup?.[0]?.hide();
      };
      return {
        onStart: (props) => {
          ctx.suggestionActive = true;
          onOpen();
          window.addEventListener("scroll", onScroll, true);
          component = new ReactRenderer(ModelTokenList, {
            props: {
              items: props.items,
              command: props.command,
              emptyLabel: labels.noMatches,
            },
            editor: props.editor,
          });
          if (!props.clientRect) return;
          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: props.items.length > 0,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            popperOptions: {
              modifiers: [
                {
                  name: "flip",
                  options: {
                    boundary: "viewport",
                    fallbackPlacements: ["top-start", "bottom-start"],
                    padding: 8,
                  },
                },
                {
                  name: "preventOverflow",
                  options: { boundary: "viewport", padding: 8 },
                },
              ],
            },
          });
        },
        onUpdate: (props) => {
          component.updateProps({
            items: props.items,
            command: props.command,
            emptyLabel: labels.noMatches,
          });
          if (props.items.length === 0) popup?.[0]?.hide();
          else popup?.[0]?.show();
          if (props.clientRect) {
            popup?.[0]?.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }
          return component.ref?.onKeyDown(props.event) ?? false;
        },
        onExit: () => {
          ctx.suggestionActive = false;
          window.removeEventListener("scroll", onScroll, true);
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  });
}
