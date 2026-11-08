"use client";

import { CheckCircle2, FileDown, Loader2, PackagePlus, RefreshCw, RotateCw, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, Avatar, Button, Card, LinkButton, StatusBadge, cx, table } from "@/components/ui";
import { api, errorMessage, openFile } from "@/lib/api";
import { money } from "@/lib/format";
import type { Batch } from "@/lib/types";

/** Booking runs in the background; this polls until every package is booked or failed. */
export function ProgressStep({ batch, onChange }: { batch: Batch; onChange: (b: Batch) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const running = batch.status === "BOOKING";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      try {
        const next = await api<Batch>(`/batches/${batch.id}`);
        onChange(next);
        if (next.status !== "BOOKING") {
          if (next.failed_count) toast.warning(`${next.booked_count} booked, ${next.failed_count} failed`);
          else toast.success(`All ${next.booked_count} packages booked`);
        }
      } catch (err) {
        setError(errorMessage(err));
      }
    }, 2000);
    return () => clearInterval(t);
  }, [running, batch.id, onChange]);

  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }

  const done = batch.booked_count + batch.failed_count;
  const percent = batch.total_count ? Math.round((done / batch.total_count) * 100) : 0;
  const booked = batch.shipments.filter((s) => s.tracking_number && s.status !== "BOOKING_FAILED");
  const total = batch.shipments.reduce((sum, s) => sum + (s.final_price ?? 0), 0);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-5 p-6">
          <span
            className={cx(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14",
              running ? "bg-neutral-100 text-neutral-900" : batch.failed_count ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600",
            )}
          >
            {running ? <Loader2 className="h-7 w-7 animate-spin" /> : batch.failed_count ? <TriangleAlert className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <h2 className="text-lg font-bold text-neutral-900 sm:text-xl">
              {running ? "Booking your packages…" : batch.failed_count ? "Booked, with some failures" : "All packages booked"}
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              From {batch.lab_name} · {batch.total_count} recipients{!running && total ? ` · ${money(total)} total` : ""}
            </p>
          </div>
          <div className="grid w-full grid-cols-3 divide-x divide-neutral-100 rounded-xl bg-neutral-50 py-3 text-center sm:flex sm:w-auto sm:gap-6 sm:divide-x-0 sm:bg-transparent sm:py-0">
            <div><p className="font-display text-2xl font-bold text-emerald-600">{batch.booked_count}</p><p className="text-xs text-neutral-500">Booked</p></div>
            <div><p className="font-display text-2xl font-bold text-rose-600">{batch.failed_count}</p><p className="text-xs text-neutral-500">Failed</p></div>
            <div><p className="font-display text-2xl font-bold text-neutral-900">{batch.total_count}</p><p className="text-xs text-neutral-500">Total</p></div>
          </div>
        </div>
        <div className="h-2 bg-neutral-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Booking progress">
          <div className={cx("h-full transition-all duration-500", batch.failed_count ? "bg-gradient-to-r from-emerald-500 to-amber-500" : "bg-gradient-to-r from-brand-500 to-emerald-500")} style={{ width: `${percent}%` }} />
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
        {batch.has_labels && (
          <Button loading={busy === "labels"} onClick={() => act("labels", () => openFile(`/batches/${batch.id}/labels.pdf`, `labels_${batch.id}.pdf`))}>
            <FileDown className="h-4 w-4" /> Download all labels
          </Button>
        )}
        {!running && booked.length > 0 && !batch.has_labels && (
          <Button variant="secondary" loading={busy === "relabel"} onClick={() => act("relabel", async () => onChange(await api<Batch>(`/batches/${batch.id}/labels`, { method: "POST" })))}>
            <RotateCw className="h-4 w-4" /> Get labels again
          </Button>
        )}
        {!running && batch.failed_count > 0 && (
          <Button variant="secondary" loading={busy === "retry"} onClick={() => act("retry", async () => onChange(await api<Batch>(`/batches/${batch.id}/retry`, { method: "POST" })))}>
            <RefreshCw className="h-4 w-4" /> Retry failed
          </Button>
        )}
        <LinkButton href={`/packages?batch=${batch.id}`} variant="secondary">
          <Search className="h-4 w-4" /> Track these packages
        </LinkButton>
        <LinkButton href="/packages/new?fresh=1" variant="ghost">
          <PackagePlus className="h-4 w-4" /> Start another
        </LinkButton>
      </div>

      {/* Phones: one card per package, so status and tracking number are never cut off. */}
      <ul className="space-y-3 md:hidden">
        {batch.shipments.map((s) => (
          <li key={s.id}>
            <Link
              href={`/packages/${s.id}`}
              className="block rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-card transition-transform duration-100 active:scale-[0.98]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={s.recipient_name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{s.recipient_name}</p>
                    <p className="truncate text-xs text-neutral-500">{s.to_city} {s.to_pincode}</p>
                  </div>
                </div>
                <StatusBadge status={s.status} className="shrink-0" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                <span className="min-w-0 truncate">
                  {s.provider_name ?? "—"}
                  {s.tracking_number && <span className="font-mono"> · {s.tracking_number}</span>}
                </span>
                <span className="shrink-0 font-semibold text-neutral-900">{money(s.final_price ?? s.quoted_price)}</span>
              </div>
              {s.booking_error && <p className="mt-2 text-xs text-rose-600">{s.booking_error}</p>}
            </Link>
          </li>
        ))}
      </ul>

      <div className={cx(table.wrap, "hidden md:block")}>
        <table className={table.table}>
          <thead className={table.head}>
            <tr>
              <th className={table.th}>Recipient</th>
              <th className={table.th}>Courier</th>
              <th className={table.th}>Tracking no.</th>
              <th className={table.th}>Status</th>
              <th className={cx(table.th, "text-right")}>Price</th>
            </tr>
          </thead>
          <tbody>
            {batch.shipments.map((s) => (
              <tr key={s.id} className={table.row}>
                <td className={table.td}>
                  <Link href={`/packages/${s.id}`} className="flex items-center gap-3">
                    <Avatar name={s.recipient_name} />
                    <span>
                      <span className="block font-semibold text-neutral-900 hover:text-brand-700">{s.recipient_name}</span>
                      <span className="text-xs text-neutral-500">{s.to_city} {s.to_pincode}</span>
                    </span>
                  </Link>
                </td>
                <td className={cx(table.td, "text-neutral-700")}>{s.provider_name ?? "—"}</td>
                <td className={cx(table.td, "font-mono text-xs")}>{s.tracking_number ?? "—"}</td>
                <td className={table.td}>
                  <StatusBadge status={s.status} />
                  {s.booking_error && <span className="mt-1.5 block max-w-xs text-xs text-rose-600">{s.booking_error}</span>}
                </td>
                <td className={cx(table.td, "text-right font-semibold text-neutral-900")}>{money(s.final_price ?? s.quoted_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
