"use client";

import { Building2, MapPin, Phone, Plus, Search } from "lucide-react";
import { useState } from "react";
import { PersonForm } from "@/components/PersonForm";
import { Button, Input, Skeleton } from "@/components/ui";
import type { Page, Person } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export interface PickedLab {
  id: number;
  name: string;
  phone: string;
  address: string;
}

/** Search an existing lab or create a new one. */
export function LabPicker({ value, onChange }: { value: PickedLab | null; onChange: (lab: PickedLab | null) => void }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const labs = useApi<Page<Person>>(value ? null : "/labs", { q: query, limit: 6 });

  const pick = (l: Person): PickedLab => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    address: `${l.address_line1}, ${l.city_name} ${l.pincode}`,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-brand-500 bg-brand-50/50 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-neutral-900">{value.name}</p>
            <p className="flex items-center gap-1 text-sm text-neutral-600"><MapPin className="h-3.5 w-3.5" /> {value.address}</p>
            <p className="flex items-center gap-1 text-sm text-neutral-600"><Phone className="h-3.5 w-3.5" /> +91 {value.phone}</p>
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {/* Not a <form>: this sits inside the New package form, and Enter must search, not submit the package. */}
        <div className="relative min-w-[200px] flex-1" role="search">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search lab by name, phone or pincode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setQuery(q.trim());
              }
            }}
            onBlur={() => setQuery(q.trim())}
            enterKeyHint="search"
            className="pl-10"
            aria-label="Search labs"
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> New lab
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {labs.loading && !labs.data ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)
        ) : labs.data?.items.length ? (
          labs.data.items.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onChange(pick(l))}
              className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-card"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                <Building2 className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-neutral-900">{l.name}</span>
                <span className="block truncate text-xs text-neutral-500">{l.address_line1}, {l.city_name} {l.pincode}</span>
              </span>
            </button>
          ))
        ) : (
          <p className="col-span-full rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
            No labs found. Add one with <strong>New lab</strong>.
          </p>
        )}
      </div>
      <PersonForm kind="labs" open={adding} onClose={() => setAdding(false)} onCreated={(l) => onChange(pick(l))} />
    </div>
  );
}
