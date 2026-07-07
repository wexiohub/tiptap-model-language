import type { FieldDef, FieldSchema, MLType } from "model-language";
import type { MlNamespace } from "./namespaces";

/**
 * Merge the autocomplete namespaces (so every offered field — incl. dynamic
 * `flow.*` — is known to `validate()` and never flagged ML101) with the
 * authoritative org schema (accurate type / nullable / enum values).
 */
export function buildValidateSchema(
  namespaces: MlNamespace[],
  orgSchema: FieldSchema,
): FieldSchema {
  const byPath = new Map<string, FieldDef>();
  for (const ns of namespaces)
    for (const f of ns.fields)
      byPath.set(`${ns.key}.${f.key}`, {
        path: `${ns.key}.${f.key}`,
        type: f.type as MLType,
        values: f.values,
        // Dynamic (flow) values are runtime — don't nag for a default on them.
        nullable: ns.dynamic ? false : undefined,
        name: f.label,
      });
  // Authoritative BE schema wins (real nullability / type / items).
  for (const d of orgSchema) byPath.set(d.path, d);
  return [...byPath.values()];
}
