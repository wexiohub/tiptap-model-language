import type { DiagnosticSeverity } from "./types";

/** `{{` / `}}` brace colour (muted). */
export const BRACE_CLASS = "text-muted-foreground/60";

/** Inline squiggle class per severity (Tailwind — host provides the palette). */
export const DIAG_CLASS: Record<DiagnosticSeverity, string> = {
  error: "underline decoration-wavy decoration-red-500 underline-offset-2",
  warning: "underline decoration-wavy decoration-amber-500 underline-offset-2",
  info: "underline decoration-dotted decoration-sky-500 underline-offset-2",
};

/** Tooltip accent colour per severity. */
export const SEV_COLOR: Record<DiagnosticSeverity, string> = {
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#0ea5e9",
};

/** Severity ordering — higher wins when collapsing by field path. */
export const SEV_RANK: Record<DiagnosticSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

/** A single `{{ … }}` token (no nested braces / newlines). */
export const TOKEN_RE = /\{\{[^{}\n]*\}\}/g;
