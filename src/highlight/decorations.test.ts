import { type Node as PMNode, Schema } from "@tiptap/pm/model";
import type { DirectiveSpec } from "model-language";
import { describe, expect, it } from "vitest";
import type {
  DiagnosticSeverity,
  ModelSyntaxState,
  RangeDiagnostic,
  TokenDiagnostic,
} from "../core/types";
import { DEFAULT_LABELS } from "../core/types";
import type { MlNamespace } from "../schema/namespaces";
import { buildDecorations } from "./decorations";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    hardBreak: { group: "inline", inline: true, toDOM: () => ["br"] },
    text: { group: "inline" },
  },
  marks: { strong: { toDOM: () => ["strong", 0] } },
});

const docOf = (...lines: string[]): PMNode =>
  schema.node(
    "doc",
    null,
    lines.map((l) => schema.node("paragraph", null, l ? [schema.text(l)] : [])),
  );

const namespaces: MlNamespace[] = [
  {
    key: "contact",
    label: "Contact",
    fields: [{ key: "first_name", type: "string", label: "First name" }],
  },
];

const state = (
  byPath: Map<string, TokenDiagnostic> = new Map(),
  extra: Partial<
    Pick<ModelSyntaxState, "directives" | "byRange" | "directiveArgLabel">
  > = {},
): ModelSyntaxState => ({
  namespaces,
  schema: [],
  directives: extra.directives ?? [],
  directiveArgLabel: extra.directiveArgLabel,
  byPath,
  byRange: extra.byRange ?? [],
});

const ALL: DiagnosticSeverity[] = ["error", "warning", "info"];
const opts = (severities = ALL) => ({ severities, labels: DEFAULT_LABELS });

/** All decoration attribute maps in the set. */
function attrsOf(doc: PMNode, st: ModelSyntaxState, o = opts()) {
  const set = buildDecorations(doc, st, o);
  return set
    .find()
    .map(
      (d) =>
        (d as unknown as { type: { attrs: Record<string, string> } }).type
          .attrs,
    )
    .filter(Boolean);
}

describe("buildDecorations — highlighting", () => {
  it("colours braces and inner tokens", () => {
    const attrs = attrsOf(docOf("{{contact.first_name}}"), state());
    expect(
      attrs.some((a) => a.class?.includes("text-muted-foreground/60")),
    ).toBe(true);
    expect(attrs.some((a) => a.class?.includes("text-sky"))).toBe(true);
  });

  it("adds a flow-card hover hook", () => {
    const attrs = attrsOf(docOf("{{flow.card1.out}}"), state());
    expect(attrs.some((a) => a["data-card-id"] === "card1")).toBe(true);
  });
});

describe("buildDecorations — block scope", () => {
  it("flags an unclosed block with an insert-close quick-fix", () => {
    const attrs = attrsOf(docOf("{{if contact.first_name}}", "hi"), state());
    const err = attrs.find((a) => a["data-ml-error"]?.startsWith("Unclosed"));
    expect(err).toBeTruthy();
    expect(err?.["data-ml-fix-text"]).toBe("{{/if}}");
  });

  it("flags a close tag with no opener", () => {
    const attrs = attrsOf(docOf("{{/if}}"), state());
    expect(attrs.some((a) => a["data-ml-error"] === "No open {{if}}")).toBe(
      true,
    );
  });

  it("balanced blocks produce no block error", () => {
    const attrs = attrsOf(
      docOf("{{if contact.first_name}}", "hi", "{{/if}}"),
      state(),
    );
    expect(attrs.some((a) => a["data-ml-error"]?.startsWith("Unclosed"))).toBe(
      false,
    );
  });

  it("a for-loop may have an {{else}} (empty-list branch)", () => {
    const attrs = attrsOf(
      docOf(
        "{{for t in contact.first_name}}",
        "x",
        "{{else}}",
        "y",
        "{{/for}}",
      ),
      state(),
    );
    expect(attrs.some((a) => a["data-ml-error"])).toBe(false);
  });

  it("recognises a block whose opening tag wraps across a line break", () => {
    // The `{{if …}}` opener is split over two paragraphs (a wrapped long
    // condition). It must still be seen as one opener that `{{/if}}` closes.
    const attrs = attrsOf(
      docOf(
        "{{if (contact.first_name == 'A' or contact.vip)",
        "and contact.first_name}}",
        "hi",
        "{{/if}}",
      ),
      state(),
    );
    expect(attrs.some((a) => a["data-ml-error"])).toBe(false);
    // The wrapped opener is still highlighted (keyword colour present).
    expect(attrs.some((a) => a.class?.includes("text-violet"))).toBe(true);
  });

  it("a multi-line token's close is not mis-flagged as 'No open'", () => {
    const attrs = attrsOf(
      docOf("{{if contact.first_name ==", "'x'}}", "hi", "{{/if}}"),
      state(),
    );
    expect(attrs.some((a) => a["data-ml-error"] === "No open {{if}}")).toBe(
      false,
    );
  });

  it("elseif does not branch a for-loop", () => {
    const attrs = attrsOf(
      docOf(
        "{{for t in contact.first_name}}",
        "{{elseif contact.vip}}",
        "{{/for}}",
      ),
      state(),
    );
    expect(attrs.some((a) => a["data-ml-error"]?.startsWith("Unclosed"))).toBe(
      true,
    );
  });
});

describe("buildDecorations — operator sanity", () => {
  it("flags a mistyped operator and offers a correction", () => {
    const attrs = attrsOf(
      docOf('{{if contact.first_name conta "x"}}'),
      state(),
    );
    const err = attrs.find(
      (a) => a["data-ml-error"] === DEFAULT_LABELS.expectedOperator,
    );
    expect(err?.["data-ml-fix-kind"]).toBe("replace");
    expect(err?.["data-ml-fix-text"]).toBe("contains");
  });
});

describe("buildDecorations — field diagnostics", () => {
  it("squiggles a field with a byPath diagnostic + default quick-fix", () => {
    const byPath = new Map<string, TokenDiagnostic>([
      [
        "contact.first_name",
        { severity: "warning", message: "can be empty", code: "ML210" },
      ],
    ]);
    const attrs = attrsOf(docOf("{{contact.first_name}}"), state(byPath));
    const d = attrs.find((a) => a["data-ml-error"] === "can be empty");
    expect(d?.["data-ml-fix-label"]).toBe(DEFAULT_LABELS.addDefault);
    expect(d?.["data-ml-fix-text"]).toBe(' | default: ""');
  });

  it("suppresses a missing-default warning inside a condition", () => {
    const byPath = new Map<string, TokenDiagnostic>([
      [
        "contact.first_name",
        { severity: "warning", message: "add default", code: "ML210" },
      ],
    ]);
    const attrs = attrsOf(
      docOf("{{if contact.first_name}}", "hi", "{{/if}}"),
      state(byPath),
    );
    expect(attrs.some((a) => a["data-ml-error"] === "add default")).toBe(false);
  });
});

describe("buildDecorations — severity filter", () => {
  it("hides all error squiggles when errors are disabled", () => {
    const attrs = attrsOf(
      docOf("{{if contact.first_name}}", "hi"),
      state(),
      opts(["warning", "info"]),
    );
    expect(attrs.some((a) => a["data-ml-sev"] === "error")).toBe(false);
  });
});

describe("buildDecorations — inline directives", () => {
  const dirs: DirectiveSpec[] = [
    {
      name: "verify_before",
      hasBody: false,
      arg: { kind: "scalar", type: "enum", values: ["payments"] },
    },
  ];

  it("highlights a known directive head distinctly", () => {
    const attrs = attrsOf(
      docOf("{{verify_before: payments}}"),
      state(new Map(), { directives: dirs }),
    );
    expect(attrs.some((a) => a.class?.includes("fuchsia"))).toBe(true);
  });

  it("squiggles a range-anchored (directive) diagnostic on its token", () => {
    const byRange: RangeDiagnostic[] = [
      {
        code: "ML243",
        severity: "error",
        message: 'Invalid argument for "verify_before".',
        range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 24 },
      },
    ];
    const attrs = attrsOf(
      docOf("{{verify_before: nope}}"),
      state(new Map(), { byRange }),
    );
    const d = attrs.find((a) => a["data-ml-code"] === "ML243");
    expect(d?.["data-ml-error"]).toContain("Invalid argument");
    expect(d?.["data-ml-sev"]).toBe("error");
    expect(d?.class).toContain("decoration-wavy");
  });

  it("range diagnostics respect the severity filter", () => {
    const byRange: RangeDiagnostic[] = [
      {
        code: "ML243",
        severity: "error",
        message: "x",
        range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 24 },
      },
    ];
    const attrs = attrsOf(
      docOf("{{verify_before: nope}}"),
      state(new Map(), { byRange }),
      opts(["warning", "info"]),
    );
    expect(attrs.some((a) => a["data-ml-code"] === "ML243")).toBe(false);
  });

  it("a range on a later line squiggles the right token", () => {
    const byRange: RangeDiagnostic[] = [
      {
        code: "ML240",
        severity: "error",
        message: "Unknown directive.",
        // "{{mystery: x}}" is 14 chars → columns 1..14, exclusive end 15.
        range: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 15 },
      },
    ];
    const attrs = attrsOf(
      docOf("hello", "{{mystery: x}}"),
      state(new Map(), { byRange }),
    );
    expect(attrs.some((a) => a["data-ml-code"] === "ML240")).toBe(true);
  });
});

describe("buildDecorations — range mapping with hard breaks", () => {
  // Empty paragraphs made of a hardBreak (a Tiptap `<p><br></p>`) add an EXTRA
  // newline to getText, so the engine's line numbers drift past the paragraph
  // index. The range map must mirror getText (block seps + hard breaks) exactly.
  const br = () => schema.node("paragraph", null, [schema.node("hardBreak")]);
  const docBr = (): PMNode =>
    schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("a")]),
      br(),
      schema.node("paragraph", null, [schema.text("{{escalate: x}}")]),
    ]);

  it("squiggles the directive token, not a drifted line", () => {
    // getText → "a\n\n\n{{escalate: x}}"; the token is on line 4, cols 1..15.
    const byRange: RangeDiagnostic[] = [
      {
        code: "ML240",
        severity: "error",
        message: "Unknown directive.",
        range: { startLine: 4, startColumn: 1, endLine: 4, endColumn: 16 },
      },
    ];
    const set = buildDecorations(
      docBr(),
      state(new Map(), { byRange }),
      opts(),
    );
    const hit = set
      .find()
      .map(
        (d) =>
          d as unknown as {
            from: number;
            to: number;
            type: { attrs: Record<string, string> };
          },
      )
      .find((d) => d.type.attrs?.["data-ml-code"] === "ML240");
    expect(hit).toBeTruthy();
    // The squiggled range covers the token's opening `{{`, not an earlier line.
    const text = docBr().textBetween(hit!.from, hit!.to, "\n");
    expect(text.startsWith("{{escalate")).toBe(true);
  });
});

describe("buildDecorations — directive arg labels", () => {
  const dirs: DirectiveSpec[] = [
    {
      name: "assignedTo",
      hasBody: false,
      arg: { kind: "list", type: "id", values: ["1"] },
    },
  ];
  const argLabel = (_n: string, v: string) =>
    v === "1" ? "Jack Nilson" : undefined;

  it("adds a hover title on an id value, keeping the raw id in the doc", () => {
    const attrs = attrsOf(
      docOf("{{assignedTo: [1]}}"),
      state(new Map(), { directives: dirs, directiveArgLabel: argLabel }),
    );
    const t = attrs.find((a) => a["data-ml-arg-value"] === "1");
    expect(t?.title).toBe("Jack Nilson");
    expect(t?.class).toContain("decoration-dotted");
  });

  it("does not label a value with no resolver match", () => {
    const attrs = attrsOf(
      docOf("{{assignedTo: [9]}}"),
      state(new Map(), { directives: dirs, directiveArgLabel: argLabel }),
    );
    expect(attrs.some((a) => a["data-ml-arg-value"])).toBe(false);
  });
});

describe("buildDecorations — block scope edges", () => {
  it("a #priority directive block balances with its close", () => {
    const attrs = attrsOf(
      docOf("{{#priority high}}", "x", "{{/priority}}"),
      state(),
    );
    expect(attrs.some((a) => a["data-ml-error"])).toBe(false);
  });

  it("closing an outer block flags an inner block left unclosed", () => {
    const attrs = attrsOf(
      docOf(
        "{{if contact.first_name}}",
        "{{for t in contact.first_name}}",
        "{{/if}}",
      ),
      state(),
    );
    // The {{/if}} closes the if, but the {{for}} opened inside never closed.
    const err = attrs.find((a) =>
      a["data-ml-error"]?.startsWith("Unclosed, needs {{/for}}"),
    );
    expect(err).toBeTruthy();
  });
});

describe("buildDecorations — decoration spanning a block boundary", () => {
  it("splits a whole-token decoration at the paragraph break", () => {
    // A flow token wrapped across a line break: the card-id hook covers the
    // whole token, so it must be split into per-block shards (one per line).
    const attrs = attrsOf(docOf("{{flow.card1", ".out}}"), state());
    expect(attrs.filter((a) => a["data-card-id"]).length).toBe(2);
  });
});

describe("buildDecorations — byRange cross-line guard", () => {
  it("skips a range that spans multiple lines", () => {
    const byRange: RangeDiagnostic[] = [
      {
        code: "ML240",
        severity: "error",
        message: "x",
        range: { startLine: 1, startColumn: 1, endLine: 2, endColumn: 3 },
      },
    ];
    const attrs = attrsOf(
      docOf("{{escalate: x}}", "y"),
      state(new Map(), { byRange }),
    );
    expect(attrs.some((a) => a["data-ml-code"] === "ML240")).toBe(false);
  });
});

describe("buildDecorations — operator sanity without a fix", () => {
  it("squiggles a bare-word operator that has no suggestion (no quick-fix)", () => {
    const attrs = attrsOf(docOf('{{if contact.first_name zzz "x"}}'), state());
    const err = attrs.find(
      (a) => a["data-ml-error"] === DEFAULT_LABELS.expectedOperator,
    );
    expect(err).toBeTruthy();
    expect(err?.["data-ml-fix-kind"]).toBeUndefined();
  });
});

describe("buildDecorations — field diagnostic branch edges", () => {
  it("a non-ML210 field diagnostic squiggles without a quick-fix", () => {
    const byPath = new Map<string, TokenDiagnostic>([
      [
        "contact.first_name",
        { severity: "error", message: "Unknown", code: "ML101" },
      ],
    ]);
    const attrs = attrsOf(docOf("{{contact.first_name}}"), state(byPath));
    const d = attrs.find((a) => a["data-ml-code"] === "ML101");
    expect(d?.["data-ml-fix-kind"]).toBeUndefined();
  });

  it("does not squiggle a field path that is only a substring of the token", () => {
    const byPath = new Map<string, TokenDiagnostic>([
      ["contact.first", { severity: "warning", message: "x", code: "ML210" }],
    ]);
    const attrs = attrsOf(docOf("{{contact.first_name}}"), state(byPath));
    expect(attrs.some((a) => a["data-ml-code"] === "ML210")).toBe(false);
  });

  it("a dotless field path resolves no field (generic default fix)", () => {
    const byPath = new Map<string, TokenDiagnostic>([
      ["loner", { severity: "warning", message: "x", code: "ML210" }],
    ]);
    const attrs = attrsOf(docOf("{{loner}}"), state(byPath));
    const d = attrs.find((a) => a["data-ml-code"] === "ML210");
    expect(d?.["data-ml-fix-text"]).toBe(' | default: ""');
  });

  it("hides a field diagnostic whose severity is filtered out", () => {
    const byPath = new Map<string, TokenDiagnostic>([
      ["contact.first_name", { severity: "info", message: "x", code: "ML299" }],
    ]);
    const attrs = attrsOf(
      docOf("{{contact.first_name}}"),
      state(byPath),
      opts(["error", "warning"]),
    );
    expect(attrs.some((a) => a["data-ml-code"] === "ML299")).toBe(false);
  });
});

describe("buildDecorations — directiveArgLabel branch edges", () => {
  const argLabel = (_n: string, v: string) =>
    v === "1" ? "Jack Nilson" : undefined;

  it("does nothing for a non-directive token", () => {
    const attrs = attrsOf(
      docOf("{{contact.first_name}}"),
      state(new Map(), { directiveArgLabel: argLabel }),
    );
    expect(attrs.some((a) => a["data-ml-arg-value"])).toBe(false);
  });

  it("does nothing for a control directive with no `name:` head", () => {
    const attrs = attrsOf(
      docOf("{{if contact.first_name}}", "{{/if}}"),
      state(new Map(), { directiveArgLabel: argLabel }),
    );
    expect(attrs.some((a) => a["data-ml-arg-value"])).toBe(false);
  });

  it("does not label operands of a comparison directive", () => {
    const dirs: DirectiveSpec[] = [
      {
        name: "identity",
        hasBody: false,
        arg: {
          kind: "comparison",
          type: "field",
          comparison: { operators: ["=="], operandType: "field" },
        },
      },
    ];
    const attrs = attrsOf(
      docOf("{{identity: contact.first_name == contact.first_name}}"),
      state(new Map(), { directives: dirs, directiveArgLabel: argLabel }),
    );
    expect(attrs.some((a) => a["data-ml-arg-value"])).toBe(false);
  });
});

describe("buildDecorations — adjacent (marked) text nodes", () => {
  // A mark boundary splits one line into two ADJACENT text nodes (no gap), so
  // the flatten sees contiguous positions and a single decoration run.
  const strong = schema.mark("strong");
  const docMarked = (): PMNode =>
    schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("{{contact."),
        schema.text("first_name}}", [strong]),
      ]),
    ]);

  it("highlights a token spanning a mark boundary as one contiguous run", () => {
    const attrs = attrsOf(docMarked(), state());
    // The path colour is applied across the two adjacent text nodes.
    expect(attrs.some((a) => a.class?.includes("text-sky"))).toBe(true);
    // Braces at both ends are present.
    expect(
      attrs.filter((a) => a.class?.includes("text-muted-foreground/60")).length,
    ).toBe(2);
  });
});

describe("buildDecorations — field path not at token start", () => {
  it("squiggles a field that appears after other text in the token", () => {
    // ML101 (not a missing-default) so it isn't suppressed inside the condition;
    // the path sits after `if `, exercising the prev-defined boundary check.
    const byPath = new Map<string, TokenDiagnostic>([
      [
        "contact.first_name",
        { severity: "error", message: "Unknown", code: "ML101" },
      ],
    ]);
    const attrs = attrsOf(
      docOf("{{if contact.first_name}}", "{{/if}}"),
      state(byPath),
    );
    expect(attrs.some((a) => a["data-ml-code"] === "ML101")).toBe(true);
  });
});
