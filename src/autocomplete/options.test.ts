import { describe, expect, it } from "vitest";
import type { MlNamespace } from "../schema/namespaces";
import { buildModelOptions, capOptions, optionGroups } from "./options";

const ns: MlNamespace[] = [
  {
    key: "contact",
    label: "Contact",
    fields: [
      { key: "first_name", type: "string", label: "First name" },
      { key: "age", type: "number", label: "Age" },
      {
        key: "priority",
        type: "enum",
        label: "Priority",
        values: ["high", "low"],
      },
      { key: "created", type: "datetime", label: "Created" },
      { key: "tags", type: "array", label: "Tags", values: ["red", "blue"] },
      { key: "vip", type: "boolean", label: "VIP" },
    ],
  },
];

const groups = (q: string) => optionGroups(buildModelOptions(ns, q));
const labels = (q: string) => buildModelOptions(ns, q).map((o) => o.label);

describe("buildModelOptions — condition stages", () => {
  it("path stage: offers matching fields", () => {
    const opts = buildModelOptions(ns, "if contact.fi");
    expect(opts.some((o) => o.label === "contact.first_name")).toBe(true);
    expect(opts[0].group).toBe("Field");
    expect(opts[0].insert).toBe("if contact.first_name ");
  });

  it("operator stage: type-aware operators for a number", () => {
    expect(groups("if contact.age ")).toContain("Operator");
    const ls = labels("if contact.age ");
    expect(ls.some((l) => l.includes(">"))).toBe(true);
  });

  it("operator stage: filters by the typed fragment (label only)", () => {
    const ls = labels("if contact.first_name conta");
    expect(ls.every((l) => l.toLowerCase().includes("conta"))).toBe(true);
    expect(ls).toContain('contains "…"');
  });

  it("value stage: enum values, filtered", () => {
    const opts = buildModelOptions(ns, 'if contact.priority == "h');
    expect(opts.map((o) => o.label)).toEqual(['"high"']);
    expect(opts[0].group).toBe("Value");
  });

  it("array operator opens a list literal, not a scalar value", () => {
    const opt = buildModelOptions(ns, "if contact.tags ").find(
      (o) => o.label === "contains_any […]",
    );
    expect(opt?.insert).toBe("if contact.tags contains_any [");
  });

  it("array value stage builds a list from the enum values", () => {
    const opts = buildModelOptions(ns, "if contact.tags contains_any [");
    expect(opts.map((o) => o.label)).toEqual(['"red"', '"blue"']);
    expect(opts[0].insert).toBe('if contact.tags contains_any ["red", ');
    expect(opts[0].group).toBe("Value");
  });

  it("array value stage keeps the list open and offers done after a pick", () => {
    const opts = buildModelOptions(ns, 'if contact.tags contains_any ["red", ');
    expect(opts.map((o) => o.label)).toEqual(['"blue"', "· done ·"]);
    expect(opts.find((o) => o.label === '"blue"')?.insert).toBe(
      'if contact.tags contains_any ["red", "blue", ',
    );
    expect(opts.find((o) => o.label === "· done ·")?.insert).toBe(
      'if contact.tags contains_any ["red"] ',
    );
  });

  it("enum `in` builds an array literal too", () => {
    const opts = buildModelOptions(ns, "if contact.priority in [");
    expect(opts.map((o) => o.label)).toEqual(['"high"', '"low"']);
    expect(opts[0].insert).toBe('if contact.priority in ["high", ');
  });

  it("a closed array clause steps to and / or / finish", () => {
    const ls = labels('if contact.tags contains_any ["red"] ');
    expect(ls).toContain("and");
    expect(ls).toContain("· finish ·");
  });

  it("connector stage: and / or / finish after a complete clause", () => {
    const ls = labels("if contact.age > 5 ");
    expect(ls).toContain("and");
    expect(ls).toContain("or");
    expect(ls).toContain("· finish ·");
  });

  it("negation: `if not contact.` still offers fields", () => {
    expect(
      buildModelOptions(ns, "if not contact.").some(
        (o) => o.label === "contact.first_name",
      ),
    ).toBe(true);
  });
});

describe("buildModelOptions — filters & default", () => {
  it("default steps to enum values (not a fixed string)", () => {
    const opts = buildModelOptions(ns, "contact.priority | default: ");
    expect(opts.every((o) => o.group === "Default")).toBe(true);
    expect(opts.map((o) => o.label)).toEqual(['"high"', '"low"']);
    expect(opts[0].insert).toBe('contact.priority | default: "high"');
  });

  it("default offers true/false for a boolean", () => {
    expect(labels("contact.vip | default: ")).toEqual(["true", "false"]);
  });

  it("default offers 0 for a number", () => {
    expect(labels("contact.age | default: ")).toEqual(["0"]);
  });

  it("default offers the list for an array field", () => {
    expect(labels("contact.tags | default: ")).toEqual(['"red"', '"blue"']);
  });

  it("date filter steps to format presets with a live example", () => {
    const opts = buildModelOptions(ns, 'contact.created | date: "');
    expect(opts[0].group).toBe("Date format");
    expect(opts.some((o) => o.hint.startsWith("e.g."))).toBe(true);
  });

  it("date filter then steps to a timezone list", () => {
    const opts = buildModelOptions(ns, 'contact.created | date: "HH:mm", "Eur');
    expect(opts[0].group).toBe("Timezone");
    expect(opts.every((o) => o.label.toLowerCase().includes("eur"))).toBe(true);
  });

  it("generic filter list, filtered by name", () => {
    const opts = buildModelOptions(ns, "contact.first_name | up");
    expect(opts.some((o) => o.label === "| upper")).toBe(true);
  });
});

describe("buildModelOptions — other stages", () => {
  it("priority level stage", () => {
    const opts = buildModelOptions(ns, "#priority h");
    expect(opts[0].group).toBe("Priority");
    expect(opts.map((o) => o.label)).toEqual(["high"]);
  });

  it("interpolation post-path: insert + filters", () => {
    const opts = buildModelOptions(ns, "contact.first_name ");
    expect(opts[0].label).toBe("· insert ·");
    expect(opts.some((o) => o.group === "Filters")).toBe(true);
  });

  it("for-loop target", () => {
    const opts = buildModelOptions(ns, "for item in contact.ta");
    expect(opts[0].group).toBe("Loop over");
    expect(opts[0].label).toBe("contact.tags");
  });

  it("bare interpolation: variables + block snippets", () => {
    expect(
      buildModelOptions(ns, "cont").some(
        (o) => o.label === "contact.first_name",
      ),
    ).toBe(true);
    expect(buildModelOptions(ns, "if").some((o) => o.group === "Blocks")).toBe(
      true,
    );
  });
});

describe("capOptions / optionGroups", () => {
  it("caps each group to the per-group limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      insert: `x${i}`,
      label: `x${i}`,
      hint: "",
      group: "G",
      kind: "path" as const,
      close: false,
    }));
    expect(capOptions(many, 8)).toHaveLength(8);
  });

  it("lists distinct groups in first-seen order", () => {
    const opts = buildModelOptions(ns, "if contact.age ");
    expect(optionGroups(opts)).toEqual([...new Set(opts.map((o) => o.group))]);
  });
});
