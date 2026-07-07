import type { Editor } from "@tiptap/core";
import tippy, { type Instance } from "tippy.js";
import { SEV_COLOR } from "../core/constants";
import type { ModelLanguageLabels, PluginContext } from "../core/types";

export interface DiagnosticTooltip {
  /** Hover moved to `target` (viewport `x`/`y`) — (re)schedule / cancel. */
  scheduleError: (target: HTMLElement | null, x: number, y: number) => void;
  /** Keep the anchor point current as the pointer moves within the editor. */
  setPointer: (x: number, y: number) => void;
  /** Tear the tooltip down immediately. */
  hideError: () => void;
  /** The pointer left the editor — delay a hide if a fix tooltip is open. */
  handleEditorMouseLeave: () => void;
}

/**
 * VS Code-style hover diagnostics. Anchored to a VIRTUAL reference at the live
 * pointer (so a transformed canvas can't misplace it), shown after a short
 * delay. Every tooltip is interactive: the pointer can travel onto it to read
 * the message or click a quick-fix button (present when the diagnostic carries
 * `data-ml-fix-*`). A grace delay covers the gap between squiggle and tooltip.
 */
export function createDiagnosticTooltip(deps: {
  editor: Editor;
  ctx: PluginContext;
  labels: ModelLanguageLabels;
}): DiagnosticTooltip {
  const { editor, ctx, labels } = deps;
  let errTip: Instance | undefined;
  let errEl: Element | null = null;
  let errTipInteractive = false;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  // Live pointer position — the tooltip anchors here at render time, so it
  // always opens right at the cursor (not where the hover started 900ms ago).
  let ptrX = 0;
  let ptrY = 0;
  const setPointer = (x: number, y: number) => {
    ptrX = x;
    ptrY = y;
  };

  const cancelHide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = undefined;
  };
  const hideError = () => {
    cancelHide();
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = undefined;
    errTip?.destroy();
    errTip = undefined;
    errEl = null;
    errTipInteractive = false;
  };
  const hideErrorSoon = () => {
    cancelHide();
    hideTimer = setTimeout(hideError, 500);
  };

  // Quick-fix. "append" drops a close tag on a new line at the doc end;
  // "insertLine" drops it before a boundary token; "insert" splices text and
  // drops the cursor between the inserted quotes; "replace" swaps a range.
  const applyFix = (
    kind: string,
    fixText: string,
    pos?: number,
    end?: number,
  ) => {
    if (kind === "replace" && pos != null && end != null) {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: pos, to: end }, fixText)
        .run();
      return;
    }
    if (kind === "insertLine" && pos != null) {
      const hasBreak = !!editor.schema.nodes.hardBreak;
      const content = hasBreak
        ? [{ type: "text", text: fixText }, { type: "hardBreak" }]
        : `${fixText}\n`;
      editor.chain().focus().insertContentAt(pos, content).run();
      return;
    }
    if (kind === "insert" && pos != null) {
      editor.chain().focus().insertContentAt(pos, fixText).run();
      const q = fixText.indexOf('""');
      if (q >= 0) editor.commands.setTextSelection(pos + q + 1);
      return;
    }
    // "append"
    const docEnd = editor.state.doc.content.size;
    const hasBreak = !!editor.schema.nodes.hardBreak;
    const content = hasBreak
      ? [{ type: "hardBreak" }, { type: "text", text: fixText }]
      : `\n${fixText}`;
    editor.chain().focus("end").insertContentAt(docEnd, content).run();
  };

  const renderError = (el: Element) => {
    // Anchor at the live pointer, captured at render time — not the coords
    // from when the hover started, which by now can be far from the cursor.
    const x = ptrX;
    const y = ptrY;
    const msg = el.getAttribute("data-ml-error");
    if (!msg) return;
    const sev = (el.getAttribute("data-ml-sev") ?? "error") as
      | "error"
      | "warning"
      | "info";
    const code = el.getAttribute("data-ml-code") ?? "";
    const fixKind = el.getAttribute("data-ml-fix-kind");
    const fixText = el.getAttribute("data-ml-fix-text");
    const fixLabel = el.getAttribute("data-ml-fix-label");
    const fixPosAttr = el.getAttribute("data-ml-fix-pos");
    const fixEndAttr = el.getAttribute("data-ml-fix-end");
    const fix = !!fixKind && !!fixText;
    const color = SEV_COLOR[sev] ?? SEV_COLOR.error;

    const box = document.createElement("div");
    box.style.cssText =
      "background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;border-radius:8px;padding:7px 10px;box-shadow:0 8px 24px rgba(0,0,0,.5);font-size:12px;line-height:1.4;max-width:300px";
    const head = document.createElement("div");
    head.style.cssText =
      "display:flex;gap:7px;align-items:center;margin-bottom:2px";
    const sevEl = document.createElement("span");
    sevEl.textContent = labels.severity[sev] ?? sev;
    sevEl.style.cssText = `font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:${color}`;
    head.appendChild(sevEl);
    if (code) {
      const codeEl = document.createElement("span");
      codeEl.textContent = code;
      codeEl.style.cssText =
        "font-family:ui-monospace,monospace;font-size:10.5px;color:#71717a";
      head.appendChild(codeEl);
    }
    const bodyEl = document.createElement("div");
    bodyEl.textContent = msg;
    box.appendChild(head);
    box.appendChild(bodyEl);
    if (fix) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = fixLabel ?? labels.quickFix;
      btn.style.cssText =
        "margin-top:7px;padding:3px 9px;border-radius:6px;border:1px solid #3f3f46;background:#27272a;color:#93c5fd;font-size:11px;font-weight:500;cursor:pointer";
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applyFix(
          fixKind!,
          fixText!,
          fixPosAttr != null ? Number(fixPosAttr) : undefined,
          fixEndAttr != null ? Number(fixEndAttr) : undefined,
        );
        hideError();
      });
      box.appendChild(btn);
    }

    errTip?.destroy();
    // Every tooltip is hoverable — the pointer can travel onto it to read the
    // full message or select text, not just to click a quick-fix button.
    errTipInteractive = true;
    errTip = tippy(document.body, {
      getReferenceClientRect: () =>
        ({
          width: 0,
          height: 0,
          x,
          y,
          top: y,
          bottom: y,
          left: x,
          right: x,
        }) as DOMRect,
      content: box,
      showOnCreate: true,
      trigger: "manual",
      placement: "bottom-start",
      offset: [0, 8],
      maxWidth: "none",
      appendTo: () => document.body,
      interactive: true,
      interactiveBorder: 32,
    });
    errTip.popper.addEventListener("mouseenter", cancelHide);
    errTip.popper.addEventListener("mouseleave", hideError);
  };

  const scheduleError = (target: HTMLElement | null, x: number, y: number) => {
    ptrX = x;
    ptrY = y;
    const el = target?.closest?.("[data-ml-error]") ?? null;
    if (el === errEl) {
      cancelHide();
      return;
    }
    if (!el) {
      if (errTip && errTipInteractive) hideErrorSoon();
      else hideError();
      return;
    }
    hideError();
    errEl = el;
    if (ctx.suggestionActive) return;
    hoverTimer = setTimeout(() => renderError(el), 900);
  };

  const handleEditorMouseLeave = () => {
    if (errTip && errTipInteractive) hideErrorSoon();
    else hideError();
  };

  return { scheduleError, setPointer, hideError, handleEditorMouseLeave };
}
