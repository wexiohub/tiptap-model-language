import { describe, expect, it } from "vitest";
import { buildValidateSchema } from "./build-schema";
import type { MlNamespace } from "./namespaces";

const ns: MlNamespace[] = [
  {
    key: "contact",
    label: "Contact",
    fields: [
      { key: "first_name", type: "string", label: "First name" },
      { key: "priority", type: "enum", label: "Priority", values: ["a", "b"] },
    ],
  },
  {
    key: "flow",
    label: "Flow",
    dynamic: true,
    fields: [{ key: "card1", type: "string", label: "Card 1" }],
  },
];

describe("buildValidateSchema", () => {
  it("flattens namespaces into FieldDefs with dot paths", () => {
    const out = buildValidateSchema(ns, []);
    const paths = out.map((d) => d.path);
    expect(paths).toContain("contact.first_name");
    expect(paths).toContain("contact.priority");
    expect(paths).toContain("flow.card1");
  });

  it("marks dynamic (flow) fields non-nullable so they don't nag for a default", () => {
    const flow = buildValidateSchema(ns, []).find(
      (d) => d.path === "flow.card1",
    );
    expect(flow?.nullable).toBe(false);
  });

  it("carries enum values through", () => {
    const p = buildValidateSchema(ns, []).find(
      (d) => d.path === "contact.priority",
    );
    expect(p?.values).toEqual(["a", "b"]);
  });

  it("lets the authoritative org schema override by path", () => {
    const out = buildValidateSchema(ns, [
      {
        path: "contact.first_name",
        type: "string",
        nullable: true,
        name: "Org name",
      },
    ]);
    const f = out.find((d) => d.path === "contact.first_name");
    expect(f?.nullable).toBe(true);
    expect(f?.name).toBe("Org name");
    // still de-duplicated by path
    expect(out.filter((d) => d.path === "contact.first_name")).toHaveLength(1);
  });
});
