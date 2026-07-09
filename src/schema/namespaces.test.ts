import { describe, expect, it } from "vitest";
import {
  DATE_FORMATS,
  ML_FILTERS,
  parseModelToken,
  STATIC_NAMESPACES,
} from "./namespaces";

describe("parseModelToken", () => {
  it("parses a bare value path", () => {
    const p = parseModelToken("contact.first_name");
    expect(p).toMatchObject({
      path: "contact.first_name",
      namespace: "contact",
      field: "first_name",
      directive: false,
    });
    expect(p.filters).toEqual([]);
  });

  it("splits namespace/field and trims", () => {
    const p = parseModelToken("  system.now  ");
    expect(p.namespace).toBe("system");
    expect(p.field).toBe("now");
  });

  it("treats a namespace-less path as namespace only", () => {
    const p = parseModelToken("loose");
    expect(p.namespace).toBe("loose");
    expect(p.field).toBe("");
  });

  it("parses a filter pipeline with args", () => {
    const p = parseModelToken('contact.name | default: "x" | upper');
    expect(p.path).toBe("contact.name");
    expect(p.filters).toEqual([
      { name: "default", args: '"x"' },
      { name: "upper", args: "" },
    ]);
  });

  it("does not split on a pipe inside a quoted arg", () => {
    const p = parseModelToken('contact.name | replace: "a|b", "c"');
    expect(p.filters).toEqual([{ name: "replace", args: '"a|b", "c"' }]);
  });

  it.each([
    ["if contact.x"],
    ["elseif contact.x"],
    ["else"],
    ["/if"],
    ["for item in contact.tags"],
    ["#priority high"],
    ["/priority"],
    ['include "sig"'],
  ])("flags %s as a directive", (inner) => {
    expect(parseModelToken(inner).directive).toBe(true);
  });

  it("does not flag a value path as a directive", () => {
    expect(parseModelToken("contact.first_name").directive).toBe(false);
  });
});

describe("static tables", () => {
  it("exposes fixed namespaces with fields", () => {
    const keys = STATIC_NAMESPACES.map((n) => n.key);
    expect(keys).toContain("system");
    expect(keys).toContain("conversation");
    for (const ns of STATIC_NAMESPACES)
      expect(ns.fields.length).toBeGreaterThan(0);
  });

  it("has a total `default` filter that applies to any type", () => {
    const def = ML_FILTERS.find((f) => f.name === "default");
    expect(def?.inputs).toBe("any");
  });

  it("ships date/time format presets", () => {
    expect(DATE_FORMATS.length).toBeGreaterThan(0);
    expect(DATE_FORMATS).toContain("yyyy-MM-dd");
  });
});

describe("parseModelToken — inline directives", () => {
  const dirs = new Set(["verify_before", "assignedToRoles"]);

  it("classifies a known directive head as a directive", () => {
    expect(parseModelToken("verify_before: payments", dirs).directive).toBe(
      true,
    );
    expect(parseModelToken("assignedToRoles: [AGENT]", dirs).directive).toBe(
      true,
    );
  });

  it("is not a directive without the vocabulary", () => {
    expect(parseModelToken("verify_before: payments").directive).toBe(false);
  });

  it("an unknown `name:` head is not a directive", () => {
    expect(parseModelToken("whatever: x", dirs).directive).toBe(false);
  });

  it("control tokens stay directives regardless of vocabulary", () => {
    expect(parseModelToken("if contact.vip", dirs).directive).toBe(true);
    expect(parseModelToken("/if", dirs).directive).toBe(true);
  });
});

describe("parseModelToken — directive head edge", () => {
  it("a token with no `name:` head is not a directive even with a vocabulary", () => {
    expect(
      parseModelToken("contact.first_name", new Set(["identity"])).directive,
    ).toBe(false);
  });
});

describe("parseModelToken — empty directive vocabulary", () => {
  it("an empty directives set does not classify a `name:` head", () => {
    expect(parseModelToken("verify: x", new Set()).directive).toBe(false);
  });
});
