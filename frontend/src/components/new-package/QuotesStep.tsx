"use client";

import { ArrowRight, BadgeCheck, Clock, RefreshCw, Truck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Avatar, Button, Card, Select, Skeleton, cx, table } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { money } from "@/lib/format";
import type { Batch, BatchQuotes } from "@/lib/types";

/** Shows every courier's price for each recipient; one click books them all. */
export function QuotesStep({ batch, onBooked }: { batch: Batch; onBooked: (b: Batch) => void }) {
  const [quotes, setQuotes] = useState<BatchQuotes | null>(null);
  const [provider, setProvider] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  async function load(fresh: boolean) {
    setLoading(true);
    setError("");
    try {
      // A refresh shows the saved prices; "Check again" asks the couriers again.
      const result = fresh
        ? await api<BatchQuotes>(`/batches/${batch.id}/quotes`, { method: "POST" })
        : await api<BatchQuotes>(`/batches/${batch.id}/quotes`);
      setQuotes(result);
      setProvider((p) => p ?? result.options.find((o) => o.cheapest)?.provider_id ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(batch.status === "DRAFT");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.id]);

  // Who the chosen courier can't reach, and where they will go instead.
  const plan = useMemo(() => {
    if (!quotes || provider === null) return [];
    return quotes.recipients.map((r) => {
      const wanted = overrides[r.shipment_id] ?? provider;
      const usable = r.quotes.filter((q) => q.serviceable && q.total !== null);
      const chosen = usable.find((q) => q.provider_id === wanted) ?? [...usable].sort((a, b) => a.total! - b.total!)[0];
      return { recipient: r, chosen, moved: !!chosen && chosen.provider_id !== wanted, usable };
    });
  }, [quotes, provider, overrides]);

  const total = plan.reduce((sum, p) => sum + (p.chosen?.total ?? 0), 0);
  const unreachable = plan.filter((p) => !p.chosen).length;
  const moved = plan.filter((p) => p.moved).length;
  const bookable = plan.length - unreachable;

  async function book() {
    if (provider === null) return;
    setBooking(true);
    setError("");
    try {
      onBooked(await api<Batch>(`/batches/${batch.id}/book`, { body: { provider_id: provider, overrides } }));
    } catch (err) {
      setError(errorMessage(err));
      setBooking(false);
    }
  }

  if (loading && !quotes) {
    return (
      <div className="space-y-4">
        <Card className="flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900"><Truck className="h-5 w-5 animate-pulse" /></span>
          <div>
            <p className="font-semibold text-neutral-900">Asking every courier for prices…</p>
            <p className="text-sm text-neutral-500">This takes a few seconds for {batch.total_count} recipients.</p>
          </div>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-44 sm:pb-28">
      {error && <Alert>{error}</Alert>}
      {quotes && (
        <>
          <div>
            <h2 className="mb-1 text-lg font-bold text-neutral-900">Choose a courier</h2>
            <p className="mb-4 text-sm text-neutral-500">Anyone the chosen courier can&apos;t reach is automatically sent with the cheapest courier that can.</p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {quotes.options.map((o) => {
                const active = provider === o.provider_id;
                const all = o.serviceable_count + o.unserviceable_count;
                return (
                  <button
                    key={o.provider_id}
                    type="button"
                    disabled={o.serviceable_count === 0}
                    onClick={() => setProvider(o.provider_id)}
                    aria-pressed={active}
                    className={cx(
                      "relative rounded-2xl border-2 bg-white p-4 text-left sm:p-5 transition disabled:cursor-not-allowed disabled:opacity-50",
                      active ? "border-brand-600 shadow-glow" : "border-neutral-200 shadow-card hover:border-neutral-300",
                    )}
                  >
                    {o.cheapest && (
                      <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white shadow">
                        <BadgeCheck className="h-3.5 w-3.5" /> Best value
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={cx("hidden h-11 w-11 items-center justify-center rounded-xl sm:flex", active ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-500")}>
                          <Truck className="h-5 w-5" />
                        </span>
                        <span className="truncate font-semibold text-neutral-900">{o.provider_name}</span>
                      </span>
                      <span className={cx("h-5 w-5 shrink-0 rounded-full border-2", active ? "border-brand-600 bg-brand-600 ring-4 ring-inset ring-white" : "border-neutral-300")} aria-hidden />
                    </div>
                    <p className="mt-3 font-display text-2xl font-bold text-neutral-900 sm:mt-4 sm:text-3xl">{money(o.total)}</p>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-neutral-500">
                        <span>Reaches {o.serviceable_count} of {all}</span>
                        <span>{all ? Math.round((o.serviceable_count / all) * 100) : 0}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${all ? (o.serviceable_count / all) * 100 : 0}%` }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phones: one card per recipient; tap a price to choose that courier. */}
          <ul className="space-y-3 md:hidden">
            {plan.map(({ recipient: r, chosen, moved: wasMoved, usable }) => (
              <li key={r.shipment_id} className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-card">
                <div className="flex items-center gap-3">
                  <Avatar name={r.recipient_name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{r.recipient_name}</p>
                    <p className="truncate text-xs text-neutral-500">{r.city} {r.pincode}</p>
                  </div>
                </div>
                {usable.length === 0 ? (
                  <p className="mt-3 flex items-center gap-1 text-xs font-medium text-rose-600">
                    <TriangleAlert className="h-3.5 w-3.5" /> No courier reaches this pincode
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Courier for ${r.recipient_name}`}>
                    {quotes.options.map((o) => {
                      const q = r.quotes.find((x) => x.provider_id === o.provider_id);
                      const ok = !!q?.serviceable && q.total !== null;
                      const picked = chosen?.provider_id === o.provider_id;
                      return (
                        <button
                          key={o.provider_id}
                          type="button"
                          role="radio"
                          aria-checked={picked}
                          disabled={!ok}
                          onClick={() => setOverrides({ ...overrides, [r.shipment_id]: o.provider_id })}
                          className={cx(
                            "rounded-xl border-2 px-3 py-2.5 text-left transition-colors duration-100 disabled:cursor-not-allowed",
                            picked ? "border-brand-600 bg-brand-50/60" : "border-neutral-200 active:bg-neutral-50",
                            !ok && "border-dashed opacity-60",
                          )}
                        >
                          <span className="block text-xs font-medium text-neutral-500">{o.provider_name}</span>
                          <span className={cx("block font-semibold", picked ? "text-brand-700" : "text-neutral-900")}>
                            {ok ? money(q!.total) : "Can't deliver"}
                          </span>
                          {ok && q!.estimated_days ? <span className="text-[11px] text-neutral-400">{q!.estimated_days} days</span> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
                {wasMoved && <p className="mt-2 text-xs font-medium text-amber-600">Switched: first choice can&apos;t reach</p>}
              </li>
            ))}
          </ul>

          <div className={cx(table.wrap, "hidden md:block")}>
            <table className={table.table}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Recipient</th>
                  {quotes.options.map((o) => <th key={o.provider_id} className={cx(table.th, "text-right")}>{o.provider_name}</th>)}
                  <th className={table.th}>Book with</th>
                </tr>
              </thead>
              <tbody>
                {plan.map(({ recipient: r, chosen, moved: wasMoved, usable }) => (
                  <tr key={r.shipment_id} className={table.row}>
                    <td className={table.td}>
                      <div className="flex items-center gap-3">
                        <Avatar name={r.recipient_name} />
                        <div>
                          <p className="font-semibold text-neutral-900">{r.recipient_name}</p>
                          <p className="text-xs text-neutral-500">{r.city} {r.pincode}</p>
                        </div>
                      </div>
                    </td>
                    {quotes.options.map((o) => {
                      const q = r.quotes.find((x) => x.provider_id === o.provider_id);
                      const picked = chosen?.provider_id === o.provider_id;
                      return (
                        <td key={o.provider_id} className={cx(table.td, "text-right")} title={q?.message ?? undefined}>
                          {q?.serviceable && q.total !== null ? (
                            <span className={cx("inline-block rounded-lg px-2 py-1", picked && "bg-brand-50 ring-1 ring-brand-200")}>
                              <span className={cx("block font-semibold", picked ? "text-brand-700" : "text-neutral-700")}>{money(q.total)}</span>
                              {q.estimated_days ? <span className="flex items-center justify-end gap-1 text-xs text-neutral-400"><Clock className="h-3 w-3" />{q.estimated_days}d</span> : null}
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-400">Can&apos;t deliver</span>
                          )}
                        </td>
                      );
                    })}
                    <td className={table.td}>
                      {usable.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600"><TriangleAlert className="h-3.5 w-3.5" /> No courier reaches</span>
                      ) : (
                        <div>
                          <Select
                            value={chosen?.provider_id ?? ""}
                            onChange={(e) => setOverrides({ ...overrides, [r.shipment_id]: Number(e.target.value) })}
                            className="h-9 w-full sm:w-40"
                            aria-label={`Courier for ${r.recipient_name}`}
                          >
                            {usable.map((q) => <option key={q.provider_id} value={q.provider_id}>{q.provider_name}</option>)}
                          </Select>
                          {wasMoved && <span className="mt-1 block text-xs font-medium text-amber-600">Switched: first choice can&apos;t reach</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unreachable > 0 && <Alert tone="info">{unreachable} recipient{unreachable === 1 ? "" : "s"} can&apos;t be reached by any courier and will be marked as failed.</Alert>}

          {/* Sticky booking bar */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/85 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.15)] backdrop-blur-xl lg:left-64">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
              <div>
                <p className="text-xs text-neutral-500">{bookable} package{bookable === 1 ? "" : "s"}{moved ? ` · ${moved} switched courier` : ""}</p>
                <p className="font-display text-2xl font-bold text-neutral-900">{money(total)}</p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
                <Button variant="secondary" onClick={() => void load(true)} loading={loading}>
                  <RefreshCw className="h-4 w-4" /> Check again
                </Button>
                <Button size="lg" onClick={book} loading={booking} disabled={provider === null || bookable === 0}>
                  Book all {bookable} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
