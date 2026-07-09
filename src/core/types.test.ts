import { describe, expect, it } from "vitest";
import { DEFAULT_LABELS, resolveLabels } from "./types";

describe("resolveLabels", () => {
  it("returns the shared defaults when no overrides are given", () => {
    expect(resolveLabels()).toBe(DEFAULT_LABELS);
  });

  it("merges overrides over the defaults", () => {
    const r = resolveLabels({ quickFix: "Fix!" });
    expect(r.quickFix).toBe("Fix!");
    expect(r.addDefault).toBe(DEFAULT_LABELS.addDefault);
  });
});

describe("DEFAULT_LABELS templated strings", () => {
  it("build the expected messages", () => {
    expect(DEFAULT_LABELS.unclosedBlock("if")).toContain("{{/if}}");
    expect(DEFAULT_LABELS.noOpenBlock("for")).toContain("{{for}}");
    expect(DEFAULT_LABELS.changeTo("contains")).toContain("contains");
    expect(DEFAULT_LABELS.addCloseTag("{{/if}}")).toContain("{{/if}}");
  });
});
