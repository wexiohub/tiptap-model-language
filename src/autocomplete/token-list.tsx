"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "../core/utils";
import { type ModelTokenOption, optionGroups } from "./options";

export interface ModelTokenListRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface ModelTokenListProps {
  items: ModelTokenOption[];
  command: (item: ModelTokenOption) => void;
  /** i18n text for the empty state. */
  emptyLabel?: string;
}

/** The `{{` autocomplete menu — grouped by namespace (or Filters), keyboard-
 *  navigable. Rendered into a tippy popup by the ModelToken suggestion plugin. */
export const ModelTokenList = forwardRef<
  ModelTokenListRef,
  ModelTokenListProps
>(function ModelTokenList({ items, command, emptyLabel }, ref) {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((s) => (s - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          if (items[selected]) {
            command(items[selected]);
            return true;
          }
        }
        return false;
      },
    }),
    [items, selected, command],
  );

  if (items.length === 0) {
    return (
      <div className="bg-popover text-muted-foreground w-72 rounded-md border p-3 text-center text-xs shadow-md">
        {emptyLabel ?? "No variables match."}
      </div>
    );
  }

  const grouped = optionGroups(items).map((g) => ({
    group: g,
    items: items.filter((o) => o.group === g),
  }));

  return (
    <div className="bg-popover text-popover-foreground max-h-72 w-80 overflow-y-auto rounded-md border p-1 shadow-md">
      {grouped.map((section) => (
        <div key={section.group} className="mb-1 last:mb-0">
          <p className="text-muted-foreground px-2 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide uppercase">
            {section.group}
          </p>
          {section.items.map((o) => {
            const idx = items.indexOf(o);
            const active = idx === selected;
            return (
              <button
                key={o.insert}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  command(o);
                }}
                onMouseEnter={() => setSelected(idx)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left",
                  active && "bg-accent",
                )}
              >
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    o.kind === "block"
                      ? "bg-violet-500"
                      : o.kind === "filter"
                        ? "bg-sky-500"
                        : "bg-muted-foreground/50",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">
                    {o.label}
                  </span>
                  <span className="text-muted-foreground block truncate text-[11px]">
                    {o.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});
