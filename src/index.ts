// tiptap-model-language — public API.
//
// A self-contained Tiptap extension for the `model-language` template syntax.
// The host supplies namespaces + field schema (via `setModelData`); the
// extension owns highlighting, `{{` autocomplete, hover diagnostics and local
// validation (through the `model-language` package). No app/framework coupling.

// Re-export the `model-language` engine so consumers get it out of the box —
// no separate install. Use `parse`/`validate`/`render` to author schemas and
// render templates against live data with the exact engine the extension uses.
export {
  type DataSnapshot,
  type Diagnostic as MlDiagnostic,
  type FieldDef,
  type FieldSchema,
  type MLType,
  type ParseResult,
  parse,
  type Quickfix,
  type Range as MlRange,
  type RenderOptions,
  type RenderResult,
  render,
  type Severity as MlSeverity,
  serialize,
  type ValidateOptions,
  type ValidateResult,
  validate,
} from "model-language";
export {
  buildModelOptions,
  type ModelTokenOption,
} from "./autocomplete/options";
export {
  DEFAULT_LABELS,
  type DiagnosticSeverity,
  type ModelLanguageLabels,
  type ModelSyntaxOptions,
  type ModelValidationResult,
  resolveLabels,
  type TemplateDiagnostic,
  type TokenDiagnostic,
} from "./core/types";
export {
  type ModelTokenTone,
  modelTokenDisplay,
  modelTokenTone,
} from "./display";
export { ModelSyntax } from "./extension";
export {
  HL_CLASS,
  type HlKind,
  tokenizeExpression,
} from "./highlight/highlight";
export { buildValidateSchema } from "./schema/build-schema";
export {
  CONTACT_NAMESPACE_KEY,
  DATE_FORMATS,
  FLOW_NAMESPACE_KEY,
  ML_FILTERS,
  type MlField,
  type MlFieldType,
  type MlFilter,
  type MlNamespace,
  type ParsedToken,
  parseModelToken,
  STATIC_NAMESPACES,
} from "./schema/namespaces";
export {
  defaultFilterFor,
  diagnosticsByPath,
  suggestOperator,
} from "./validation/diagnostics";
