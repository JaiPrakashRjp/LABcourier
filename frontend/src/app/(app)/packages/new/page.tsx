"use client";

import { BadgeIndianRupee, Check, ClipboardCheck, PackageCheck, PenLine } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, FullPageSpinner, PageHeader, cx } from "@/components/ui";
import { DetailsStep, useDraft } from "@/components/new-package/DetailsStep";
import { ProgressStep } from "@/components/new-package/ProgressStep";
import { QuotesStep } from "@/components/new-package/QuotesStep";
import { api, errorMessage } from "@/lib/api";
import type { Batch } from "@/lib/types";
import { useUrlState } from "@/lib/useUrlState";

const STEPS = [
  { label: "Details", icon: PenLine },
  { label: "Review", icon: ClipboardCheck },
  { label: "Compare prices", icon: BadgeIndianRupee },
  { label: "Book & labels", icon: PackageCheck },
];

/**
 * Where the user is lives in the URL:
 *   (no batch) ?step=review  -> form or review, from the tab's saved draft
 *   ?batch=12                -> prices or booking progress, from the server
 * so a browser refresh always reopens the same step.
 */
export default function NewPackagePage() {
  const { values, update } = useUrlState();
  const { draft, setDraft, ready, clear } = useDraft();
  const batchId = values.batch ? Number(values.batch) : null;
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (values.fresh) {
      clear();
      update({ fresh: null, step: null, batch: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.fresh]);

  useEffect(() => {
    if (!batchId) {
      setBatch(null);
      return;
    }
    if (batch?.id === batchId) return;
    api<Batch>(`/batches/${batchId}`)
      .then(setBatch)
      .catch((err) => setError(errorMessage(err)));
  }, [batchId, batch?.id]);

  const onBatchChange = useCallback((b: Batch) => setBatch(b), []);

  let step = values.step === "review" ? 1 : 0;
  if (batchId) step = !batch ? 2 : batch.status === "DRAFT" || batch.status === "QUOTED" ? 2 : 3;

  return (
    <div>
      <PageHeader title="New package" subtitle="Send the same package from one lab to many dentists and executives." />

      <div className="mb-8 rounded-2xl border border-neutral-200/80 bg-white p-3 shadow-card sm:p-4">
      {/* Phones show the current step's name in words under the icons. */}
      <ol className="flex items-center">

        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.label} className={cx("flex items-center gap-3", i < STEPS.length - 1 && "flex-1")}>
              <span
                aria-current={current ? "step" : undefined}
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition sm:h-10 sm:w-10",
                  done && "bg-emerald-500 text-white",
                  current && "bg-neutral-900 text-white shadow-lift",
                  !done && !current && "bg-neutral-100 text-neutral-400",
                )}
              >
                {done ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Step {i + 1}</span>
                <span className={cx("block truncate text-sm font-semibold", current ? "text-neutral-900" : done ? "text-neutral-700" : "text-neutral-400")}>{s.label}</span>
              </span>
              {i < STEPS.length - 1 && <span className={cx("mx-1 h-0.5 flex-1 rounded-full sm:mx-2 sm:h-px", done ? "bg-emerald-400" : "bg-neutral-200")} aria-hidden />}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-center text-sm sm:hidden">
        <span className="text-neutral-500">Step {step + 1} of {STEPS.length} · </span>
        <span className="font-semibold text-neutral-900">{STEPS[step].label}</span>
      </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {!batchId &&
        (ready ? (
          <DetailsStep
            draft={draft}
            setDraft={setDraft}
            reviewing={step === 1}
            onReview={() => update({ step: "review" }, { push: true })}
            onEdit={() => update({ step: null })}
            onCreated={(b) => {
              clear();
              setBatch(b);
              update({ step: null, batch: b.id });
            }}
          />
        ) : (
          <FullPageSpinner />
        ))}

      {batchId && !batch && !error && <FullPageSpinner />}
      {batch && step === 2 && <QuotesStep batch={batch} onBooked={onBatchChange} />}
      {batch && step === 3 && <ProgressStep batch={batch} onChange={onBatchChange} />}
    </div>
  );
}
