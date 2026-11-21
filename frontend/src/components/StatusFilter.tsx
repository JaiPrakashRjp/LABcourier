"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ListFilter } from "lucide-react";
import { STATUS_FILL, STATUS_LABELS } from "@/lib/format";
import { cx } from "./ui";

/** Status filter as one dropdown: tick any number of statuses. */
export function StatusFilter({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (s: string) => onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  const label =
    selected.length === 0 ? "All statuses" : selected.length === 1 ? STATUS_LABELS[selected[0]] ?? selected[0] : `${selected.length} statuses`;

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Filter by status"
        className={cx(
          "group inline-flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-white px-3.5 text-left text-base font-medium shadow-sm shadow-neutral-900/[0.02] outline-none transition hover:border-neutral-300 focus-visible:ring-4 focus-visible:ring-brand-500/15 data-[state=open]:border-brand-500 sm:h-10 sm:w-48 sm:flex-none sm:text-sm",
          selected.length ? "border-brand-500 text-neutral-900" : "border-neutral-200 text-neutral-700",
        )}
      >
        {selected.length === 1 ? (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_FILL[selected[0]] }} />
        ) : (
          <ListFilter className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {selected.length > 1 && (
          <span className="rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">{selected.length}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-150 group-data-[state=open]:rotate-180" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-60 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {options.map((s) => {
            const on = selected.includes(s);
            return (
              <Menu.CheckboxItem
                key={s}
                checked={on}
                // Keep the menu open so several statuses can be ticked.
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(s);
                }}
                className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm font-medium text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[highlighted]:text-neutral-900"
              >
                <span
                  className={cx(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    on ? "border-brand-600 bg-brand-600 text-white" : "border-neutral-300 bg-white",
                  )}
                  aria-hidden
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_FILL[s] }} />
                <span className="flex-1">{STATUS_LABELS[s] ?? s}</span>
              </Menu.CheckboxItem>
            );
          })}
          {selected.length > 0 && (
            <>
              <Menu.Separator className="my-1 h-px bg-neutral-100" />
              <Menu.Item
                onSelect={() => onChange([])}
                className="flex min-h-[36px] cursor-pointer items-center justify-center rounded-xl px-2.5 text-sm font-semibold text-brand-700 outline-none data-[highlighted]:bg-brand-50"
              >
                Show all statuses
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
