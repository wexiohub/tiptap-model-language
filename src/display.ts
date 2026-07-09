import { type MlNamespace, parseModelToken } from "./schema/namespaces";

/** Friendly chip label for a token: resolves the path to a field label and
 *  appends a short filter summary ("First name · default"). Control tokens
 *  ({{if …}}, {{for …}}) render verbatim. */
export function modelTokenDisplay(
  inner: string,
  namespaces: MlNamespace[],
): string {
  const p = parseModelToken(inner);
  if (p.directive) return inner.trim();
  const ns = namespaces.find((n) => n.key === p.namespace);
  const field = ns?.fields.find((f) => f.key === p.field);
  const base = field?.label ?? p.field;
  const label = ns ? base : p.path;
  return p.filters.length
    ? `${label} · ${p.filters.map((f) => f.name).join(" · ")}`
    : label;
}

export type ModelTokenTone = "value" | "directive" | "unknown";

/** Soft classification for chip colour. `validateTemplate` is authoritative for
 *  real errors — "unknown" is only a hint when the path can't be resolved. */
export function modelTokenTone(
  inner: string,
  namespaces: MlNamespace[],
): ModelTokenTone {
  const p = parseModelToken(inner);
  if (p.directive) return "directive";
  if (p.namespace === "flow" || p.namespace === "contact") return "value";
  const ns = namespaces.find((n) => n.key === p.namespace);
  if (!ns) return "unknown";
  return ns.dynamic || ns.fields.some((f) => f.key === p.field)
    ? "value"
    : "unknown";
}
