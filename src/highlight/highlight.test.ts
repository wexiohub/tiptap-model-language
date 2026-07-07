import { describe, expect, it } from "vitest";
import { HL_CLASS, type HlKind, tokenizeExpression } from "./highlight";

/** Kinds of the non-whitespace tokens, in order. */
function kinds(s: string): HlKind[] {
  return tokenizeExpression(s).map((t) => t.kind);
}

/** The substring each token covers. */
function spans(s: string): string[] {
  return tokenizeExpression(s).map((t) => s.slice(t.start, t.end));
}

describe("tokenizeExpression", () => {
  it("classifies a condition: keyword / path / word-operator / string", () => {
    expect(kinds('if contact.first_name contains "Vas"')).toEqual([
      "keyword",
      "path",
      "operator",
      "string",
    ]);
  });

  it("marks a segment after a pipe as a filter", () => {
    expect(kinds("contact.x | upper")).toEqual(["path", "punct", "filter"]);
  });

  it("treats comparison symbols and numbers", () => {
    expect(kinds("contact.age >= 18")).toEqual(["path", "operator", "number"]);
  });

  it("treats literals true/false/null as numbers (value-coloured)", () => {
    expect(kinds("true")).toEqual(["number"]);
    expect(kinds("null")).toEqual(["number"]);
  });

  it("colours math operators and parens", () => {
    expect(kinds("1 + 2")).toEqual(["number", "math", "number"]);
  });

  it("detects a function call by a following paren", () => {
    expect(kinds("calc(1)")).toEqual(["func", "math", "number", "math"]);
  });

  it("treats close/hash directives as keywords", () => {
    expect(kinds("/if")).toEqual(["keyword"]);
    expect(kinds("#priority")).toEqual(["keyword"]);
  });

  it("preserves exact spans", () => {
    expect(spans('a == "b"')).toEqual(["a", "==", '"b"']);
  });

  it("exposes a class for every kind", () => {
    const all: HlKind[] = [
      "keyword",
      "operator",
      "math",
      "string",
      "number",
      "filter",
      "func",
      "path",
      "punct",
    ];
    for (const k of all) expect(typeof HL_CLASS[k]).toBe("string");
  });
});
