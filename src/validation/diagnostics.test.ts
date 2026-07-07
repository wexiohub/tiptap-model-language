import { describe, expect, it } from "vitest";
import type { MlField } from "../schema/namespaces";
import {
  addsDefault,
  defaultFilterFor,
  diagnosticsByPath,
  suggestOperator,
} from "./diagnostics";

describe("diagnosticsByPath", () => {
  it("keeps the worst severity per field path", () => {
    const m = diagnosticsByPath([
      { code: "A", severity: "warning", message: "w", fieldPath: "x" },
      { code: "B", severity: "error", message: "e", fieldPath: "x" },
      { code: "C", severity: "info", message: "i", fieldPath: "x" },
    ]);
    expect(m.get("x")).toMatchObject({ severity: "error", code: "B" });
  });

  it("ignores diagnostics without a field path", () => {
    const m = diagnosticsByPath([
      { code: "A", severity: "error", message: "e" },
    ]);
    expect(m.size).toBe(0);
  });
});

describe("addsDefault", () => {
  it("matches ML210 by code", () => {
    expect(
      addsDefault({ code: "ML210", severity: "warning", message: "x" }),
    ).toBe(true);
  });
  it("matches a message mentioning default", () => {
    expect(
      addsDefault({ code: "X", severity: "warning", message: "add a default" }),
    ).toBe(true);
  });
  it("does not match otherwise", () => {
    expect(
      addsDefault({ code: "X", severity: "warning", message: "nope" }),
    ).toBe(false);
  });
});

describe("defaultFilterFor", () => {
  const f = (o: Partial<MlField>): MlField => ({
    key: "k",
    label: "L",
    type: "string",
    ...o,
  });
  it("uses the first option for a value-list field", () => {
    expect(defaultFilterFor(f({ type: "enum", values: ["hi", "lo"] }))).toBe(
      ' | default: "hi"',
    );
  });
  it("uses 0 for a number", () => {
    expect(defaultFilterFor(f({ type: "number" }))).toBe(" | default: 0");
  });
  it("uses false for a boolean", () => {
    expect(defaultFilterFor(f({ type: "boolean" }))).toBe(" | default: false");
  });
  it("uses an empty string otherwise", () => {
    expect(defaultFilterFor(f({ type: "string" }))).toBe(' | default: ""');
    expect(defaultFilterFor(undefined)).toBe(' | default: ""');
  });
});

describe("suggestOperator", () => {
  it("completes a prefix to the shortest match", () => {
    expect(suggestOperator("contai")).toBe("contains");
    expect(suggestOperator("start")).toBe("startsWith");
  });
  it("returns null for empty or non-matching input", () => {
    expect(suggestOperator("")).toBeNull();
    expect(suggestOperator("zzz")).toBeNull();
  });
});
