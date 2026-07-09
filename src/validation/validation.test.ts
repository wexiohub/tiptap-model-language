import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelSyntaxOptions, ModelSyntaxStorage } from "../core/types";
import { runValidation } from "./validation";

const opts = (o: Partial<ModelSyntaxOptions> = {}): ModelSyntaxOptions => ({
  namespaces: [],
  schema: [],
  directives: [],
  skipValidation: false,
  debounceMs: 10,
  severities: ["error", "warning", "info"],
  labels: {},
  ...o,
});

/** Minimal editor stub — key.getState() returns undefined (no plugin state),
 *  so runValidation takes the "no schema" branch. */
function fakeEditor(text: string, destroyed = false): Editor {
  return {
    isDestroyed: destroyed,
    getText: () => text,
    state: { tr: { setMeta: () => ({}) } },
    view: { dispatch: vi.fn() },
  } as unknown as Editor;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("runValidation", () => {
  it("does nothing when skipValidation is set", () => {
    const storage: ModelSyntaxStorage = { timer: null };
    const onResult = vi.fn();
    runValidation(
      fakeEditor("{{contact.x}}"),
      opts({ skipValidation: true, onResult }),
      storage,
    );
    vi.runAllTimers();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("reports empty result when the schema is empty", () => {
    const storage: ModelSyntaxStorage = { timer: null };
    const onResult = vi.fn();
    runValidation(fakeEditor("{{contact.x}}"), opts({ onResult }), storage);
    vi.runAllTimers();
    expect(onResult).toHaveBeenCalledWith({
      diagnostics: [],
      maxTokenEstimate: null,
    });
  });

  it("reports empty result when there are no tokens", () => {
    const storage: ModelSyntaxStorage = { timer: null };
    const onResult = vi.fn();
    runValidation(fakeEditor("plain text"), opts({ onResult }), storage);
    vi.runAllTimers();
    expect(onResult).toHaveBeenCalledWith({
      diagnostics: [],
      maxTokenEstimate: null,
    });
  });

  it("bails out inside the debounce if the editor was destroyed", () => {
    const storage: ModelSyntaxStorage = { timer: null };
    const onResult = vi.fn();
    runValidation(
      fakeEditor("{{contact.x}}", true),
      opts({ onResult }),
      storage,
    );
    vi.runAllTimers();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("debounces — a second call cancels the first pending run", () => {
    const storage: ModelSyntaxStorage = { timer: null };
    const onResult = vi.fn();
    const o = opts({ onResult });
    runValidation(fakeEditor("plain 1"), o, storage);
    runValidation(fakeEditor("plain 2"), o, storage);
    vi.runAllTimers();
    expect(onResult).toHaveBeenCalledTimes(1);
  });
});
