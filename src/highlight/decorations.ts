import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { BRACE_CLASS, DIAG_CLASS } from "../core/constants";
import type {
  DiagnosticSeverity,
  ModelLanguageLabels,
  ModelSyntaxState,
} from "../core/types";
import { type MlField, parseModelToken } from "../schema/namespaces";
import {
  addsDefault,
  defaultFilterFor,
  suggestOperator,
} from "../validation/diagnostics";
import { HL_CLASS, tokenizeExpression } from "./highlight";

export interface DecorationOptions {
  severities: DiagnosticSeverity[];
  labels: ModelLanguageLabels;
}

/** A `{{ … }}` token — no nested braces, but it MAY span line breaks. */
const TOKEN_RE = /\{\{[^{}]*\}\}/g;

/** A token located in the flattened doc string, with its char-range + text. */
interface Block {
  /** Char offset of the opening `{{` in the flattened string. */
  start: number;
  /** Char offset just past the closing `}}`. */
  end: number;
  /** Trimmed inner text (for classification). */
  inner: string;
}

/** Emit inline decorations for a flattened char range, and map char↔pos. */
interface Painter {
  /**
   * Decorate `[a, b)` (flattened char offsets). Split at block boundaries —
   * a ProseMirror inline decoration can't cross a textblock — reusing `attrs`
   * on each shard.
   */
  paint: (a: number, b: number, attrs: Record<string, string>) => void;
  /** The document position at (or just after) flattened char offset `i`. */
  pos: (i: number) => number;
}

/**
 * Build the decoration set: brace + per-token syntax colouring, precise
 * field-level diagnostic squiggles (from `validate()`, via `st.byPath`), and
 * client-side structural checks (mistyped operator, JS-scoped block balance)
 * that the engine can't yet locate. Errors carry `data-ml-*` attributes the
 * hover tooltip reads to render messages + quick-fixes.
 *
 * The doc is flattened into a single string first, so a `{{ … }}` that wraps
 * across a line break is still seen (and highlighted) as one token instead of
 * two broken halves.
 */
export function buildDecorations(
  doc: PMNode,
  st: ModelSyntaxState,
  opts: DecorationOptions,
): DecorationSet {
  const { labels } = opts;
  const show = (sev: DiagnosticSeverity) => opts.severities.includes(sev);
  const showErr = show("error");
  const decos: Decoration[] = [];

  // Flatten every text node into one string. `posAt[i]` is the doc position of
  // flattened char `i`; a synthetic newline (posAt = -1) marks each block
  // boundary so tokens on separate lines don't merge, while a token that truly
  // spans a break keeps the break as inner whitespace.
  let flat = "";
  const posAt: number[] = [];
  let prevEnd = -1;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    if (prevEnd >= 0 && pos !== prevEnd) {
      flat += "\n";
      posAt.push(-1);
    }
    const text = node.text;
    for (let k = 0; k < text.length; k++) {
      flat += text[k];
      posAt.push(pos + k);
    }
    prevEnd = pos + text.length;
  });

  const painter: Painter = {
    paint(a, b, attrs) {
      let from = -1;
      let to = -1;
      for (let i = a; i < b; i++) {
        const p = posAt[i];
        if (p < 0) {
          if (from >= 0) decos.push(Decoration.inline(from, to, attrs));
          from = -1;
          continue;
        }
        if (from < 0) {
          from = p;
          to = p + 1;
        } else if (p === to) {
          to = p + 1;
        } else {
          decos.push(Decoration.inline(from, to, attrs));
          from = p;
          to = p + 1;
        }
      }
      if (from >= 0) decos.push(Decoration.inline(from, to, attrs));
    },
    pos(i) {
      for (let k = i; k < posAt.length; k++) if (posAt[k] >= 0) return posAt[k];
      return doc.content.size;
    },
  };

  const blocks: Block[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(flat))) {
    const start = m.index;
    const end = start + m[0].length;
    const rawInner = m[0].slice(2, -2);
    const inner = rawInner.trim();
    const parsed = parseModelToken(inner);
    const innerStart = start + 2; // char offset of the inner text
    blocks.push({ start, end, inner });

    // Flow-card hover hook (whole token, invisible).
    if (parsed.namespace === "flow" && parsed.field) {
      painter.paint(start, end, {
        "data-card-id": parsed.field.split(".")[0],
      });
    }

    // Braces + per-token colouring inside.
    painter.paint(start, start + 2, { class: BRACE_CLASS });
    painter.paint(end - 2, end, { class: BRACE_CLASS });
    for (const tok of tokenizeExpression(rawInner)) {
      painter.paint(innerStart + tok.start, innerStart + tok.end, {
        class: HL_CLASS[tok.kind],
      });
    }

    // Precise field diagnostics — squiggle just the offending occurrence(s).
    const hasDefaultFilter = parsed.filters.some((f) => f.name === "default");
    const fieldFor = (path: string): MlField | undefined => {
      const dot = path.indexOf(".");
      if (dot < 0) return undefined;
      const ns = st.namespaces.find((n) => n.key === path.slice(0, dot));
      return ns?.fields.find((f) => f.key === path.slice(dot + 1));
    };
    for (const [fp, d] of st.byPath) {
      if (!fp || !show(d.severity)) continue;
      // Drop a missing-default warning when it doesn't apply to THIS token:
      // inside a condition/loop a null field compares fine, and a token that
      // already pipes through `| default: …` needs no default.
      if ((parsed.directive || hasDefaultFilter) && addsDefault(d)) continue;
      let idx = rawInner.indexOf(fp);
      while (idx >= 0) {
        // Match `fp` only as a WHOLE path (bounded by non-path chars) so an
        // incomplete `contact.` (ML101 while typing) doesn't squiggle every
        // `contact.first_name` around it.
        const prev = rawInner[idx - 1];
        const next = rawInner[idx + fp.length];
        const bounded =
          (prev === undefined || !/[\w.]/.test(prev)) &&
          (next === undefined || !/[\w.]/.test(next));
        if (bounded) {
          const attrs: Record<string, string> = {
            class: DIAG_CLASS[d.severity],
            "data-ml-error": d.message,
            "data-ml-sev": d.severity,
            "data-ml-code": d.code,
          };
          if (addsDefault(d)) {
            attrs["data-ml-fix-kind"] = "insert";
            attrs["data-ml-fix-pos"] = String(
              painter.pos(innerStart + idx + fp.length),
            );
            attrs["data-ml-fix-text"] = defaultFilterFor(fieldFor(fp));
            attrs["data-ml-fix-label"] = labels.addDefault;
          }
          painter.paint(innerStart + idx, innerStart + idx + fp.length, attrs);
        }
        idx = rawInner.indexOf(fp, idx + fp.length);
      }
    }

    // Condition sanity: inside `{{if …}}` / `{{elseif …}}`, a value path must
    // be followed by an operator — two bare words in a row (with something
    // after) means a missing / mistyped operator, e.g. `first_name conta "x"`.
    if (showErr && /^(if|elseif)\b/i.test(inner)) {
      const toks = tokenizeExpression(rawInner);
      for (let i = 0; i + 2 < toks.length; i++) {
        if (toks[i].kind === "path" && toks[i + 1].kind === "path") {
          const bad = toks[i + 1];
          const word = rawInner.slice(bad.start, bad.end);
          const attrs: Record<string, string> = {
            class: DIAG_CLASS.error,
            "data-ml-error": labels.expectedOperator,
            "data-ml-sev": "error",
            "data-ml-code": "ML001",
          };
          const suggest = suggestOperator(word);
          if (suggest) {
            attrs["data-ml-fix-kind"] = "replace";
            attrs["data-ml-fix-pos"] = String(
              painter.pos(innerStart + bad.start),
            );
            attrs["data-ml-fix-end"] = String(
              painter.pos(innerStart + bad.end),
            );
            attrs["data-ml-fix-text"] = suggest;
            attrs["data-ml-fix-label"] = labels.changeTo(suggest);
          }
          painter.paint(innerStart + bad.start, innerStart + bad.end, attrs);
        }
      }
    }
  }

  if (showErr) addBlockBalance(blocks, painter, labels);
  return DecorationSet.create(doc, decos);
}

type OpenBlock = { close: string; start: number; end: number };

/**
 * JS-scoped block-balance validation: a block opened inside a branch must close
 * inside that same branch — before `{{else}}` / `{{elseif}}` or the parent's
 * close. Crossing a branch boundary is an error, not something to silently
 * balance. Unclosed openers get a quick-fix to insert the close tag in scope.
 */
function addBlockBalance(
  blocks: Block[],
  painter: Painter,
  labels: ModelLanguageLabels,
): void {
  const errAttrs = (msg: string, fix?: string): Record<string, string> => {
    const a: Record<string, string> = {
      class: DIAG_CLASS.error,
      "data-ml-error": msg,
      "data-ml-sev": "error",
      "data-ml-code": "ML001",
    };
    if (fix) {
      a["data-ml-fix-kind"] = "append";
      a["data-ml-fix-text"] = fix;
      a["data-ml-fix-label"] = labels.addCloseTag(fix);
    }
    return a;
  };
  const flagUnclosed = (s: OpenBlock, boundary: number | null) => {
    const tag = `{{/${s.close}}}`;
    const a: Record<string, string> = {
      class: DIAG_CLASS.error,
      "data-ml-error": labels.unclosedBlock(s.close),
      "data-ml-sev": "error",
      "data-ml-code": "ML001",
      "data-ml-fix-text": tag,
      "data-ml-fix-label": labels.addCloseTag(tag),
    };
    if (boundary != null) {
      a["data-ml-fix-kind"] = "insertLine";
      a["data-ml-fix-pos"] = String(painter.pos(boundary));
    } else {
      a["data-ml-fix-kind"] = "append";
    }
    painter.paint(s.start, s.end, a);
  };

  const stack: OpenBlock[] = [];
  for (const b of blocks) {
    let mm: RegExpMatchArray | null;
    if (/^if\b/i.test(b.inner))
      stack.push({ close: "if", start: b.start, end: b.start + 4 });
    else if (/^for\b/i.test(b.inner))
      stack.push({ close: "for", start: b.start, end: b.start + 5 });
    else if ((mm = b.inner.match(/^#(\w+)/)))
      stack.push({
        close: mm[1].toLowerCase(),
        start: b.start,
        end: b.start + 2 + mm[0].length,
      });
    else if ((mm = b.inner.match(/^(elseif|else)\b/i))) {
      // A branch marker closes any block opened inside this branch (above the
      // parent). `else` branches an `if` OR a `for` (for-else = empty list);
      // `elseif` only an `if`.
      const branchesFor = mm[1].toLowerCase() === "else";
      let matched = false;
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.close === "if" || (branchesFor && top.close === "for")) {
          matched = true;
          break;
        }
        flagUnclosed(top, b.start);
        stack.pop();
      }
      if (!matched)
        painter.paint(b.start, b.end, errAttrs(labels.noOpenBlock("if")));
      // Leave the parent on the stack — the branch continues the same block.
    } else if ((mm = b.inner.match(/^\/(\w+)/))) {
      const name = mm[1].toLowerCase();
      let idx = -1;
      for (let k = stack.length - 1; k >= 0; k--)
        if (stack[k].close === name) {
          idx = k;
          break;
        }
      if (idx === -1)
        painter.paint(b.start, b.end, errAttrs(labels.noOpenBlock(name)));
      else {
        for (let k = stack.length - 1; k > idx; k--)
          flagUnclosed(stack[k], b.start);
        stack.length = idx;
      }
    }
  }
  for (const s of stack) flagUnclosed(s, null);
}
