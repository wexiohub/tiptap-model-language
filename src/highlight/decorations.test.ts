import { type Node as PMNode, Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import type {
  DiagnosticSeverity,
  ModelSyntaxState,
  TokenDiagnostic,
} from "../core/types";
import { DEFAULT_LABELS } from "../core/types";
import type { MlNamespace } from "../schema/namespaces";
import { buildDecorations } from "./decorations";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    text: { group: "inline" },
  },
  marks: {},
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
): ModelSyntaxState => ({
  namespaces,
  schema: [],
  byPath,
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
