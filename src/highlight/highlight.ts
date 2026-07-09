// Lightweight tokenizer for the inside of a `{{ … }}` expression, so each part
// gets its own colour (keywords vs variables vs operators vs math vs strings…).
// Regex-based — no AST/WASM — which keeps it fast + dependency-free.

export type HlKind =
  | "keyword"
  | "directive"
  | "operator"
  | "math"
  | "string"
  | "number"
  | "filter"
  | "func"
  | "path"
  | "punct";

export interface HlToken {
  start: number;
  end: number;
  kind: HlKind;
}

export const HL_CLASS: Record<HlKind, string> = {
  keyword: "text-violet-600 dark:text-violet-400 font-medium", // if / for / else
  directive: "text-fuchsia-600 dark:text-fuchsia-400 font-medium", // verify_before: identity:
  operator: "text-pink-600 dark:text-pink-400", // == contains exists and or
  math: "text-orange-600 dark:text-orange-400", // + - * / ( )
  string: "text-emerald-600 dark:text-emerald-400", // "..."
  number: "text-orange-500 dark:text-orange-300", // 123 true false
  filter: "text-teal-600 dark:text-teal-400", // | default
  func: "text-cyan-600 dark:text-cyan-400", // calculate(
  path: "text-sky-600 dark:text-sky-400", // contact.first_name
  punct: "text-muted-foreground", // , : |
};

const KEYWORDS = new Set(["if", "elseif", "else", "for", "end", "include"]);
const WORD_OPS = new Set([
  "and",
  "or",
  "not",
  "in",
  "contains",
  "contains_any",
  "contains_all",
  "is_empty",
  "exists",
  "startswith",
  "endswith",
  "matches",
]);
const LITERALS = new Set(["true", "false", "null"]);

// Ordered alternation: whitespace | string | number | identifier(+#// directives)
//   | comparison op | pipe/math | punctuation | any-other.
const SCAN =
  /(\s+)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\d+(?:\.\d+)?)|([#/]?[A-Za-z_][\w.]*)|(==|!=|<=|>=|[<>=])|(\|\||\||[-+*/()])|([,:])|(.)/y;

/**
 * Tokenize the raw inner text of a `{{ … }}` (no braces) into coloured spans.
 * When `directives` is given, a head identifier in that set (the first token,
 * e.g. `verify_before` in `{{verify_before: …}}`) is coloured as a directive.
 */
export function tokenizeExpression(
  s: string,
  directives?: Set<string>,
): HlToken[] {
  const out: HlToken[] = [];
  SCAN.lastIndex = 0;
  let afterPipe = false;
  let atHead = true; // still before the first non-whitespace token
  let m: RegExpExecArray | null;
  while ((m = SCAN.exec(s))) {
    const start = m.index;
    const end = start + m[0].length;
    /* v8 ignore next 4 -- defensive: every char matches a group, so the sticky
       regex never returns a zero-width match, but guard against an infinite loop. */
    if (end === start) {
      SCAN.lastIndex++;
      continue;
    }
    if (m[1]) continue; // whitespace — preserves afterPipe + atHead

    let kind: HlKind = "punct";
    if (m[2]) kind = "string";
    else if (m[3]) kind = "number";
    else if (m[4]) {
      const raw = m[4];
      const lower = raw.toLowerCase();
      if (atHead && directives?.has(raw)) kind = "directive";
      else if (raw[0] === "#" || raw[0] === "/") kind = "keyword";
      else if (KEYWORDS.has(lower)) kind = "keyword";
      else if (WORD_OPS.has(lower)) kind = "operator";
      else if (LITERALS.has(lower)) kind = "number";
      else if (afterPipe) kind = "filter";
      else kind = /^\s*\(/.test(s.slice(end)) ? "func" : "path";
    } else if (m[5]) kind = "operator";
    else if (m[6]) {
      if (m[0] === "|") {
        out.push({ start, end, kind: "punct" });
        afterPipe = true;
        atHead = false;
        continue;
      }
      kind = m[0] === "||" ? "operator" : "math";
    } else if (m[7]) kind = "punct";

    out.push({ start, end, kind });
    afterPipe = false;
    atHead = false;
  }
  return out;
}
