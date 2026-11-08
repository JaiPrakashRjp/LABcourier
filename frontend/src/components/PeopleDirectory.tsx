"use client";

import { Building2, MapPin, Phone, Plus, Search, Stethoscope, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/useApi";
import { useUrlState } from "@/lib/useUrlState";
import type { City, Page, Person, PersonKind, State } from "@/lib/types";
import { PersonForm } from "./PersonForm";
import { Alert, Avatar, Button, Card, EmptyState, Input, PageHeader, Pagination, Select, TableSkeleton, cx, table } from "./ui";

const LIMIT = 25;
const LABELS: Record<PersonKind, { title: string; subtitle: string; add: string; detail: string; icon: React.ElementType }> = {
  dentists: { title: "Dentists", subtitle: "Doctors who receive packages from your labs.", add: "Add dentist", detail: "Clinic", icon: Stethoscope },
  executives: { title: "Executives", subtitle: "Executives who receive packages.", add: "Add executive", detail: "Designation", icon: Users },
  labs: { title: "Labs", subtitle: "Labs that send packages.", add: "Add lab", detail: "Contact person", icon: Building2 },
};

/** Search by name, phone, address or pincode, with state and city filters kept in the URL. */
export function PeopleDirectory({ kind }: { kind: PersonKind }) {
  const labels = LABELS[kind];
  const Icon = labels.icon;
  const { values, update } = useUrlState();
  const offset = Number(values.offset ?? 0);
  const [q, setQ] = useState(values.q ?? "");
  const [adding, setAdding] = useState(false);

  useEffect(() => setQ(values.q ?? ""), [values.q]);

  const { data, error, loading, reload } = useApi<Page<Person>>(`/${kind}`, {
    q: values.q,
    state_id: values.state,
    city_id: values.city,
    limit: LIMIT,
    offset,
  });
  const states = useApi<State[]>("/locations/states");
  const cities = useApi<City[]>(values.state ? "/locations/cities" : null, { state_id: values.state });
  const filtered = !!(values.q || values.state || values.city);

  return (
    <div>
      <PageHeader
        title={labels.title}
        subtitle={labels.subtitle}
        eyebrow={data && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{data.total} total</span>}
        actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {labels.add}</Button>}
      />

      <Card className="mb-5 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <form className="relative w-full sm:w-auto sm:min-w-[240px] sm:flex-1" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() || null, offset: null }); }}>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input type="search" enterKeyHint="search" placeholder="Name, phone, address or pincode…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" aria-label="Search" />
          </form>
          <Select className="min-w-0 flex-1 sm:w-48 sm:flex-none" value={values.state ?? ""} onChange={(e) => update({ state: e.target.value || null, city: null, offset: null })} aria-label="State">
            <option value="">All states</option>
            {states.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select className="min-w-0 flex-1 sm:w-48 sm:flex-none" value={values.city ?? ""} disabled={!values.state} onChange={(e) => update({ city: e.target.value || null, offset: null })} aria-label="City">
            <option value="">{values.state ? "All cities" : "City"}</option>
            {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}
      {loading && !data && <TableSkeleton />}
      {data && data.items.length === 0 && (
        <EmptyState
          icon={<Icon className="h-7 w-7" />}
          title={filtered ? `No ${labels.title.toLowerCase()} match` : `No ${labels.title.toLowerCase()} yet`}
          action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {labels.add}</Button>}
        >
          {filtered ? "Try a different search or location." : `Add your first ${labels.add.replace("Add ", "")} to start sending packages.`}
        </EmptyState>
      )}
      {data && data.items.length > 0 && (
        <div className={cx("transition-opacity", loading && "opacity-60")}>
          <div className={cx(table.wrap, "hidden md:block")}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Name</th>
                  <th className={table.th}>Phone</th>
                  <th className={table.th}>Address</th>
                  <th className={table.th}>Location</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className={table.row}>
                    <td className={table.td}>
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name} />
                        <div>
                          <p className="font-semibold text-neutral-900">{p.name}</p>
                          {p.detail && <p className="text-xs text-neutral-500">{p.detail}</p>}
                        </div>
                      </div>
                    </td>
                    <td className={cx(table.td, "text-neutral-700")}>+91 {p.phone}</td>
                    <td className={cx(table.td, "max-w-xs text-neutral-600")}>
                      {p.address_line1}
                      {p.address_line2 ? `, ${p.address_line2}` : ""}
                    </td>
                    <td className={table.td}>
                      <span className="font-medium text-neutral-800">{p.city_name}</span>
                      <span className="block text-xs text-neutral-500">{p.state_name} · {p.pincode}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {data.items.map((p) => (
              <li key={p.id} className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-card">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} />
                  <div>
                    <p className="font-semibold text-neutral-900">{p.name}</p>
                    {p.detail && <p className="text-xs text-neutral-500">{p.detail}</p>}
                  </div>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-sm text-neutral-600"><Phone className="h-3.5 w-3.5" /> +91 {p.phone}</p>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-neutral-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p.address_line1}, {p.city_name} {p.pincode}</p>
              </li>
            ))}
          </ul>
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={(o) => update({ offset: o || null })} />
        </div>
      )}

      <PersonForm kind={kind} open={adding} onClose={() => setAdding(false)} onCreated={() => void reload()} />
    </div>
  );
}
