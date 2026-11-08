"use client";

import { ArrowUpRight, PackagePlus, PackageSearch, Search, SlidersHorizontal, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  TableSkeleton,
  cx,
  table,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { STATUS_FILL, STATUS_LABELS, STATUS_ORDER, dateOnly, money } from "@/lib/format";
import { ROLES, type City, type Courier, type Page, type Person, type Shipment, type State } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useUrlState } from "@/lib/useUrlState";

const LIMIT = 25;
const FILTER_KEYS = ["status", "courier", "direction", "type", "state", "city", "pincode", "q", "from", "to", "lab", "batch"];

export default function PackagesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role_id === ROLES.ADMIN;
  const { values, getAll, update } = useUrlState();
  const statuses = getAll("status");
  const offset = Number(values.offset ?? 0);
  const [search, setSearch] = useState(values.q ?? "");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => setSearch(values.q ?? ""), [values.q]);

  // Any filter change goes back to the first page.
  const set = (changes: Record<string, string | string[] | null>) => update({ ...changes, offset: null });

  const { data, error, loading } = useApi<Page<Shipment>>("/shipments", {
    status: statuses,
    provider_id: values.courier,
    direction: values.direction,
    recipient_type: values.type,
    state_id: values.state,
    city_id: values.city,
    pincode: values.pincode,
    lab_id: values.lab,
    batch_id: values.batch,
    q: values.q,
    date_from: values.from,
    date_to: values.to,
    sort: values.sort ?? "newest",
    limit: LIMIT,
    offset,
  });
  const couriers = useApi<Courier[]>("/couriers");
  const states = useApi<State[]>(isAdmin ? "/locations/states" : null);
  const cities = useApi<City[]>(values.state ? "/locations/cities" : null, { state_id: values.state });
  const labs = useApi<Page<Person>>(isAdmin ? "/labs" : null, { limit: 200 });

  const panelKeys = FILTER_KEYS.filter((k) => !["status", "q"].includes(k));
  const panelCount = panelKeys.filter((k) => values[k]).length;
  const activeCount = FILTER_KEYS.filter((k) => (k === "status" ? statuses.length : values[k])).length;

  const toggleStatus = (s: string) => set({ status: statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s] });

  return (
    <div>
      <PageHeader
        title="Packages"
        subtitle={isAdmin ? "Every package and return across all couriers." : "Packages sent to you, and their returns."}
        actions={isAdmin && <LinkButton href="/packages/new"><PackagePlus className="h-4 w-4" /> New package</LinkButton>}
      />

      <Card className="mb-5 space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <form className="relative w-full sm:w-auto sm:min-w-[240px] sm:flex-1" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: search.trim() || null }); }}>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              type="search"
              enterKeyHint="search"
              placeholder="Tracking no., name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              aria-label="Search packages"
            />
          </form>
          {/* On phones, sort and filters share one row. */}
          <Select className="min-w-0 flex-1 sm:w-44 sm:flex-none" value={values.sort ?? "newest"} onChange={(e) => update({ sort: e.target.value === "newest" ? null : e.target.value })} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="status">By status</option>
            <option value="price">Highest price</option>
          </Select>
          <Button variant={showFilters || panelCount ? "primary" : "secondary"} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {panelCount > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs">{panelCount}</span>}
          </Button>
          {activeCount > 0 && (
            <Button variant="ghost" onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>

        {/* One swipeable row on phones; wraps on larger screens. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {STATUS_ORDER.filter((s) => s !== "DRAFT").map((s) => {
            const on = statuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                aria-pressed={on}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition-colors duration-100 sm:py-1.5",
                  on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_FILL[s] }} />
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>

        {(showFilters || panelCount > 0) && (
          <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-4 sm:gap-3 lg:grid-cols-4">
            <Select value={values.courier ?? ""} onChange={(e) => set({ courier: e.target.value || null })} aria-label="Courier">
              <option value="">All couriers</option>
              {couriers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={values.direction ?? ""} onChange={(e) => set({ direction: e.target.value || null })} aria-label="Direction">
              <option value="">All shipments</option>
              <option value="FORWARD">Packages only</option>
              <option value="RETURN">Returns only</option>
            </Select>
            {isAdmin && (
              <>
                <Select value={values.type ?? ""} onChange={(e) => set({ type: e.target.value || null })} aria-label="Recipient type">
                  <option value="">Everyone</option>
                  <option value="DENTIST">Dentists</option>
                  <option value="EXECUTIVE">Executives</option>
                </Select>
                <Select value={values.lab ?? ""} onChange={(e) => set({ lab: e.target.value || null })} aria-label="Lab">
                  <option value="">All labs</option>
                  {labs.data?.items.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
                <Select value={values.state ?? ""} onChange={(e) => set({ state: e.target.value || null, city: null })} aria-label="State">
                  <option value="">All states</option>
                  {states.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Select value={values.city ?? ""} onChange={(e) => set({ city: e.target.value || null })} disabled={!values.state} aria-label="City">
                  <option value="">{values.state ? "All cities" : "City"}</option>
                  {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Input
                  key={values.pincode ?? ""}
                  placeholder="Pincode"
                  inputMode="numeric"
                  maxLength={6}
                  defaultValue={values.pincode ?? ""}
                  onBlur={(e) => set({ pincode: e.target.value.trim() || null })}
                  aria-label="Pincode"
                />
              </>
            )}
            {/* min-w-0: phone browsers give date boxes a wide minimum size that would push the page sideways. */}
            <div className="col-span-2 grid grid-cols-2 gap-2 lg:col-span-1">
              <Input type="date" value={values.from ?? ""} onChange={(e) => set({ from: e.target.value || null })} aria-label="From date" title="From date" className="min-w-0" />
              <Input type="date" value={values.to ?? ""} onChange={(e) => set({ to: e.target.value || null })} aria-label="To date" title="To date" className="min-w-0" />
            </div>
          </div>
        )}
      </Card>

      {error && <Alert>{error}</Alert>}
      {loading && !data && <TableSkeleton />}
      {data && data.items.length === 0 && (
        <EmptyState
          icon={<PackageSearch className="h-7 w-7" />}
          title="No packages found"
          action={activeCount ? <Button variant="secondary" onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>Clear filters</Button> : isAdmin ? <LinkButton href="/packages/new"><PackagePlus className="h-4 w-4" /> New package</LinkButton> : undefined}
        >
          {activeCount ? "Nothing matches these filters." : isAdmin ? "Create your first package to see it here." : "Packages sent to you will appear here."}
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <div className={cx("transition-opacity", loading && "opacity-60")}>
          {/* Desktop table */}
          <div className={cx(table.wrap, "hidden md:block")}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Recipient</th>
                  <th className={table.th}>Courier</th>
                  <th className={table.th}>Tracking no.</th>
                  <th className={table.th}>Status</th>
                  <th className={table.th}>Delivery</th>
                  <th className={cx(table.th, "text-right")}>Price</th>
                  <th className={table.th}><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className={cx(table.row, "group cursor-pointer")}>
                    <td className={table.td}>
                      <Link href={`/packages/${s.id}`} className="flex items-center gap-3">
                        <Avatar name={s.recipient_name} />
                        <span>
                          <span className="block font-semibold text-neutral-900 group-hover:text-brand-700">{s.recipient_name}</span>
                          <span className="flex items-center gap-1 text-xs text-neutral-500">
                            {s.direction === "RETURN" && <Undo2 className="h-3 w-3 text-pink-500" />}
                            {s.direction === "RETURN" ? "Return to lab" : s.recipient_type === "DENTIST" ? "Dentist" : "Executive"} · {s.to_city} {s.to_pincode}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className={cx(table.td, "text-neutral-700")}>
                      {s.provider_name ?? <span className="text-neutral-400">Not chosen</span>}
                      <span className="block text-xs text-neutral-400">from {s.from_name}</span>
                    </td>
                    <td className={cx(table.td, "font-mono text-xs text-neutral-700")}>{s.tracking_number ?? "—"}</td>
                    <td className={table.td}><StatusBadge status={s.status} /></td>
                    <td className={cx(table.td, "text-neutral-700")}>
                      {s.delivered_at ? dateOnly(s.delivered_at) : s.expected_delivery_date ? <span className="text-neutral-500">Exp. {dateOnly(s.expected_delivery_date)}</span> : "—"}
                    </td>
                    <td className={cx(table.td, "text-right font-semibold text-neutral-900")}>{money(s.final_price ?? s.quoted_price)}</td>
                    <td className={cx(table.td, "w-10")}>
                      <Link href={`/packages/${s.id}`} aria-label={`Open package to ${s.recipient_name}`} className="text-neutral-300 transition group-hover:text-brand-600">
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {data.items.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/packages/${s.id}`}
                  className="block rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-card transition-transform duration-100 active:scale-[0.98] active:bg-neutral-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={s.recipient_name} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-neutral-900">{s.recipient_name}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
                          {s.direction === "RETURN" && <Undo2 className="h-3 w-3 shrink-0 text-pink-500" />}
                          {s.direction === "RETURN" ? "Return to lab · " : ""}
                          {s.to_city} {s.to_pincode}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={s.status} className="shrink-0" />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                    <span className="min-w-0 truncate">
                      {s.provider_name ?? "No courier"}
                      {s.tracking_number && <span className="font-mono"> · {s.tracking_number}</span>}
                    </span>
                    <span className="shrink-0 font-semibold text-neutral-900">{money(s.final_price ?? s.quoted_price)}</span>
                  </div>
                  {(s.delivered_at || s.expected_delivery_date) && (
                    <p className="mt-1.5 text-xs text-neutral-500">
                      {s.delivered_at ? `Delivered ${dateOnly(s.delivered_at)}` : `Expected ${dateOnly(s.expected_delivery_date)}`}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={(o) => update({ offset: o || null })} />
        </div>
      )}
    </div>
  );
}
