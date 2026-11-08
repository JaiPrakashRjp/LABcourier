"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  Copy,
  FileDown,
  ImagePlus,
  MapPin,
  PackageX,
  Phone,
  RefreshCw,
  RotateCcw,
  Truck,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, Avatar, Button, Card, Field, FullPageSpinner, Modal, StatusBadge, Textarea, cx } from "@/components/ui";
import { api, errorMessage, openFile } from "@/lib/api";
import { STATUS_FILL, STATUS_LABELS, dateOnly, dateTime, money } from "@/lib/format";
import type { Address, ShipmentDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const REASONS = [
  { value: "DAMAGED", label: "Arrived damaged", icon: PackageX },
  { value: "WRONG_ITEM", label: "Wrong item", icon: AlertTriangle },
  { value: "OTHER", label: "Other reason", icon: Undo2 },
];

const JOURNEY = ["BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

/** How far along the normal journey a status is; -1 when it has left it (failed, cancelled). */
function journeyIndex(status: string) {
  if (status === "RETURN_REQUESTED" || status === "RETURNED") return JOURNEY.length - 1;
  return JOURNEY.indexOf(status);
}

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload, setData } = useApi<ShipmentDetail>(`/shipments/${id}`);
  const [busy, setBusy] = useState("");
  const [returning, setReturning] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // While a return is being booked in the background, refresh until it settles.
  const pendingReturn = data?.returns.some((r) => r.status === "REQUESTED");
  useEffect(() => {
    if (!pendingReturn) return;
    const t = setInterval(() => void reload(), 3000);
    return () => clearInterval(t);
  }, [pendingReturn, reload]);

  async function run(name: string, fn: () => Promise<void>, success?: string) {
    setBusy(name);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy("");
    }
  }

  if (loading && !data) return <FullPageSpinner />;
  if (error && !data) return <Alert>{error}</Alert>;
  if (!data) return null;
  const s = data;
  const step = journeyIndex(s.status);
  const offTrack = step === -1 && !["DRAFT", "BOOKING"].includes(s.status);

  return (
    <div className="space-y-6">
      <Link href="/packages" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> All packages
      </Link>

      {/* Header */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14", s.direction === "RETURN" ? "bg-pink-50 text-pink-600" : "bg-neutral-100 text-neutral-900")}>
              {s.direction === "RETURN" ? <Undo2 className="h-7 w-7" /> : <Truck className="h-7 w-7" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-neutral-500">{s.direction === "RETURN" ? "Return to lab" : "Package to"}</p>
              <h1 className="break-words text-xl font-bold text-neutral-900 sm:text-2xl">{s.recipient_name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={s.status} />
                {s.tracking_number && (
                  <button
                    onClick={() => void navigator.clipboard.writeText(s.tracking_number!).then(() => toast.success("Tracking number copied"))}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-xs text-neutral-700 hover:bg-neutral-200"
                    title="Copy tracking number"
                  >
                    {s.tracking_number} <Copy className="h-3 w-3" />
                  </button>
                )}
                {s.provider_name && <span className="text-sm text-neutral-500">via {s.provider_name}</span>}
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
            {s.tracking_number && (
              <Button variant="secondary" loading={busy === "track"} onClick={() => run("track", async () => setData(await api<ShipmentDetail>(`/shipments/${id}/track`, { method: "POST" })), "Status refreshed")}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            )}
            {s.has_label && (
              <Button variant="secondary" loading={busy === "label"} onClick={() => run("label", () => openFile(`/shipments/${id}/label.pdf`))}>
                <FileDown className="h-4 w-4" /> Label
              </Button>
            )}
            {s.can_cancel && (
              <Button variant="secondary" className="text-rose-600 hover:bg-rose-50" onClick={() => setConfirmCancel(true)}>
                <Ban className="h-4 w-4" /> Cancel
              </Button>
            )}
            {s.can_return && (
              <Button onClick={() => setReturning(true)}>
                <RotateCcw className="h-4 w-4" /> Report damage / Return
              </Button>
            )}
          </div>
        </div>

        {/* Journey */}
        <div className="border-t border-neutral-100 bg-neutral-50/60 px-6 py-5">
          {offTrack ? (
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> {STATUS_LABELS[s.status] ?? s.status}
              {s.courier_status_raw ? `: ${s.courier_status_raw}` : ""}
            </div>
          ) : (
            <ol className="grid grid-cols-5 gap-2">
              {JOURNEY.map((st, i) => {
                const done = step >= i;
                const current = step === i;
                return (
                  <li key={st} className="relative">
                    <div className={cx("h-1.5 rounded-full", done ? "bg-brand-600" : "bg-neutral-200")} />
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <span className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white", done ? "bg-brand-600" : "bg-neutral-300", current && "ring-4 ring-brand-100")}>
                        {done && <Check className="h-3 w-3" />}
                      </span>
                      <span className={cx("hidden text-xs font-semibold sm:inline", done ? "text-neutral-900" : "text-neutral-400")}>{STATUS_LABELS[st]}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </Card>

      {s.booking_error && <Alert>Booking failed: {s.booking_error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Route */}
          <Card>
            <div className="grid gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <AddressBlock title="From" address={s.from_address} />
              <div className="hidden flex-col items-center text-neutral-300 sm:flex" aria-hidden>
                <div className="h-px w-16 border-t-2 border-dashed border-neutral-200" />
                <Truck className="my-1 h-5 w-5 text-brand-400" />
              </div>
              <AddressBlock title="To" address={s.to_address} />
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <h2 className="mb-5 font-semibold text-neutral-900">Status history</h2>
            {s.events.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-500">No updates from the courier yet.</p>
            ) : (
              <ol className="relative">
                {s.events.map((e, i) => (
                  <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < s.events.length - 1 && <span className="absolute left-[11px] top-7 h-full w-px bg-neutral-200" aria-hidden />}
                    <span
                      className={cx("relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-white", i === 0 ? "" : "opacity-70")}
                      style={{ background: `${STATUS_FILL[e.status] ?? "#94a3b8"}22` }}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_FILL[e.status] ?? "#94a3b8" }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <p className={cx("text-sm", i === 0 ? "font-semibold text-neutral-900" : "font-medium text-neutral-700")}>
                          {e.description || STATUS_LABELS[e.status] || e.status}
                        </p>
                        <time className="shrink-0 text-xs text-neutral-400">{dateTime(e.event_at)}</time>
                      </div>
                      {e.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                          <MapPin className="h-3 w-3" /> {e.location}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold text-neutral-900">Details</h2>
            <dl className="space-y-3 text-sm">
              <Row label="Courier" value={s.provider_name ?? "—"} />
              <Row label="Service" value={s.service_type ?? "—"} />
              <Row label="Weight" value={`${s.weight_g} g`} />
              <Row label="Price" value={money(s.final_price ?? s.quoted_price)} strong />
              <Row label="Booked" value={dateTime(s.booked_at)} />
              <Row label={s.delivered_at ? "Delivered" : "Expected"} value={s.delivered_at ? dateTime(s.delivered_at) : dateOnly(s.expected_delivery_date)} />
            </dl>
          </Card>

          {s.returns.length > 0 && (
            <Card>
              <h2 className="mb-4 font-semibold text-neutral-900">Return request</h2>
              <ul className="space-y-3">
                {s.returns.map((r) => (
                  <li key={r.id} className="rounded-xl border border-pink-100 bg-pink-50/40 p-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-neutral-900">{REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
                        {r.status === "REQUESTED" ? "Booking…" : r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{dateTime(r.created_at)}</p>
                    {r.notes && <p className="mt-2 text-neutral-700">{r.notes}</p>}
                    {r.error && <p className="mt-2 text-rose-600">{r.error}</p>}
                    {r.photo_count > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {Array.from({ length: r.photo_count }, (_, i) => (
                          <button key={i} className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-brand-600 ring-1 ring-neutral-200 hover:bg-brand-50" onClick={() => void openFile(`/returns/${r.id}/photos/${i + 1}`)}>
                            Photo {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {s.related.length > 0 && (
            <Card>
              <h2 className="mb-4 font-semibold text-neutral-900">{s.direction === "RETURN" ? "Original package" : "Return shipment"}</h2>
              <ul className="space-y-2">
                {s.related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/packages/${r.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 p-3 transition hover:border-brand-200 hover:bg-brand-50/40">
                      <span className="font-mono text-xs text-neutral-700">{r.tracking_number ?? `#${r.id}`}</span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Modal open={confirmCancel} title="Cancel this package?" description="The courier will be told to stop. This can't be undone." onClose={() => setConfirmCancel(false)}>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep package</Button>
          <Button
            variant="danger"
            loading={busy === "cancel"}
            onClick={() =>
              run("cancel", async () => {
                setData(await api<ShipmentDetail>(`/shipments/${id}/cancel`, { method: "POST" }));
                setConfirmCancel(false);
              }, "Package cancelled")
            }
          >
            Cancel package
          </Button>
        </div>
      </Modal>

      <ReturnModal open={returning} shipmentId={s.id} onClose={() => setReturning(false)} onDone={() => void reload()} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={cx("text-right", strong ? "font-bold text-neutral-900" : "font-medium text-neutral-800")}>{value}</dd>
    </div>
  );
}

function AddressBlock({ title, address }: { title: string; address: Address }) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{title}</p>
      <div className="flex gap-3">
        <Avatar name={address.name} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-neutral-900">{address.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-neutral-500"><Phone className="h-3 w-3" /> +91 {address.phone}</p>
          <p className="mt-1.5 text-neutral-600">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}
            <br />
            {address.city}, {address.state} <span className="font-medium text-neutral-800">{address.pincode}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({ open, shipmentId, onClose, onDone }: { open: boolean; shipmentId: number; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("DAMAGED");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const urls = photos.map((p) => URL.createObjectURL(p));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  function addPhotos(files: FileList | null) {
    const next = [...photos, ...Array.from(files ?? [])];
    if (next.length > 5) setError("You can attach up to 5 photos");
    setPhotos(next.slice(0, 5));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("reason", reason);
      if (notes.trim()) form.set("notes", notes.trim());
      photos.forEach((p) => form.append("photos", p));
      await api(`/shipments/${shipmentId}/returns`, { form, method: "POST" });
      toast.success("Return requested. The courier will collect it.");
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Return this package" description="The same courier collects it from you and takes it back to the lab." onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-neutral-700">What happened?</legend>
          <div className="grid grid-cols-3 gap-2">
            {REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                aria-pressed={reason === r.value}
                className={cx(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs font-semibold transition",
                  reason === r.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-neutral-200 text-neutral-600 hover:border-neutral-300",
                )}
              >
                <r.icon className="h-5 w-5" /> {r.label}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Details (optional)">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Tell the lab what's wrong" />
        </Field>
        <div>
          <span className="mb-2 block text-sm font-medium text-neutral-700">Photos (optional, up to 5)</span>
          <div className="flex flex-wrap gap-2">
            {previews.map((url, i) => (
              <div key={url} className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-neutral-900/70 p-0.5 text-white" aria-label={`Remove photo ${i + 1}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {photos.length < 5 && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-300 text-xs text-neutral-500 transition hover:border-brand-400 hover:text-brand-600">
                <ImagePlus className="h-5 w-5" /> Add
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
              </label>
            )}
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">JPG, PNG or WEBP, up to 5 MB each</p>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto border-t border-neutral-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Request return</Button>
        </div>
      </form>
    </Modal>
  );
}
