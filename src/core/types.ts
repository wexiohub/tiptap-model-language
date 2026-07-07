import type { FieldSchema } from "model-language";
import type { MlNamespace } from "../schema/namespaces";

export type DiagnosticSeverity = "error" | "warning" | "info";

/** A diagnostic collapsed to a single field path (worst severity wins). */
export interface TokenDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  code: string;
}

/** The flat diagnostic shape surfaced to the host via `onResult`. */
export interface TemplateDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  fieldPath?: string | null;
}

export interface ModelValidationResult {
  diagnostics: TemplateDiagnostic[];
  maxTokenEstimate: number | null;
}

/**
 * Every user-facing string the extension renders — override any of them for
 * i18n. Some are templated (they receive the block name / operator / tag).
 */
export interface ModelLanguageLabels {
  /** Shown when a value path in a condition isn't followed by an operator. */
  expectedOperator: string;
  /** A block opener (`if` / `for` / `#name`) that never closed in scope. */
  unclosedBlock: (name: string) => string;
  /** A close/branch tag with no matching opener. */
  noOpenBlock: (name: string) => string;
  /** Quick-fix: add a `| default: …` filter. */
  addDefault: string;
  /** Quick-fix: replace a mistyped operator. */
  changeTo: (operator: string) => string;
  /** Quick-fix: insert a close tag, e.g. `{{/if}}`. */
  addCloseTag: (tag: string) => string;
  /** Fallback quick-fix button text. */
  quickFix: string;
  /** Empty autocomplete menu. */
  noMatches: string;
  /** Severity chip text in the hover tooltip (rendered uppercase). */
  severity: Record<DiagnosticSeverity, string>;
}

export interface ModelSyntaxOptions {
  /** Initial namespaces (autocomplete + highlighting). Static case only — for
   *  async / changing data push via the `setModelData` command instead. */
  namespaces: MlNamespace[];
  /** Initial org field schema (local validation). Static case only — for
   *  async / changing data push via the `setModelData` command instead. */
  schema: FieldSchema;
  /** Disable the local `validate()` pass entirely (structural squiggles stay). */
  skipValidation: boolean;
  /** Debounce for the validation pass, ms. */
  debounceMs: number;
  /** Which severities to render inline. Default: all three. */
  severities: DiagnosticSeverity[];
  /** Override any user-facing string (merged over the English defaults). */
  labels: Partial<ModelLanguageLabels>;
  /** Localize an engine diagnostic message (ML001/ML101/…) — return undefined
   *  to keep the engine's English. Branch on `code`, never on `message`. */
  translateDiagnostic?: (d: TemplateDiagnostic) => string | undefined;
  /** Surface hook for the full result (e.g. a diagnostics list + token meter). */
  onResult?: (result: ModelValidationResult) => void;
}

export interface ModelSyntaxStorage {
  timer: ReturnType<typeof setTimeout> | null;
}

export interface ModelSyntaxState {
  namespaces: MlNamespace[];
  /** Flattened field schema for the `model-language` `validate()` call. */
  schema: FieldSchema;
  byPath: Map<string, TokenDiagnostic>;
}

/** Mutable flags shared between the main plugin, the tooltip and the
 *  autocomplete — created per editor in `addProseMirrorPlugins`. */
export interface PluginContext {
  /** Last transaction changed the doc (typing/deleting). */
  lastTrDocChanged: boolean;
  /** Last transaction moved the selection (click/arrow). */
  lastTrSelectionMoved: boolean;
  /** The `{{` autocomplete menu is open. */
  suggestionActive: boolean;
}

/** English defaults for every label. */
export const DEFAULT_LABELS: ModelLanguageLabels = {
  expectedOperator: "Expected an operator (e.g. ==, contains)",
  unclosedBlock: (name) => `Unclosed, needs {{/${name}}}`,
  noOpenBlock: (name) => `No open {{${name}}}`,
  addDefault: "Add default",
  changeTo: (operator) => `Change to ${operator}`,
  addCloseTag: (tag) => `Add ${tag}`,
  quickFix: "Quick fix",
  noMatches: "No variables match.",
  severity: { error: "error", warning: "warning", info: "info" },
};

/** Merge host overrides over the English defaults. */
export function resolveLabels(
  overrides?: Partial<ModelLanguageLabels>,
): ModelLanguageLabels {
  return overrides ? { ...DEFAULT_LABELS, ...overrides } : DEFAULT_LABELS;
}
