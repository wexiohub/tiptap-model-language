import type { Diagnostic, DirectiveSpec } from "model-language";
import { SEV_RANK } from "../core/constants";
import type {
  RangeDiagnostic,
  TemplateDiagnostic,
  TokenDiagnostic,
} from "../core/types";
import type { MlField } from "../schema/namespaces";

/** Engine diagnostics that carry no `fieldPath` but are rendered elsewhere, so
 *  they must NOT be turned into a range squiggle: ML001 (client block-balance +
 *  operator sanity, with quick-fixes) and ML213 (whole-prompt token budget). */
const RANGE_SKIP = new Set(["ML001", "ML213"]);

export interface MappedDiagnostics {
  /** The flat list surfaced to the host via `onResult`. */
  diagnostics: TemplateDiagnostic[];
  /** Field-keyed, worst-severity-wins (for the precise field squiggles). */
  byPath: Map<string, TokenDiagnostic>;
  /** Range-keyed (directives ML240–244, no field path) for token squiggles. */
  byRange: RangeDiagnostic[];
}

/**
 * Turn raw engine diagnostics into the shapes the editor renders: a localized
 * flat list, a field-path map, and a range map for directive diagnostics. Pure —
 * the DOM glue (debounce, dispatch) lives in `runValidation`.
 */
export function mapDiagnostics(
  raw: readonly Diagnostic[],
  directives: DirectiveSpec[],
  translateDiagnostic?: (d: TemplateDiagnostic) => string | undefined,
): MappedDiagnostics {
  // A directive name typed without its `:` yet (`{{identity`) is parsed by the
  // engine as an unknown FIELD (ML101, fieldPath = the name). Drop those so a
  // half-typed directive doesn't squiggle a real directive of the same name.
  const directiveNames = new Set(directives.map((dir) => dir.name));
  const diagnostics: TemplateDiagnostic[] = [];
  const byRange: RangeDiagnostic[] = [];
  for (const d of raw) {
    if (d.fieldPath && directiveNames.has(d.fieldPath)) continue;
    const base: TemplateDiagnostic = {
      code: d.code,
      severity: d.severity,
      message: d.message,
      fieldPath: d.fieldPath ?? null,
    };
    // Localize the engine's message (panel + squiggle tooltip read this).
    const message = translateDiagnostic?.(base) ?? base.message;
    diagnostics.push({ ...base, message });
    // No `fieldPath` (inline directives ML240–244) ⇒ key by range instead,
    // except codes rendered elsewhere (ML001 client block-balance, ML213 budget).
    if (!base.fieldPath && !RANGE_SKIP.has(d.code)) {
      byRange.push({
        code: d.code,
        severity: d.severity,
        message,
        range: d.range,
      });
    }
  }
  return { diagnostics, byPath: diagnosticsByPath(diagnostics), byRange };
}

/** Collapse diagnostics to their field path, keeping the worst severity. */
export function diagnosticsByPath(
  diags: TemplateDiagnostic[],
): Map<string, TokenDiagnostic> {
  const m = new Map<string, TokenDiagnostic>();
  for (const d of diags) {
    if (!d.fieldPath) continue;
    const prev = m.get(d.fieldPath);
    if (!prev || SEV_RANK[d.severity] > SEV_RANK[prev.severity]) {
      m.set(d.fieldPath, {
        severity: d.severity,
        message: d.message,
        code: d.code,
      });
    }
  }
  return m;
}

/** True for a "missing default on a nullable field" diagnostic (ML210). */
export function addsDefault(d: TokenDiagnostic): boolean {
  return d.code === "ML210" || /\bdefault\b/i.test(d.message);
}

/**
 * Type-appropriate `| default: …` filter for the "Add default" quick-fix, so
 * an enum/array defaults to a real option, a number to `0`, etc.
 */
export function defaultFilterFor(field?: MlField): string {
  if (field?.values?.length) return ` | default: "${field.values[0]}"`;
  switch (field?.type) {
    case "number":
      return " | default: 0";
    case "boolean":
      return " | default: false";
    default:
      return ' | default: ""';
  }
}

/** Canonical word operators — for the "change to …" quick-fix. */
export const OPERATOR_WORDS = [
  "contains",
  "contains_any",
  "contains_all",
  "in",
  "is_empty",
  "exists",
  "startsWith",
  "endsWith",
  "matches",
];

/**
 * Closest operator whose name starts with the mistyped word (shortest wins),
 * e.g. "contai" → "contains". Null when nothing plausibly matches.
 */
export function suggestOperator(word: string): string | null {
  const w = word.toLowerCase();
  if (!w) return null;
  const hits = OPERATOR_WORDS.filter((o) => o.toLowerCase().startsWith(w));
  if (!hits.length) return null;
  return hits.sort((a, b) => a.length - b.length)[0];
}
