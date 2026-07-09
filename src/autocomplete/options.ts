import { format as formatDate } from "date-fns";
import type { DirectiveSpec } from "model-language";
import type { DirectiveArgLabel } from "../core/types";
import {
  DATE_FORMATS,
  ML_FILTERS,
  type MlField,
  type MlFieldType,
  type MlFilter,
  type MlNamespace,
} from "../schema/namespaces";

export interface ModelTokenOption {
  /** Inner token text to insert (no braces). */
  insert: string;
  label: string;
  hint: string;
  group: string;
  kind: "path" | "filter" | "block";
  /** Terminal step → wrap `{{…}}` and finish. Non-terminal → keep the token
   *  open so the next stage (operator / value / filter) can autocomplete. */
  close: boolean;
}

// IANA timezones for the `date` filter's optional 2nd arg. Prefer the platform
// list (hundreds of zones); fall back to a common subset on older engines.
const COMMON_TZ = [
  "UTC",
  "Europe/Kyiv",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Tokyo",
];

/** Render a live sample of a `date` format token for the autocomplete hint.
 *  The engine uses Intl/LDML tokens (yyyy, dd, EEEE, HH, hh, mm, a) with
 *  `[literal]` escaping; date-fns uses the same vocabulary. Moment-style
 *  aliases someone might type (YYYY, DD, dddd, A) are normalised first, and
 *  anything date-fns rejects yields no example rather than throwing. */
function previewDateFormat(token: string): string {
  const t = token
    .replace(/\[([^\]]*)\]/g, "'$1'") // [literal] → date-fns 'literal'
    .replace(/YYYY/g, "yyyy")
    .replace(/YY/g, "yy")
    .replace(/DD/g, "dd")
    .replace(/dddd/g, "EEEE")
    .replace(/ddd/g, "EEE")
    .replace(/A/g, "a");
  try {
    return formatDate(new Date(), t);
  } catch {
    /* v8 ignore next -- the fixed DATE_FORMATS list never throws; defensive. */
    return "";
  }
}

function timezoneOptions(frag: string): string[] {
  /* v8 ignore start -- Intl.supportedValuesOf is always present on our targets;
     the try/catch + COMMON_TZ fallback only guard ancient runtimes. */
  let zones: string[] = [];
  try {
    zones =
      (
        Intl as { supportedValuesOf?: (k: string) => string[] }
      ).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  if (!zones.length) zones = COMMON_TZ;
  /* v8 ignore stop */
  const q = frag.toLowerCase();
  return zones.filter((z) => !q || z.toLowerCase().includes(q));
}

// ── Type helpers ─────────────────────────────────────────────────────────────

/** Resolve the value type of an expression `path | f1 | f2` (type-aware
 *  filters). Unknown / dynamic paths → "any". */
function resolveType(
  namespaces: MlNamespace[],
  expr: string,
): MlFieldType | "any" {
  const parts = expr
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return "any";
  let type: MlFieldType | "any" = "any";
  const f = findField(namespaces, parts[0]);
  if (f) type = f.type;
  for (let i = 1; i < parts.length; i++) {
    const meta = ML_FILTERS.find(
      (x) => x.name === parts[i].split(":")[0].trim(),
    );
    if (meta?.output) type = meta.output;
  }
  return type;
}

function filterApplies(f: MlFilter, type: MlFieldType | "any"): boolean {
  if (f.inputs === "any" || type === "any") return true;
  const t: MlFieldType = type === "enum" ? "string" : type;
  return f.inputs.includes(t);
}

function findField(
  namespaces: MlNamespace[],
  path: string,
): MlField | undefined {
  const dot = path.indexOf(".");
  if (dot < 0) return undefined;
  const ns = namespaces.find((n) => n.key === path.slice(0, dot));
  return ns?.fields.find((f) => f.key === path.slice(dot + 1));
}

/** All fields (across namespaces, incl. dynamic flow) matching a fragment. */
function fieldMatches(
  namespaces: MlNamespace[],
  frag: string,
): { path: string; f: MlField }[] {
  const out: { path: string; f: MlField }[] = [];
  const q = frag.toLowerCase();
  for (const ns of namespaces) {
    for (const f of ns.fields) {
      const path = `${ns.key}.${f.key}`;
      if (
        q &&
        !path.toLowerCase().includes(q) &&
        !f.label.toLowerCase().includes(q)
      )
        continue;
      out.push({ path, f });
    }
  }
  return out;
}

// ── Stage: operators for a resolved field (after `if <path> `) ────────────────

function operatorOptions(
  lead: string,
  path: string,
  f: MlField,
): ModelTokenOption[] {
  // `lead` is `if ` (+ any prior `… and `) — prepended to every completion.
  const g = { group: "Operator", kind: "block" as const, hint: `${f.type}` };
  // value ops: enum → step to value list; others → close with a placeholder.
  // Value ops keep the token OPEN → after the value the connector stage offers
  // `and` / `or` / finish. Enum steps to a value list; others drop the cursor
  // into `""`.
  const valOp = (op: string): ModelTokenOption => ({
    ...g,
    insert: f.values?.length
      ? `${lead}${path} ${op} `
      : `${lead}${path} ${op} ""`,
    label: f.values?.length ? `${op} …` : `${op} "…"`,
    close: false,
  });
  // Negation: `not` is a prefix (`not (a contains b)`); since comparisons bind
  // tighter than `not`, `not a contains b` reads as "does not contain".
  const notValOp = (op: string): ModelTokenOption => ({
    ...g,
    insert: `${lead}not ${path} ${op} ""`,
    label: `not ${op} "…"`,
    close: false,
  });
  const listOp = (op: string): ModelTokenOption => ({
    ...g,
    insert: `${lead}${path} ${op} [""]`,
    label: `${op} […]`,
    close: false,
  });
  // Enum-backed array operator: open a `[` so the value stage builds the list
  // `["a", "b"]` from the field's values, one pick at a time.
  const arrValOp = (op: string): ModelTokenOption => ({
    ...g,
    insert: `${lead}${path} ${op} [`,
    label: `${op} […]`,
    close: false,
  });
  const numOp = (op: string): ModelTokenOption => ({
    ...g,
    insert: `${lead}${path} ${op} `,
    label: `${op} …`,
    close: false,
  });
  const bare = (op: string): ModelTokenOption => ({
    ...g,
    insert: `${lead}${path} ${op} `,
    label: op,
    close: false,
  });
  const notBare = (op: string): ModelTokenOption => ({
    ...g,
    insert: `${lead}not ${path} ${op} `,
    label: `not ${op}`,
    close: false,
  });
  const dateFilter = (name: string, tail = ""): ModelTokenOption => ({
    ...g,
    insert: `${lead}${path} | ${name}${tail}`,
    label: `| ${name}${tail}`,
    close: false,
  });

  switch (f.type) {
    case "boolean":
      return [
        { ...g, insert: `${lead}${path}`, label: "is true", close: true },
        { ...g, insert: `${lead}not ${path}`, label: "is false", close: true },
      ];
    case "number":
      return [
        numOp("=="),
        numOp("!="),
        numOp(">"),
        numOp("<"),
        numOp(">="),
        numOp("<="),
        listOp("in"),
        bare("exists"),
        notBare("exists"),
      ];
    case "datetime":
      // Dates compare through filters, not raw.
      return [
        dateFilter("is_past"),
        dateFilter("is_future"),
        dateFilter("days_ago", " > 30"),
        dateFilter("days_until", " < 30"),
        bare("exists"),
        notBare("exists"),
      ];
    case "array": // multiEnum
      return [
        valOp("contains"),
        notValOp("contains"),
        arrValOp("contains_any"),
        arrValOp("contains_all"),
        bare("is_empty"),
        notBare("is_empty"),
        bare("exists"),
      ];
    case "enum":
      return [
        valOp("=="),
        valOp("!="),
        arrValOp("in"),
        bare("exists"),
        notBare("exists"),
      ];
    default: // string
      return [
        valOp("=="),
        valOp("!="),
        valOp("contains"),
        notValOp("contains"),
        valOp("startsWith"),
        valOp("endsWith"),
        valOp("matches"),
        listOp("in"),
        bare("is_empty"),
        bare("exists"),
        notBare("exists"),
      ];
  }
}

// ── Blocks ───────────────────────────────────────────────────────────────────

const BLOCK_SNIPPETS: Omit<ModelTokenOption, "group" | "kind">[] = [
  { insert: "if ", label: "if …", hint: "condition block", close: false },
  {
    insert: "elseif ",
    label: "elseif …",
    hint: "another branch",
    close: false,
  },
  { insert: "else", label: "else", hint: "fallback branch", close: true },
  { insert: "/if", label: "/if", hint: "close the if block", close: true },
  {
    insert: "for item in ",
    label: "for … in …",
    hint: "loop over a list",
    close: false,
  },
  { insert: "/for", label: "/for", hint: "close the for loop", close: true },
  {
    insert: "#priority ",
    label: "#priority …",
    hint: "set priority level",
    close: false,
  },
  {
    insert: "/priority",
    label: "/priority",
    hint: "close the priority block",
    close: true,
  },
  {
    insert: 'include "signature"',
    label: "include …",
    hint: "reusable snippet",
    close: true,
  },
];

// ── Inline directives ────────────────────────────────────────────────────────

/**
 * Arg completions for an inline directive `{{name: <frag>}}`, driven by its
 * `DirectiveSpec`: enum values for a scalar enum, an incrementally-built `[a, b]`
 * for a list enum, and field paths for the LEFT operand of a comparison
 * (`identity`). Free-form scalars (number / text / id) get no value list.
 */
function directiveArgOptions(
  spec: DirectiveSpec,
  frag: string,
  namespaces: MlNamespace[],
  argLabel?: DirectiveArgLabel,
): ModelTokenOption[] {
  const arg = spec.arg;
  if (!arg) return [];
  const hint = spec.description || `${spec.name} argument`;
  // A value's display label (e.g. operator id → name); the inserted text stays
  // the raw value, so `{{assignedTo: [1]}}` is what's saved / rendered.
  const labelOf = (v: string) => argLabel?.(spec.name, v) ?? v;
  const hintFor = (v: string) => (labelOf(v) !== v ? `${hint} · ${v}` : hint);
  const g = { hint, group: "Directive arg", kind: "block" as const };

  // Comparison (identity): complete BOTH operands with a field path. `field`
  // operands offer the field list; a `text` right operand is free input.
  if (arg.kind === "comparison") {
    /* v8 ignore next 2 -- a comparison spec always carries operators + operandType. */
    const op = arg.comparison?.operators[0] ?? "==";
    const asField = (arg.comparison?.operandType ?? "field") === "field";
    // Right operand: `<left> <op> <frag>` → complete + close the comparison.
    const rhs = frag.match(/^([\w.]+)\s*(==|!=|<=|>=|<|>)\s*([\w.]*)$/);
    if (rhs) {
      if (!asField) return [];
      const [, lhs, cmp, rfrag] = rhs;
      return fieldMatches(namespaces, rfrag).map(({ path, f }) => ({
        insert: `${spec.name}: ${lhs} ${cmp} ${path}`,
        label: path,
        hint: `${f.label} · ${f.type}`,
        group: "Directive arg",
        kind: "path" as const,
        close: true,
      }));
    }
    // Left operand: complete the field, then step to the operator.
    const left = frag.match(/^([\w.]*)$/);
    if (!left) return [];
    return fieldMatches(namespaces, left[1]).map(({ path, f }) => ({
      insert: `${spec.name}: ${path} ${op} `,
      label: path,
      hint: `${f.label} · ${f.type}`,
      group: "Directive arg",
      kind: "path" as const,
      close: false,
    }));
  }

  const values = arg.values ?? [];
  if (!values.length) return [];

  // List enum / id list (e.g. assignedToRoles, assignedTo): build `[A, B]` one
  // value at a time. Split on commas so any value shape (ids too) is handled.
  if (arg.kind === "list") {
    const body = frag.replace(/^\[/, "");
    const segs = body.split(",");
    const fq = (segs.at(-1) ?? "").trim().toLowerCase();
    const picked = segs
      .slice(0, -1)
      .map((s) => s.trim())
      .filter((s) => values.includes(s));
    const prefix = picked.join(", ");
    const open = `${spec.name}: [${prefix}${prefix ? ", " : ""}`;
    const out: ModelTokenOption[] = values
      .filter(
        (v) =>
          !picked.includes(v) &&
          (!fq ||
            v.toLowerCase().includes(fq) ||
            labelOf(v).toLowerCase().includes(fq)),
      )
      .map((v) => ({
        ...g,
        insert: `${open}${v}, `,
        label: labelOf(v),
        hint: hintFor(v),
        close: false,
      }));
    if (picked.length)
      out.push({
        ...g,
        insert: `${spec.name}: [${prefix}]`,
        label: "· done ·",
        hint: "close the list",
        close: true,
      });
    return out;
  }

  // Scalar enum (e.g. verify_before): a single value, close.
  const fq = frag.trim().replace(/^"|"$/g, "").toLowerCase();
  return values
    .filter(
      (v) =>
        !fq ||
        v.toLowerCase().includes(fq) ||
        labelOf(v).toLowerCase().includes(fq),
    )
    .map((v) => ({
      ...g,
      insert: `${spec.name}: ${v}`,
      label: labelOf(v),
      hint: hintFor(v),
      close: true,
    }));
}

// ── Main: staged completion ──────────────────────────────────────────────────

/**
 * Staged autocomplete: each pick advances one step and keeps the token open
 * until a terminal step, so the flow is field → operator → value/filter → done.
 */
export function buildModelOptions(
  namespaces: MlNamespace[],
  query: string,
  directives: DirectiveSpec[] = [],
  directiveArgLabel?: DirectiveArgLabel,
): ModelTokenOption[] {
  // 1. Filter / date-format stage (after a pipe).
  const pipe = query.lastIndexOf("|");
  if (pipe >= 0) {
    const left = query.slice(0, pipe).trim();
    const seg = query.slice(pipe + 1);

    // `date: "FMT", "<tz>"` — the format string is done, now the timezone arg.
    const dateTz = seg.match(/^\s*date\s*:\s*"([^"]*)"\s*,\s*"?([^"]*)$/i);
    if (dateTz) {
      const [, fmt, tzFrag] = dateTz;
      return timezoneOptions(tzFrag).map((z) => ({
        insert: `${left} | date: "${fmt}", "${z}"`,
        label: z,
        hint: "timezone",
        group: "Timezone",
        kind: "filter" as const,
        close: true,
      }));
    }

    const dateArg = seg.match(/^\s*date\s*:\s*"?([^"]*)$/i);
    if (dateArg) {
      const dq = dateArg[1].toLowerCase();
      return DATE_FORMATS.filter(
        (d) => !dq || d.toLowerCase().includes(dq),
      ).map((d) => {
        const eg = previewDateFormat(d);
        return {
          insert: `${left} | date: "${d}"`,
          label: `"${d}"`,
          // Show what the token renders as right now, e.g. "Jul 6, 2026".
          /* v8 ignore next -- DATE_FORMATS all render, so `eg` is never empty. */
          hint: eg ? `e.g. ${eg}` : "date/time format",
          group: "Date format",
          kind: "filter",
          close: true,
        };
      });
    }

    // Default-value stage — `<expr> | default: <frag>` steps to a type-aware
    // value: the field's options (enum / array are both value-list fields),
    // boolean true/false, a number, or free text.
    const defArg = seg.match(/^\s*default\s*:\s*(.*)$/i);
    if (defArg) {
      const field = findField(namespaces, left.split("|")[0].trim());
      const dtype = resolveType(namespaces, left);
      const frag = defArg[1].trim().replace(/^"|"$/g, "").toLowerCase();
      const mk = (val: string, label: string): ModelTokenOption => ({
        insert: `${left} | default: ${val}`,
        label,
        hint: "default value",
        group: "Default",
        kind: "filter",
        close: true,
      });
      if (field?.values?.length)
        return field.values
          .filter((v) => !frag || v.toLowerCase().includes(frag))
          .map((v) => mk(`"${v}"`, `"${v}"`));
      if (dtype === "boolean")
        return [mk("true", "true"), mk("false", "false")].filter(
          (o) => !frag || o.label.toLowerCase().includes(frag),
        );
      if (dtype === "number") return [mk("0", "0")];
      return [mk('""', '"…"')];
    }

    const fq = seg.trim().toLowerCase();
    const type = resolveType(namespaces, left);
    // In a condition, filters are transforms-before-compare — only keep the ones
    // that yield a comparable value (boolean / number), not display filters like
    // `replace` / `upper` (those belong in interpolation).
    const inCondition = /^(if|elseif)\s/i.test(query);
    return ML_FILTERS.filter(
      (f) =>
        (!fq || f.name.includes(fq)) &&
        filterApplies(f, type) &&
        (!inCondition || f.output === "boolean" || f.output === "number"),
    ).map((f) => ({
      insert:
        f.name === "date"
          ? `${left} | date: ` // → date-format stage
          : f.name === "default"
            ? `${left} | default: ` // → default-value stage
            : `${left} | ${f.name}${f.argTemplate ?? ""}`,
      label: `| ${f.name}`,
      hint: f.hint,
      group: "Filters",
      kind: "filter",
      close: f.name !== "date" && f.name !== "default",
    }));
  }

  // 1.5 Priority level — `{{#priority <frag>}}` steps to high / medium / low.
  const prm = query.match(/^#priority\s+(\w*)$/i);
  if (prm) {
    const pq = prm[1].toLowerCase();
    return ["high", "medium", "low"]
      .filter((l) => !pq || l.startsWith(pq))
      .map((l) => ({
        insert: `#priority ${l}`,
        label: l,
        hint: "priority level",
        group: "Priority",
        kind: "block" as const,
        close: true,
      }));
  }

  // 1.6 Inline directive argument — `{{verify_before: <frag>}}` etc. The head is
  // a known directive name followed by a colon; complete its arg from the spec.
  const dirArg = query.match(/^([A-Za-z_]\w*)\s*:\s*(.*)$/);
  if (dirArg) {
    const spec = directives.find((d) => d.name === dirArg[1]);
    if (spec)
      return directiveArgOptions(
        spec,
        dirArg[2],
        namespaces,
        directiveArgLabel,
      );
  }

  // 2. Condition stages: if / elseif → path → operator → value → and/or.
  const cm = query.match(/^(if|elseif)\s+(.*)$/i);
  if (cm) {
    const kw = cm[1].toLowerCase();
    const rest = cm[2];
    // Split the CURRENT clause off the tail so `and` / `or` can chain multiple
    // comparisons — stages operate on the current clause, `lead` carries the rest.
    const conn = rest.match(/^(.*\b(?:and|or)\s+)(.*)$/i);
    const prefix = conn ? conn[1] : "";
    let clause = conn ? conn[2] : rest;
    let lead = `${kw} ${prefix}`;
    // A leading `not` negates the comparison — fold it into `lead` so the path
    // stage sees a clean `contact.…` fragment (not `not contact.…`).
    const negate = clause.match(/^(not\s+)(.*)$/i);
    if (negate) {
      lead += negate[1];
      clause = negate[2];
    }

    // 2d. Connector stage — a complete clause + trailing space → and / or / done.
    if (
      /(?:"[^"]*"|\]|\b(?:exists|is_empty|is_past|is_future)\b|>\s*\d|\d)\s+$/i.test(
        clause,
      )
    ) {
      const cur = `${kw} ${rest.trim()}`;
      return [
        {
          insert: `${cur} and `,
          label: "and",
          hint: "both must match",
          group: "Connector",
          kind: "block",
          close: false,
        },
        {
          insert: `${cur} or `,
          label: "or",
          hint: "either matches",
          group: "Connector",
          kind: "block",
          close: false,
        },
        {
          insert: cur,
          label: "· finish ·",
          hint: "close the condition",
          group: "Connector",
          kind: "block",
          close: true,
        },
      ];
    }

    // 2c-array. Array value stage — `<path> <arrayOp> [ … ` builds an array
    // literal `["a", "b"]` from the field's enum values, one pick at a time,
    // instead of the bare `"a"` a scalar comparison would insert.
    const am = clause.match(
      /^([\w.]+)\s+(in|contains_any|contains_all)\s+\[([^\]]*)$/,
    );
    if (am) {
      const f = findField(namespaces, am[1]);
      if (!f?.values?.length) return [];
      const body = am[3];
      const picked = [...body.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
      const fragMatch = body.match(/(?:^|,)\s*"?([^",\]]*)$/);
      /* v8 ignore next -- the trailing-fragment regex always matches (even empty). */
      const frag = (fragMatch ? fragMatch[1] : "").toLowerCase();
      const prefix = picked.map((v) => `"${v}"`).join(", ");
      const open = `${lead}${am[1]} ${am[2]} [${prefix}${prefix ? ", " : ""}`;
      const opts: ModelTokenOption[] = f.values
        .filter(
          (v) =>
            !picked.includes(v) && (!frag || v.toLowerCase().includes(frag)),
        )
        .map((v) => ({
          insert: `${open}"${v}", `,
          label: `"${v}"`,
          hint: f.label,
          group: "Value",
          kind: "block" as const,
          close: false,
        }));
      if (picked.length)
        opts.push({
          insert: `${lead}${am[1]} ${am[2]} [${prefix}] `,
          label: "· done ·",
          hint: "close the list",
          group: "Value",
          kind: "block",
          close: false,
        });
      return opts;
    }

    // 2c. Value stage (enum) — `<path> <op> <frag>`.
    const vm = clause.match(/^([\w.]+)\s+(==|!=|contains)\s+"?([^"]*)$/);
    if (vm) {
      const f = findField(namespaces, vm[1]);
      if (f?.values?.length) {
        const vq = vm[3].toLowerCase();
        return f.values
          .filter((v) => !vq || v.toLowerCase().includes(vq))
          .map((v) => ({
            insert: `${lead}${vm[1]} ${vm[2]} "${v}" `,
            label: `"${v}"`,
            hint: f.label,
            group: "Value",
            kind: "block",
            close: false,
          }));
      }
      return [];
    }

    // 2b. Operator stage — `<complete path> <opFrag>`.
    const om = clause.match(/^([\w.]+)\s+([^\s]*)$/);
    if (om) {
      const f = findField(namespaces, om[1]);
      if (!f) return [];
      const of = om[2].toLowerCase();
      // Match the fragment against the operator LABEL only — `o.insert` carries
      // the whole `lead` (incl. any earlier `contains "…"`), so matching it
      // would let a fragment like `conta` match every operator.
      return operatorOptions(lead, om[1], f).filter(
        (o) => !of || o.label.toLowerCase().includes(of),
      );
    }

    // 2a. Path stage — typing the field.
    const pm = clause.match(/^([\w.]*)$/);
    if (pm) {
      return fieldMatches(namespaces, pm[1]).map(({ path, f }) => ({
        insert: `${lead}${path} `,
        label: path,
        hint: `${f.label} · ${f.type}`,
        group: "Field",
        kind: "path",
        close: false,
      }));
    }
    return [];
  }

  // 3. For-loop target — `for x in <frag>`.
  const fm = query.match(/^for\s+\w+\s+in\s+([\w.]*)$/i);
  if (fm) {
    return fieldMatches(namespaces, fm[1]).map(({ path, f }) => ({
      insert: `for item in ${path}`,
      label: path,
      hint: `${f.label} · ${f.type}`,
      group: "Loop over",
      kind: "path",
      close: true,
    }));
  }

  // 3.5 Interpolation post-path — a complete path + space → filters + finish
  // (the tree continues instead of closing immediately).
  const bv = query.match(/^([\w.]+)\s+$/);
  if (bv) {
    const f = findField(namespaces, bv[1]);
    if (f) {
      const out: ModelTokenOption[] = [
        {
          insert: bv[1],
          label: "· insert ·",
          hint: "use as-is",
          group: "Finish",
          kind: "block",
          close: true,
        },
      ];
      for (const flt of ML_FILTERS.filter((x) => filterApplies(x, f.type))) {
        out.push({
          insert:
            flt.name === "date"
              ? `${bv[1]} | date: `
              : flt.name === "default"
                ? `${bv[1]} | default: `
                : `${bv[1]} | ${flt.name}${flt.argTemplate ?? ""}`,
          label: `| ${flt.name}`,
          hint: flt.hint,
          group: "Filters",
          kind: "filter",
          close: flt.name !== "date" && flt.name !== "default",
        });
      }
      return out;
    }
  }

  // 4. Interpolation / blocks / bare paths.
  const q = query.trim().toLowerCase();
  const opts: ModelTokenOption[] = [];
  for (const b of BLOCK_SNIPPETS) {
    if (
      q &&
      !b.label.toLowerCase().includes(q) &&
      !b.insert.toLowerCase().includes(q)
    )
      continue;
    opts.push({ ...b, group: "Blocks", kind: "block" });
  }
  for (const d of directives) {
    if (q && !d.name.toLowerCase().includes(q)) continue;
    opts.push({
      insert: `${d.name}: `,
      label: `${d.name}: …`,
      hint: d.description || "inline directive",
      group: "Directives",
      kind: "block",
      close: false,
    });
  }
  for (const { path, f } of fieldMatches(namespaces, query.trim())) {
    opts.push({
      insert: `${path} `,
      label: path,
      hint: f.values?.length ? `${f.label}: ${f.values.join(", ")}` : f.label,
      group: "Variables",
      kind: "path",
      close: false,
    });
  }
  return opts;
}

/** Distinct group labels in first-seen order (section render order). */
export function optionGroups(options: ModelTokenOption[]): string[] {
  const seen: string[] = [];
  for (const o of options) if (!seen.includes(o.group)) seen.push(o.group);
  return seen;
}

/** Cap each group so a large field list can't swamp the menu. */
export function capOptions(
  options: ModelTokenOption[],
  perGroup = 8,
): ModelTokenOption[] {
  const counts = new Map<string, number>();
  return options.filter((o) => {
    const n = counts.get(o.group) ?? 0;
    if (n >= perGroup) return false;
    counts.set(o.group, n + 1);
    return true;
  });
}
