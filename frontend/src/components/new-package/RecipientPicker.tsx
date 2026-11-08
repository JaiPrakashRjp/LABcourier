"use client";

import { Plus, Search, Stethoscope, Users } from "lucide-react";
import { useState } from "react";
import { PersonForm } from "@/components/PersonForm";
import { Avatar, Button, Checkbox, Input, Pagination, Select, Skeleton, cx } from "@/components/ui";
import type { City, Page, Person, State } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export interface Picked {
  id: number;
  name: string;
  city: string;
  pincode: string;
}

export type Selection = { dentists: Record<number, Picked>; executives: Record<number, Picked> };
type Kind = keyof Selection;

const LIMIT = 50;

/** Tick dentists and executives, filtered by state, city, name, address or pincode. */
export function RecipientPicker({ value, onChange }: { value: Selection; onChange: (next: Selection) => void }) {
  const [kind, setKind] = useState<Kind>("dentists");
  const [stateId, setStateId] = useState("");
  const [cityId, setCityId] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);

  const states = useApi<State[]>("/locations/states");
  const cities = useApi<City[]>(stateId ? "/locations/cities" : null, { state_id: stateId });
  const list = useApi<Page<Person>>(`/${kind}`, { q: query, state_id: stateId, city_id: cityId, limit: LIMIT, offset });

  const selected = value[kind];
  const pick = (p: Person): Picked => ({ id: p.id, name: p.name, city: p.city_name, pincode: p.pincode });

  const toggle = (p: Person) => {
    const next = { ...selected };
    if (next[p.id]) delete next[p.id];
    else next[p.id] = pick(p);
    onChange({ ...value, [kind]: next });
  };

  const pageItems = list.data?.items ?? [];
  const allOnPage = pageItems.length > 0 && pageItems.every((p) => selected[p.id]);
  const togglePage = () => {
    const next = { ...selected };
    pageItems.forEach((p) => (allOnPage ? delete next[p.id] : (next[p.id] = pick(p))));
    onChange({ ...value, [kind]: next });
  };

  const tabs: { key: Kind; label: string; icon: React.ElementType }[] = [
    { key: "dentists", label: "Dentists", icon: Stethoscope },
    { key: "executives", label: "Executives", icon: Users },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="grid w-full grid-cols-2 rounded-xl bg-neutral-100 p-1 sm:inline-flex sm:w-auto" role="tablist">
          {tabs.map((t) => {
            const count = Object.keys(value[t.key]).length;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={kind === t.key}
                onClick={() => { setKind(t.key); setOffset(0); }}
                className={cx(
                  "flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
                  kind === t.key ? "bg-white text-neutral-900 shadow" : "text-neutral-500 hover:text-neutral-800",
                )}
              >
                <t.icon className="h-4 w-4" /> {t.label}
                {count > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] text-white">{count}</span>}
              </button>
            );
          })}
        </div>
        <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add {kind === "dentists" ? "dentist" : "executive"}
        </Button>
      </div>

      {/* State and city side by side even on phones; search gets its own row there. */}
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Select value={stateId} onChange={(e) => { setStateId(e.target.value); setCityId(""); setOffset(0); }} aria-label="State">
          <option value="">All states</option>
          {states.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={cityId} disabled={!stateId} onChange={(e) => { setCityId(e.target.value); setOffset(0); }} aria-label="City">
          <option value="">{stateId ? "All cities" : "City"}</option>
          {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {/* Not a <form>: this sits inside the New package form, and Enter must search, not submit the package. */}
        <div className="relative col-span-2 lg:col-span-1" role="search">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Name, address or pincode"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setQuery(q.trim());
                setOffset(0);
              }
            }}
            onBlur={() => { if (q.trim() !== query) { setQuery(q.trim()); setOffset(0); } }}
            enterKeyHint="search"
            className="pl-10"
            aria-label="Search recipients"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/70 px-4 py-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            <Checkbox checked={allOnPage} onChange={togglePage} disabled={!pageItems.length} /> Select all shown
          </label>
          {list.data && <span className="text-xs text-neutral-400">{list.data.total} found</span>}
        </div>
        <ul className="max-h-[340px] divide-y divide-neutral-100 overflow-y-auto">
          {list.loading && !list.data ? (
            [0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 flex-1" /></li>
            ))
          ) : pageItems.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-neutral-500">
              Nobody found here. Use <strong>Add {kind === "dentists" ? "dentist" : "executive"}</strong> to create one.
            </li>
          ) : (
            pageItems.map((p) => {
              const on = !!selected[p.id];
              return (
                <li key={p.id}>
                  <label className={cx("flex cursor-pointer items-center gap-3 px-4 py-3 transition", on ? "bg-brand-50/60" : "hover:bg-neutral-50")}>
                    <Checkbox checked={on} onChange={() => toggle(p)} aria-label={`Select ${p.name}`} />
                    <Avatar name={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-900">{p.name}</span>
                      <span className="block truncate text-xs text-neutral-500">{p.detail ? `${p.detail} · ` : ""}{p.address_line1}</span>
                    </span>
                    <span className="hidden text-right text-xs sm:block">
                      <span className="block font-medium text-neutral-700">{p.city_name}</span>
                      <span className="text-neutral-400">{p.pincode}</span>
                    </span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
      </div>
      {list.data && <Pagination total={list.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}

      <PersonForm
        kind={kind}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(p) => {
          // New people are ticked straight away.
          onChange({ ...value, [kind]: { ...value[kind], [p.id]: pick(p) } });
          void list.reload();
        }}
      />
    </div>
  );
}
