import type { DirectiveSpec } from "model-language";
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

describe("buildModelOptions — inline directives", () => {
  const directives: DirectiveSpec[] = [
    {
      name: "verify_before",
      hasBody: false,
      arg: { kind: "scalar", type: "enum", values: ["payments", "calendar"] },
    },
    {
      name: "identity",
      hasBody: false,
      arg: {
        kind: "comparison",
        type: "field",
        comparison: { operators: ["=="], operandType: "field" },
      },
    },
    {
      name: "assignedToRoles",
      hasBody: false,
      arg: { kind: "list", type: "enum", values: ["OWNER", "AGENT"] },
    },
  ];

  it("offers directive names at the token start", () => {
    const opts = buildModelOptions(ns, "", directives);
    const dir = opts.find((o) => o.label === "verify_before: …");
    expect(dir?.group).toBe("Directives");
    expect(dir?.insert).toBe("verify_before: ");
  });

  it("no directives configured → no Directives group", () => {
    const opts = buildModelOptions(ns, "");
    expect(opts.some((o) => o.group === "Directives")).toBe(false);
  });

  it("scalar-enum directive offers its values, and closes", () => {
    const opts = buildModelOptions(ns, "verify_before: ", directives);
    expect(opts.map((o) => o.label)).toEqual(["payments", "calendar"]);
    expect(opts[0].insert).toBe("verify_before: payments");
    expect(opts[0].close).toBe(true);
  });

  it("list-enum directive builds a bracketed list", () => {
    const opts = buildModelOptions(ns, "assignedToRoles: [", directives);
    expect(opts.map((o) => o.label)).toEqual(["OWNER", "AGENT"]);
    expect(opts[0].insert).toBe("assignedToRoles: [OWNER, ");
  });

  it("list-enum offers 'done' after a pick", () => {
    const opts = buildModelOptions(ns, "assignedToRoles: [OWNER, ", directives);
    expect(opts.map((o) => o.label)).toEqual(["AGENT", "· done ·"]);
    expect(opts.find((o) => o.label === "· done ·")?.insert).toBe(
      "assignedToRoles: [OWNER]",
    );
  });

  it("comparison directive completes the left operand with a field", () => {
    const opts = buildModelOptions(ns, "identity: contact.", directives);
    const f = opts.find((o) => o.label === "contact.first_name");
    expect(f?.insert).toBe("identity: contact.first_name == ");
    expect(f?.kind).toBe("path");
  });

  it("comparison directive completes the RIGHT operand and closes", () => {
    const opts = buildModelOptions(
      ns,
      "identity: contact.age == contact.fi",
      directives,
    );
    const f = opts.find((o) => o.label === "contact.first_name");
    expect(f?.insert).toBe("identity: contact.age == contact.first_name");
    expect(f?.close).toBe(true);
  });

  it("an id-list directive suggests its values (operator ids)", () => {
    const dirs: DirectiveSpec[] = [
      {
        name: "assignedTo",
        hasBody: false,
        arg: { kind: "list", type: "id", values: ["jack", "mei"] },
      },
    ];
    const opts = buildModelOptions(ns, "assignedTo: [", dirs);
    expect(opts.map((o) => o.label)).toEqual(["jack", "mei"]);
    expect(opts[0].insert).toBe("assignedTo: [jack, ");
  });
});

describe("buildModelOptions — directive arg labels", () => {
  const dirs: DirectiveSpec[] = [
    {
      name: "assignedTo",
      hasBody: false,
      arg: { kind: "list", type: "id", values: ["1", "2"] },
    },
  ];
  const argLabel = (n: string, v: string) =>
    n === "assignedTo"
      ? ({ "1": "Jack Nilson", "2": "Mei Chen" } as Record<string, string>)[v]
      : undefined;

  it("shows the resolved name as the label but inserts the id", () => {
    const opts = buildModelOptions(ns, "assignedTo: [", dirs, argLabel);
    expect(opts.map((o) => o.label)).toEqual(["Jack Nilson", "Mei Chen"]);
    expect(opts[0].insert).toBe("assignedTo: [1, ");
  });

  it("filters by the typed name, not just the id", () => {
    const opts = buildModelOptions(ns, "assignedTo: [me", dirs, argLabel);
    expect(opts.map((o) => o.label)).toEqual(["Mei Chen"]);
    expect(opts[0].insert).toBe("assignedTo: [2, ");
  });
});

describe("buildModelOptions — branch coverage", () => {
  it("enum field: operator stage lists ==, !=, in, exists", () => {
    const ls = labels("if contact.priority ");
    expect(groups("if contact.priority ")).toContain("Operator");
    expect(ls.some((l) => l.includes("=="))).toBe(true);
    expect(ls.some((l) => l.includes("in"))).toBe(true);
  });

  it("string field: default stage offers a free-text placeholder", () => {
    const opts = buildModelOptions(ns, "contact.first_name | default: ");
    expect(opts.map((o) => o.label)).toEqual(['"…"']);
  });

  it("string field: == value stage with no enum values yields nothing", () => {
    expect(buildModelOptions(ns, 'if contact.first_name == "x')).toEqual([]);
  });
});

describe("buildModelOptions — type-specific operators", () => {
  it("boolean field: is true / is false", () => {
    const ls = labels("if contact.vip ");
    expect(ls).toContain("is true");
    expect(ls).toContain("is false");
  });

  it("datetime field: filter-based comparisons + exists", () => {
    const ls = labels("if contact.created ");
    expect(ls.some((l) => l.includes("is_past"))).toBe(true);
    expect(ls.some((l) => l.includes("days_ago"))).toBe(true);
  });
});

describe("buildModelOptions — filter-chain type resolution", () => {
  it("resolves the type through an intermediate filter for default:", () => {
    // `round` keeps a number, so default still offers 0 (exercises the filter
    // loop in resolveType).
    const opts = buildModelOptions(ns, "contact.age | round: 0 | default: ");
    expect(opts.map((o) => o.label)).toEqual(["0"]);
  });
});

describe("buildModelOptions — post-path + base edges", () => {
  it("datetime post-path offers the date filter", () => {
    const opts = buildModelOptions(ns, "contact.created ");
    expect(opts.some((o) => o.label === "| date")).toBe(true);
  });

  it("post-path on an unknown field yields nothing", () => {
    expect(buildModelOptions(ns, "nope.zzz ")).toEqual([]);
  });

  it("base stage filters directive names by the query", () => {
    const dirs = [
      { name: "verify_before", hasBody: false as const, arg: null },
      { name: "assignedTo", hasBody: false as const, arg: null },
    ];
    const labels = buildModelOptions(ns, "verif", dirs).map((o) => o.label);
    expect(labels).toContain("verify_before: …");
    expect(labels).not.toContain("assignedTo: …");
  });
});

describe("buildModelOptions — unknown-field guards", () => {
  it("operator stage on an unknown field yields nothing", () => {
    expect(buildModelOptions(ns, "if nope.x ==x")).toEqual([]);
  });

  it("array-arg stage on a field with no values yields nothing", () => {
    expect(buildModelOptions(ns, "if contact.first_name in [")).toEqual([]);
  });
});

describe("buildModelOptions — remaining branch edges", () => {
  it("a chained `and` clause completes the second comparison's field", () => {
    const opts = buildModelOptions(ns, "if contact.vip and contact.fi");
    expect(opts.some((o) => o.label === "contact.first_name")).toBe(true);
    // `lead` carries the first clause + connector.
    expect(opts[0].insert.startsWith("if contact.vip and ")).toBe(true);
  });

  it("array-arg value stage filters by a typed fragment", () => {
    const opts = buildModelOptions(ns, "if contact.tags contains_any [bl");
    expect(opts.map((o) => o.label)).toEqual(['"blue"']);
  });

  it("a clause starting with a quote matches no stage", () => {
    expect(buildModelOptions(ns, 'if "x')).toEqual([]);
  });
});

describe("buildModelOptions — directive arg / stage edges", () => {
  const dirs: DirectiveSpec[] = [
    {
      name: "verify_before",
      hasBody: false,
      arg: { kind: "scalar", type: "enum", values: ["payments", "calendar"] },
    },
  ];

  it("scalar directive value filters by the typed fragment", () => {
    const opts = buildModelOptions(ns, "verify_before: cal", dirs);
    expect(opts.map((o) => o.label)).toEqual(["calendar"]);
  });

  it("a `name:` head that is not a directive falls through to other stages", () => {
    // Not a directive → not the arg stage; nothing else matches → no options.
    expect(buildModelOptions(ns, "notadirective: x", dirs)).toEqual([]);
  });
});

describe("buildModelOptions — filter stage edges", () => {
  it("inside a condition, the pipe stage only offers boolean/number filters", () => {
    const ls = buildModelOptions(ns, "if contact.created | ").map(
      (o) => o.label,
    );
    expect(ls.some((l) => l.includes("days_ago"))).toBe(true);
    expect(ls.some((l) => l.includes("upper"))).toBe(false);
  });

  it("default-value stage filters enum options by the typed fragment", () => {
    const opts = buildModelOptions(ns, "contact.priority | default: lo");
    expect(opts.map((o) => o.label)).toEqual(['"low"']);
  });
});

describe("buildModelOptions — final filter/hint branches", () => {
  it("uses a directive's description as the arg hint when present", () => {
    const dirs: DirectiveSpec[] = [
      {
        name: "verify_before",
        hasBody: false,
        description: "pick a category",
        arg: { kind: "scalar", type: "enum", values: ["payments"] },
      },
    ];
    const opts = buildModelOptions(ns, "verify_before: ", dirs);
    expect(opts[0].hint).toBe("pick a category");
  });

  it("date-format stage filters presets by the typed fragment", () => {
    const opts = buildModelOptions(ns, 'contact.created | date: "yyyy');
    expect(opts.every((o) => o.label.toLowerCase().includes("yyyy"))).toBe(
      true,
    );
    expect(opts.length).toBeGreaterThan(0);
  });

  it("pipe stage offers the date filter for a datetime field", () => {
    const opts = buildModelOptions(ns, "contact.created | ");
    const date = opts.find((o) => o.label === "| date");
    expect(date?.insert).toBe("contact.created | date: ");
  });

  it("pipe stage offers the default filter for a string field", () => {
    const opts = buildModelOptions(ns, "contact.first_name | ");
    const def = opts.find((o) => o.label === "| default");
    expect(def?.insert).toBe("contact.first_name | default: ");
  });
});

describe("buildModelOptions — value-list edges", () => {
  it("a list directive with no values yields nothing", () => {
    const dirs: DirectiveSpec[] = [
      { name: "assignTo", hasBody: false, arg: { kind: "list", type: "id" } },
    ];
    expect(buildModelOptions(ns, "assignTo: [", dirs)).toEqual([]);
  });

  it("boolean default filters true/false by the typed fragment", () => {
    const opts = buildModelOptions(ns, "contact.vip | default: tr");
    expect(opts.map((o) => o.label)).toEqual(["true"]);
  });
});
