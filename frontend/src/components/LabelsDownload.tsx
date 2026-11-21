"use client";

import { CalendarDays, FileDown, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage, openFile } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Alert, Button, Field, Input, Modal, cx } from "./ui";

type Range = "today" | "yesterday" | "custom";

/** YYYY-MM-DD in the viewer's own time zone. */
function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA");
}

/** "Download labels" button and dialog: every label for packages booked on a day or between two dates, in one PDF. */
export function LabelsDownload({ category }: { category?: "DENTAL" | "ASSET" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Printer className="h-4 w-4" /> Download labels
      </Button>
      {open && <LabelsDialog category={category} onClose={() => setOpen(false)} />}
    </>
  );
}

function LabelsDialog({ category, onClose }: { category?: "DENTAL" | "ASSET"; onClose: () => void }) {
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState(isoDay());
  const [to, setTo] = useState(isoDay());
  const [busy, setBusy] = useState(false);

  const dates =
    range === "today" ? { date_from: isoDay(), date_to: isoDay() }
    : range === "yesterday" ? { date_from: isoDay(-1), date_to: isoDay(-1) }
    : { date_from: from, date_to: to };
  const ready = !!dates.date_from && !!dates.date_to;
  const summary = useApi<{ count: number }>(ready ? "/labels/summary" : null, { ...dates, category });
  const count = summary.data?.count ?? 0;

  async function download() {
    setBusy(true);
    try {
      const name = `labels_${dates.date_from}${dates.date_to !== dates.date_from ? `_to_${dates.date_to}` : ""}.pdf`;
      await openFile(`/labels.pdf?date_from=${dates.date_from}&date_to=${dates.date_to}${category ? `&category=${category}` : ""}`, name);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const choices: { value: Range; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "custom", label: "Custom dates" },
  ];

  return (
    <Modal open title="Download labels" description="All labels for packages booked on these dates, in one PDF ready to print." onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Dates">
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={range === c.value}
              onClick={() => setRange(c.value)}
              className={cx(
                "rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                range === c.value ? "border-brand-600 bg-brand-50/60 text-brand-700" : "border-neutral-200 text-neutral-700 hover:border-neutral-300",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {range === "custom" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From">
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-4 py-3 text-sm">
          <CalendarDays className="h-4 w-4 shrink-0 text-neutral-400" />
          {summary.error ? (
            <span className="text-rose-600">{summary.error}</span>
          ) : summary.loading && !summary.data ? (
            <span className="text-neutral-500">Counting labels…</span>
          ) : (
            <span className="text-neutral-700">
              <span className="font-semibold text-neutral-900">{count}</span> label{count === 1 ? "" : "s"} for packages booked{" "}
              {range === "today" ? "today" : range === "yesterday" ? "yesterday" : dates.date_from === dates.date_to ? `on ${dates.date_from}` : `from ${dates.date_from} to ${dates.date_to}`}
            </span>
          )}
        </div>
        {!summary.error && summary.data && count === 0 && (
          <Alert tone="info">No packages with labels were booked on these dates. Cancelled packages are not included.</Alert>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 pt-4 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={download} loading={busy} disabled={!ready || count === 0 || !!summary.error}>
            <FileDown className="h-4 w-4" /> Download {count > 0 ? `${count} label${count === 1 ? "" : "s"}` : "labels"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
