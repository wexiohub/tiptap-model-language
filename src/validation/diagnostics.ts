import { SEV_RANK } from "../core/constants";
import type { TemplateDiagnostic, TokenDiagnostic } from "../core/types";
import type { MlField } from "../schema/namespaces";

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
