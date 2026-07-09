// Model-language namespace + filter model (docs/MODEL_LANGUAGE_FE.md §2–3).
// The static namespaces are fixed; `contact.*` is filled at runtime from the
// org's people-field definitions (see useModelVariables).

export type MlFieldType =
  | "string"
  | "number"
  | "datetime"
  | "boolean"
  | "enum"
  | "array";

export interface MlField {
  key: string;
  type: MlFieldType;
  /** Friendly label for the chip / autocomplete row. */
  label: string;
  /** Allowed values for enum fields (used only for hints). */
  values?: string[];
}

export interface MlNamespace {
  key: string;
  label: string;
  /** Runtime-only namespace (e.g. flow.*) — never autocompleted or flagged. */
  dynamic?: boolean;
  fields: MlField[];
}

export const CONTACT_NAMESPACE_KEY = "contact";
export const FLOW_NAMESPACE_KEY = "flow";

/** Fixed namespaces — schema is constant across orgs. */
export const STATIC_NAMESPACES: MlNamespace[] = [
  {
    key: "system",
    label: "System",
    fields: [
      { key: "now", type: "datetime", label: "Current date/time" },
      { key: "timezone", type: "string", label: "Timezone" },
    ],
  },
  {
    key: "conversation",
    label: "Conversation",
    fields: [
      { key: "id", type: "string", label: "Conversation ID" },
      { key: "integrationId", type: "string", label: "Integration ID" },
      { key: "title", type: "string", label: "Title" },
      { key: "unreadCount", type: "number", label: "Unread count" },
    ],
  },
  {
    key: "organisation",
    label: "Organisation",
    fields: [
      { key: "id", type: "string", label: "Org ID" },
      { key: "name", type: "string", label: "Name" },
      { key: "website", type: "string", label: "Website" },
      { key: "phone", type: "string", label: "Phone" },
      { key: "email", type: "string", label: "Email" },
      { key: "description", type: "string", label: "Description" },
    ],
  },
  {
    key: "lastMessage",
    label: "Last message",
    fields: [
      { key: "text", type: "string", label: "Text" },
      { key: "deliveryStatus", type: "string", label: "Delivery status" },
    ],
  },
];

// ── Filters ──────────────────────────────────────────────────────────────────

export interface MlFilter {
  name: string;
  hint: string;
  /** Placeholder args appended on insert, e.g. `: "there"`. */
  argTemplate?: string;
  /** Value types this filter accepts (`"any"` = always offered). */
  inputs: MlFieldType[] | "any";
  /** Resulting type (for chaining `a | f1 | f2`); omit = preserves input. */
  output?: MlFieldType;
}

/** Example `date` format tokens. The engine uses Intl/LDML tokens (lowercase
 *  `yyyy`, `dd`; `EEEE` weekday; `MM`; 24h `HH`, 12h `hh`) — NOT moment/dayjs
 *  style — plus `[literal]` escaping. Offered as insert suggestions. */
export const DATE_FORMATS = [
  "yyyy-MM-dd",
  "MMM d, yyyy",
  "HH:mm",
  "h:mm A",
  "EEEE",
] as const;

/** Engine filters (model-language). Grouped by input type; wrong input passes
 *  through unchanged (the engine never throws). */
export const ML_FILTERS: MlFilter[] = [
  // text (string / enum)
  {
    name: "default",
    hint: "Fallback when empty",
    argTemplate: ': "there"',
    inputs: "any",
  },
  {
    name: "upper",
    hint: "UPPERCASE",
    inputs: ["string", "enum"],
    output: "string",
  },
  {
    name: "lower",
    hint: "lowercase",
    inputs: ["string", "enum"],
    output: "string",
  },
  {
    name: "capitalize",
    hint: "Capitalise first letter",
    inputs: ["string", "enum"],
    output: "string",
  },
  {
    name: "trim",
    hint: "Trim whitespace",
    inputs: ["string"],
    output: "string",
  },
  {
    name: "truncate",
    hint: "Shorten to N chars",
    argTemplate: ": 40",
    inputs: ["string"],
    output: "string",
  },
  {
    name: "replace",
    hint: "Replace text",
    argTemplate: ': "a", "b"',
    inputs: ["string"],
    output: "string",
  },
  // number
  {
    name: "round",
    hint: "Round to N decimals",
    argTemplate: ": 2",
    inputs: ["number"],
    output: "number",
  },
  { name: "floor", hint: "Round down", inputs: ["number"], output: "number" },
  { name: "ceil", hint: "Round up", inputs: ["number"], output: "number" },
  { name: "abs", hint: "Absolute value", inputs: ["number"], output: "number" },
  {
    name: "percent",
    hint: "Format as a percentage",
    inputs: ["number"],
    output: "string",
  },
  {
    name: "currency",
    hint: "Format as currency",
    argTemplate: ': "USD"',
    inputs: ["number"],
    output: "string",
  },
  // datetime
  {
    name: "date",
    hint: 'Format a date, e.g. "HH:mm"',
    argTemplate: ': "MMM d, yyyy"',
    inputs: ["datetime"],
    output: "string",
  },
  {
    name: "days_ago",
    hint: "Whole days since (number)",
    inputs: ["datetime"],
    output: "number",
  },
  {
    name: "days_until",
    hint: "Whole days until (number)",
    inputs: ["datetime"],
    output: "number",
  },
  {
    name: "is_past",
    hint: "True if in the past",
    inputs: ["datetime"],
    output: "boolean",
  },
  {
    name: "is_future",
    hint: "True if in the future",
    inputs: ["datetime"],
    output: "boolean",
  },
  // array
  {
    name: "count",
    hint: "Number of items",
    inputs: ["array"],
    output: "number",
  },
  {
    name: "join",
    hint: "Join a list",
    argTemplate: ': ", "',
    inputs: ["array"],
    output: "string",
  },
  { name: "first", hint: "First item", inputs: ["array"] },
  { name: "last", hint: "Last item", inputs: ["array"] },
  {
    name: "limit",
    hint: "Keep the first N",
    argTemplate: ": 3",
    inputs: ["array"],
    output: "array",
  },
  {
    name: "pluck",
    hint: "Pull one field from each",
    argTemplate: ': "name"',
    inputs: ["array"],
    output: "array",
  },
  {
    name: "where",
    hint: "Filter a list",
    argTemplate: ': "status", "==", "open"',
    inputs: ["array"],
    output: "array",
  },
  {
    name: "sort",
    hint: "Sort a list",
    argTemplate: ': "field"',
    inputs: ["array"],
    output: "array",
  },
  { name: "sum", hint: "Sum a list", inputs: ["array"], output: "number" },
  { name: "max", hint: "Largest", inputs: ["array"], output: "number" },
  { name: "min", hint: "Smallest", inputs: ["array"], output: "number" },
];

// ── Token parsing ────────────────────────────────────────────────────────────

export interface ParsedFilter {
  name: string;
  args: string;
}

export interface ParsedToken {
  /** Full path, e.g. "contact.first_name". */
  path: string;
  namespace: string;
  field: string;
  filters: ParsedFilter[];
  /** True for control tokens ({{if …}}, {{for …}}, {{/if}}, …). */
  directive: boolean;
}

// Control tokens: keywords, close tags (/if, /for, /priority), directives
// (#priority, # comment) and includes — everything that isn't a value path.
const DIRECTIVE_RE = /^(#|\/[a-z]|(?:if|elseif|else|for|end|include)\b)/i;

/** Split on top-level `|` (pipes inside quotes don't count). */
function splitPipes(inner: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "|") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Parse a token's inner text (no braces) into path + filters. When
 *  `directives` is given, an inline-directive head (`name: …` where `name` is a
 *  known directive) is also classified as a directive, so it isn't treated as a
 *  value path. */
export function parseModelToken(
  inner: string,
  directives?: Set<string>,
): ParsedToken {
  const trimmed = inner.trim();
  let directive = DIRECTIVE_RE.test(trimmed);
  if (!directive && directives?.size) {
    const head = trimmed.match(/^([A-Za-z_]\w*)\s*:/);
    if (head && directives.has(head[1])) directive = true;
  }
  const parts = splitPipes(inner);
  const path = (parts[0] ?? "").trim();
  const dot = path.indexOf(".");
  const filters: ParsedFilter[] = parts.slice(1).map((p) => {
    const seg = p.trim();
    const colon = seg.indexOf(":");
    return colon < 0
      ? { name: seg, args: "" }
      : { name: seg.slice(0, colon).trim(), args: seg.slice(colon + 1).trim() };
  });
  return {
    path,
    namespace: dot < 0 ? path : path.slice(0, dot),
    field: dot < 0 ? "" : path.slice(dot + 1),
    filters,
    directive,
  };
}
