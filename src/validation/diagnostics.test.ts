import { describe, expect, it } from "vitest";
import type { MlField } from "../schema/namespaces";
import {
  addsDefault,
  defaultFilterFor,
  diagnosticsByPath,
  mapDiagnostics,
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

describe("mapDiagnostics", () => {
  const R = { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 };
  const diag = (over: Record<string, unknown> = {}) => ({
    code: "ML101",
    severity: "error" as const,
    message: "m",
    range: R,
    ...over,
  });

  it("keeps field diagnostics in byPath + the flat list", () => {
    const r = mapDiagnostics(
      [diag({ code: "ML210", fieldPath: "contact.x", message: "def" })],
      [],
    );
    expect(r.diagnostics).toHaveLength(1);
    expect(r.byPath.get("contact.x")?.code).toBe("ML210");
    expect(r.byRange).toHaveLength(0);
  });

  it("routes a no-fieldPath directive diagnostic to byRange", () => {
    const r = mapDiagnostics([diag({ code: "ML243", message: "bad" })], []);
    expect(r.byRange).toEqual([
      { code: "ML243", severity: "error", message: "bad", range: R },
    ]);
    expect(r.byPath.size).toBe(0);
  });

  it("never range-squiggles ML001 or ML213 (rendered elsewhere)", () => {
    const r = mapDiagnostics(
      [diag({ code: "ML001" }), diag({ code: "ML213" })],
      [],
    );
    expect(r.byRange).toHaveLength(0);
    expect(r.diagnostics).toHaveLength(2); // still surfaced to onResult
  });

  it("drops a diagnostic whose fieldPath is a directive name", () => {
    const dirs = [{ name: "identity", hasBody: false as const, arg: null }];
    const r = mapDiagnostics(
      [diag({ code: "ML101", fieldPath: "identity" })],
      dirs,
    );
    expect(r.diagnostics).toHaveLength(0);
  });

  it("applies translateDiagnostic by code, falling back to the message", () => {
    const r = mapDiagnostics(
      [diag({ code: "ML243", message: "en" })],
      [],
      (d) => (d.code === "ML243" ? "ua" : undefined),
    );
    expect(r.diagnostics[0].message).toBe("ua");
    expect(r.byRange[0].message).toBe("ua");
  });
});
