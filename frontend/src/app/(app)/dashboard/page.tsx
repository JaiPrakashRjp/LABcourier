"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  CircleSlash,
  Clock,
  Package,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Card, Input, LinkButton, PageHeader, Select, Skeleton, cx } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { STATUS_FILL, STATUS_LABELS, STATUS_ORDER, dateOnly, money } from "@/lib/format";
import { ROLES, type Dashboard } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useUrlState } from "@/lib/useUrlState";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "3months", label: "3 months" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

const CARDS: { status: string; icon: React.ElementType }[] = [
  { status: "BOOKED", icon: Package },
  { status: "PICKED_UP", icon: PackageCheck },
  { status: "IN_TRANSIT", icon: Truck },
  { status: "OUT_FOR_DELIVERY", icon: Clock },
  { status: "DELIVERED", icon: CheckCircle2 },
  { status: "DELIVERY_FAILED", icon: AlertTriangle },
  { status: "RETURN_REQUESTED", icon: Undo2 },
  { status: "RETURNED", icon: RotateCcw },
  { status: "CANCELLED", icon: CircleSlash },
  { status: "BOOKING_FAILED", icon: XCircle },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role_id === ROLES.ADMIN;
  const { values, update } = useUrlState();
  const period = values.period ?? "month";
  const bucket = values.bucket ?? "";
  const [from, setFrom] = useState(values.from ?? "");
  const [to, setTo] = useState(values.to ?? "");
  const custom = period === "custom";

  const { data, error, loading } = useApi<Dashboard>(custom && !(values.from && values.to) ? null : "/dashboard", {
    period,
    bucket: bucket || undefined,
    date_from: custom ? values.from : undefined,
    date_to: custom ? values.to : undefined,
  });

  const packagesLink = (statuses: string[]) => {
    const q = new URLSearchParams();
    statuses.forEach((s) => q.append("status", s));
    if (data) {
      q.set("from", data.date_from);
      q.set("to", data.date_to);
    }
    return `/packages?${q}`;
  };

  const c = data?.status_counts ?? {};
  const moving = (c.PICKED_UP ?? 0) + (c.IN_TRANSIT ?? 0) + (c.OUT_FOR_DELIVERY ?? 0);
  const attention = (c.DELIVERY_FAILED ?? 0) + (c.BOOKING_FAILED ?? 0) + (c.RETURN_REQUESTED ?? 0);
  const delivered = c.DELIVERED ?? 0;
  const deliveredShare = data?.total ? Math.round((delivered / data.total) * 100) : 0;

  return (
    <div>
      <PageHeader
        eyebrow={<span className="text-sm font-medium text-brand-600">{greeting()}, {user?.name.split(" ")[0]}</span>}
        title="Dashboard"
        subtitle={isAdmin ? "How every package across your company is moving." : "Packages sent to you and where they are."}
        actions={isAdmin && <LinkButton href="/packages/new"><PackagePlus className="h-4 w-4" /> New package</LinkButton>}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {/* One swipeable row on phones instead of wrapping onto two lines. */}
        <div className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:px-0">
          <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-1 shadow-card" role="tablist" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                role="tab"
                aria-selected={period === p.value}
                onClick={() => update({ period: p.value })}
                className={cx(
                  "shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-100",
                  period === p.value ? "bg-neutral-900 text-white shadow" : "text-neutral-600 hover:text-neutral-900",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
          {data && (
            <span className="flex items-center gap-1.5 text-xs text-neutral-500 sm:text-sm">
              <CalendarRange className="h-4 w-4" /> {dateOnly(data.date_from)} – {dateOnly(data.date_to)}
            </span>
          )}
          <Select value={bucket} onChange={(e) => update({ bucket: e.target.value })} className="w-28 shrink-0 sm:w-36" aria-label="Group chart by">
            <option value="">Auto</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </Select>
        </div>
      </div>

      {custom && (
        <Card className="mb-6 p-5">
          <form className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap" onSubmit={(e) => { e.preventDefault(); update({ from, to }); }}>
            <label className="min-w-0 text-sm">
              <span className="mb-1.5 block font-medium text-neutral-700">From</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required className="min-w-0" />
            </label>
            <label className="min-w-0 text-sm">
              <span className="mb-1.5 block font-medium text-neutral-700">To</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} required className="min-w-0" />
            </label>
            <Button type="submit" className="col-span-2 sm:col-span-1">Apply</Button>
          </form>
        </Card>
      )}

      {error && <Alert>{error}</Alert>}

      {!data && loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      )}

      {data && (
        <div className={cx("space-y-6 transition-opacity", loading && "opacity-60")}>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            <div className="relative col-span-2 overflow-hidden rounded-2xl bg-neutral-950 p-5 text-white shadow-pop ring-1 ring-black sm:p-6 md:col-span-1">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
              <p className="text-sm font-medium text-neutral-400">Total packages</p>
              <p className="mt-2 font-display text-4xl font-bold">{data.total}</p>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-neutral-400">
                  <span>Delivered</span>
                  <span>{deliveredShare}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${deliveredShare}%` }} />
                </div>
              </div>
            </div>
            <Link href={packagesLink(["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"])} className="group rounded-2xl border border-neutral-200/80 bg-white p-4 card-hover shadow-card sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-500">On the move</p>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 sm:h-10 sm:w-10"><Truck className="h-5 w-5" /></span>
              </div>
              <p className="mt-2 font-display text-3xl font-bold text-neutral-900 sm:text-4xl">{moving}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-neutral-500 group-hover:text-brand-600 sm:text-sm"><span className="hidden sm:inline">Picked up, in transit or out for delivery</span><span className="sm:hidden">In transit now</span> <ArrowRight className="h-3.5 w-3.5" /></p>
            </Link>
            <Link href={packagesLink(["DELIVERY_FAILED", "BOOKING_FAILED", "RETURN_REQUESTED"])} className="group rounded-2xl border border-neutral-200/80 bg-white p-4 card-hover shadow-card sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-500">Needs attention</p>
                <span className={cx("flex h-10 w-10 items-center justify-center rounded-xl", attention ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
                  {attention ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                </span>
              </div>
              <p className="mt-2 font-display text-3xl font-bold text-neutral-900 sm:text-4xl">{attention}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-neutral-500 group-hover:text-brand-600 sm:text-sm">
                <span className="hidden sm:inline">{attention ? "Failed deliveries, failed bookings, returns" : "All clear"}</span><span className="sm:hidden">{attention ? "Check these" : "All clear"}</span> <ArrowRight className="h-3.5 w-3.5" />
              </p>
            </Link>
          </div>

          {/* Status cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CARDS.map(({ status, icon: Icon }) => (
              <Link
                key={status}
                href={packagesLink([status])}
                className="group card-hover rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-card"
              >
                <span className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 transition-colors duration-150 group-hover:bg-neutral-900 group-hover:text-white">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_FILL[status] }} aria-hidden />
                </span>
                <span className="mt-3 block font-display text-2xl font-bold text-neutral-900">{c[status] ?? 0}</span>
                <span className="block text-xs font-medium text-neutral-500 group-hover:text-neutral-700">{STATUS_LABELS[status]}</span>
              </Link>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-neutral-900">Packages by {data.bucket}</h2>
                  <p className="mt-0.5 text-sm text-neutral-500">Each bar is split by status. Hover for details.</p>
                </div>
              </div>
              <TrendChart data={data} />
            </Card>

            <Card>
              <h2 className="font-semibold text-neutral-900">Status share</h2>
              <p className="mt-0.5 text-sm text-neutral-500">Of {data.total} packages</p>
              <ul className="mt-5 space-y-3.5">
                {STATUS_ORDER.filter((s) => c[s]).map((s) => {
                  const pct = data.total ? Math.round(((c[s] ?? 0) / data.total) * 100) : 0;
                  return (
                    <li key={s}>
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2 text-neutral-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_FILL[s] }} /> {STATUS_LABELS[s]}
                        </span>
                        <span className="font-semibold text-neutral-900">{c[s]} <span className="font-normal text-neutral-400">· {pct}%</span></span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS_FILL[s] }} />
                      </div>
                    </li>
                  );
                })}
                {data.total === 0 && <li className="py-6 text-center text-sm text-neutral-400">No packages in this period</li>}
              </ul>
            </Card>
          </div>

          {data.by_provider.length > 0 && (
            <Card>
              <h2 className="font-semibold text-neutral-900">By courier</h2>
              <p className="mt-0.5 text-sm text-neutral-500">Packages and spend in this period</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.by_provider.map((p) => {
                  const share = data.total ? Math.round((p.count / data.total) * 100) : 0;
                  return (
                    <div key={p.provider_id} className="rounded-xl border border-neutral-200 p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white"><Truck className="h-5 w-5" /></span>
                        <div>
                          <p className="font-semibold text-neutral-900">{p.provider_name}</p>
                          <p className="text-xs text-neutral-500">{share}% of packages</p>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-between text-sm">
                        <span className="text-neutral-500">Packages</span>
                        <span className="font-semibold text-neutral-900">{p.count}</span>
                      </div>
                      <div className="mt-1.5 flex justify-between text-sm">
                        <span className="text-neutral-500">Spend</span>
                        <span className="font-semibold text-neutral-900">{money(p.spend)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function periodLabel(iso: string, bucket: Dashboard["bucket"]) {
  const d = new Date(iso);
  if (bucket === "month") return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function TrendChart({ data }: { data: Dashboard }) {
  if (data.trend.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Package className="h-10 w-10 text-neutral-300" />
        <p className="mt-3 text-sm text-neutral-500">No packages in this period.</p>
      </div>
    );
  }
  const totals = data.trend.map((t) => Object.values(t.counts).reduce((a, b) => a + b, 0));
  const max = Math.max(...totals, 1);
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const used = STATUS_ORDER.filter((s) => data.trend.some((t) => t.counts[s]));

  return (
    <div>
      <div className="relative flex h-64 gap-3 pl-8">
        {/* Gridlines and scale */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pl-8" aria-hidden>
          {[4, 3, 2, 1, 0].map((i) => (
            <div key={i} className="relative border-t border-dashed border-neutral-200">
              <span className="absolute -left-8 -top-2 w-6 text-right text-[11px] text-neutral-400">{step * i}</span>
            </div>
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-2 overflow-x-auto">
          {data.trend.map((point, i) => (
            <div key={point.period} className="group relative flex h-full min-w-[22px] flex-1 flex-col items-center justify-end">
              <div
                className="flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-t-lg transition group-hover:opacity-90"
                style={{ height: `${(totals[i] / top) * 100}%` }}
              >
                {used.map((s) =>
                  point.counts[s] ? <div key={s} style={{ height: `${(point.counts[s] / totals[i]) * 100}%`, background: STATUS_FILL[s] }} /> : null,
                )}
              </div>
              <div className="pointer-events-none absolute bottom-full z-10 mb-2 hidden w-44 rounded-xl bg-neutral-900 p-3 text-xs text-white shadow-xl group-hover:block">
                <p className="mb-1.5 font-semibold">{periodLabel(point.period, data.bucket)} · {totals[i]}</p>
                {used.filter((s) => point.counts[s]).map((s) => (
                  <p key={s} className="flex justify-between gap-2 text-neutral-300">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_FILL[s] }} />{STATUS_LABELS[s]}</span>
                    <span className="font-semibold text-white">{point.counts[s]}</span>
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pl-8">
        {data.trend.map((point) => (
          <span key={point.period} className="min-w-[22px] flex-1 text-center text-[11px] text-neutral-400">{periodLabel(point.period, data.bucket)}</span>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-neutral-100 pt-4">
        {used.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-neutral-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_FILL[s] }} />
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
