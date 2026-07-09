import { describe, expect, it } from "vitest";
import { modelTokenDisplay, modelTokenTone } from "./display";
import type { MlNamespace } from "./schema/namespaces";

const ns: MlNamespace[] = [
  {
    key: "contact",
    label: "Contact",
    fields: [{ key: "first_name", type: "string", label: "First name" }],
  },
  { key: "flow", label: "Flow", dynamic: true, fields: [] },
  {
    key: "system",
    label: "System",
    fields: [{ key: "now", type: "datetime", label: "Now" }],
  },
];

describe("modelTokenDisplay", () => {
  it("renders a directive verbatim", () => {
    expect(modelTokenDisplay("if contact.x", ns)).toBe("if contact.x");
  });

  it("resolves a field to its friendly label", () => {
    expect(modelTokenDisplay("contact.first_name", ns)).toBe("First name");
  });

  it("appends a filter summary", () => {
    expect(modelTokenDisplay("contact.first_name | default | upper", ns)).toBe(
      "First name · default · upper",
    );
  });

  it("falls back to the raw path for an unknown namespace", () => {
    expect(modelTokenDisplay("nope.field", ns)).toBe("nope.field");
  });
});

describe("modelTokenTone", () => {
  it("classifies directives", () => {
    expect(modelTokenTone("if contact.x", ns)).toBe("directive");
  });

  it("treats contact / flow as values", () => {
    expect(modelTokenTone("contact.first_name", ns)).toBe("value");
    expect(modelTokenTone("flow.card1", ns)).toBe("value");
  });

  it("flags an unknown namespace", () => {
    expect(modelTokenTone("nope.field", ns)).toBe("unknown");
  });

  it("resolves a known field of a non-shortcut namespace as a value", () => {
    expect(modelTokenTone("system.now", ns)).toBe("value");
  });

  it("flags an unknown field of a known namespace", () => {
    expect(modelTokenTone("system.missing", ns)).toBe("unknown");
  });

  it("keeps the contact/flow shortcut even for an unlisted field", () => {
    expect(modelTokenTone("contact.missing", ns)).toBe("value");
  });
});

describe("modelTokenDisplay — unknown namespace", () => {
  it("falls back to the raw path when the namespace is unknown", () => {
    expect(modelTokenDisplay("mystery.field", ns)).toBe("mystery.field");
  });
});
