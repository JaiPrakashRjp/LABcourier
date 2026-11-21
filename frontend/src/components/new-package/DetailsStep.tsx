"use client";

import { ArrowLeft, ArrowRight, Box, Building2, Stethoscope, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Avatar, Button, Card, Field, Input, SectionTitle, cx } from "@/components/ui";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import type { Batch } from "@/lib/types";
import { LabPicker, type PickedLab } from "./LabPicker";
import { RecipientPicker, type Selection } from "./RecipientPicker";

export interface Draft {
  lab: PickedLab | null;
  recipients: Selection;
  /** The weight as typed, in weight_unit. */
  weight_g: string;
  weight_unit?: "g" | "kg";
  length_cm: string;
  breadth_cm: string;
  height_cm: string;
  contents: string;
  declared_value: string;
}

const DRAFT_KEY = "courier-hub:new-package";

export const EMPTY_DRAFT: Draft = {
  lab: null,
  recipients: { dentists: {}, executives: {} },
  weight_g: "",
  weight_unit: "g",
  length_cm: "",
  breadth_cm: "",
  height_cm: "",
  contents: "Dental lab work",
  declared_value: "",
};

/** The unsent form is kept for this browser tab, so a refresh doesn't lose it. */
export function useDraft() {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) setDraft({ ...EMPTY_DRAFT, ...JSON.parse(saved) });
    } catch {
      /* storage unavailable */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable */
    }
  }, [draft, ready]);

  const clear = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    setDraft(EMPTY_DRAFT);
  };

  return { draft, setDraft, ready, clear };
}

export function recipientCount(d: Draft) {
  return Object.keys(d.recipients.dentists).length + Object.keys(d.recipients.executives).length;
}

type WeightFields = { weight_g: string; weight_unit?: "g" | "kg" };

/** The typed weight in grams (NaN when empty or not a number). */
export function weightGrams(d: WeightFields): number {
  if (!d.weight_g.trim()) return NaN;
  const v = Number(d.weight_g);
  if (!Number.isFinite(v)) return NaN;
  return d.weight_unit === "kg" ? Math.round(v * 1000) : v;
}

/** "500 g" or "1.25 kg", for the summary and review. */
export function weightText(d: WeightFields): string {
  const g = weightGrams(d);
  if (!Number.isFinite(g) || g <= 0) return "";
  return g >= 1000 ? `${Number((g / 1000).toFixed(3))} kg` : `${g} g`;
}

function validate(d: Draft): string {
  if (!d.lab) return "Choose the lab sending the package";
  if (recipientCount(d) === 0) return "Tick at least one dentist or executive";
  const w = weightGrams(d);
  if (!Number.isInteger(w) || w < 1 || w > 35000)
    return d.weight_unit === "kg" ? "Enter the weight in kg (0.001 to 35 kg)" : "Enter the weight in whole grams (1 to 35,000 g)";
  if (d.contents.trim().length < 2) return "Describe the contents";
  // Couriers take at most 150 cm on any side; say which box is wrong.
  for (const [key, label] of [["length_cm", "Length"], ["breadth_cm", "Breadth"], ["height_cm", "Height"]] as const) {
    if (!d[key].trim()) continue;
    const v = Number(d[key]);
    if (!(v > 0) || v > 150) return `${label} must be between 1 and 150 cm`;
  }
  return "";
}

function everyone(d: Draft) {
  return [
    ...Object.values(d.recipients.dentists).map((p) => ({ ...p, kind: "dentists" as const })),
    ...Object.values(d.recipients.executives).map((p) => ({ ...p, kind: "executives" as const })),
  ];
}

/** Live summary on the right while the form is filled in. */
function Summary({ draft, onRemove }: { draft: Draft; onRemove?: (kind: keyof Selection, id: number) => void }) {
  const people = everyone(draft);
  const dims = draft.length_cm ? `${draft.length_cm} × ${draft.breadth_cm || "—"} × ${draft.height_cm || "—"} cm` : "Not given";
  return (
    <Card className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Summary</p>
      <div className="mt-4 space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
          <div className="min-w-0">
            <p className="text-xs text-neutral-500">From</p>
            <p className="truncate font-semibold text-neutral-900">{draft.lab?.name ?? <span className="font-normal text-neutral-400">No lab yet</span>}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-neutral-500">To</p>
            <p className="font-semibold text-neutral-900">
              {people.length} recipient{people.length === 1 ? "" : "s"}
              <span className="ml-1 font-normal text-neutral-500">
                ({Object.keys(draft.recipients.dentists).length} dentists, {Object.keys(draft.recipients.executives).length} executives)
              </span>
            </p>
            {people.length > 0 && (
              <ul className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {people.map((p) => (
                  <li key={`${p.kind}-${p.id}`} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-neutral-700">
                    {p.name}
                    {onRemove && (
                      <button type="button" onClick={() => onRemove(p.kind, p.id)} className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700" aria-label={`Remove ${p.name}`}>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Box className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
          <div>
            <p className="text-xs text-neutral-500">Package</p>
            <p className="font-semibold text-neutral-900">{weightText(draft) || <span className="font-normal text-neutral-400">Weight not set</span>}</p>
            <p className="text-xs text-neutral-500">{dims}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DetailsStep({
  draft,
  setDraft,
  reviewing,
  onReview,
  onEdit,
  onCreated,
  bookDirect = false,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  reviewing: boolean;
  onReview: () => void;
  onEdit: () => void;
  onCreated: (batch: Batch) => void;
  /** Book straight after saving, with no price step. */
  bookDirect?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });
  const remove = (kind: keyof Selection, id: number) => {
    const next = { ...draft.recipients[kind] };
    delete next[id];
    setDraft({ ...draft, recipients: { ...draft.recipients, [kind]: next } });
  };

  function review(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate(draft);
    setError(problem);
    if (!problem) {
      onReview();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const num = (v: string) => (v.trim() ? Number(v) : null);
      const batch = await api<Batch>("/batches", {
        body: {
          lab_id: draft.lab!.id,
          dentist_ids: Object.keys(draft.recipients.dentists).map(Number),
          executive_ids: Object.keys(draft.recipients.executives).map(Number),
          weight_g: weightGrams(draft),
          length_cm: num(draft.length_cm),
          breadth_cm: num(draft.breadth_cm),
          height_cm: num(draft.height_cm),
          contents: draft.contents.trim(),
          declared_value: Number(draft.declared_value || 0),
        },
      });
      if (!bookDirect) return onCreated(batch);
      try {
        onCreated(await api<Batch>(`/batches/${batch.id}/book-now`, { method: "POST" }));
      } catch (err) {
        // Saved but not booked: the next screen offers "Book" again.
        toast.error(errorMessage(err));
        onCreated(batch);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (reviewing) {
    const people = everyone(draft);
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <SectionTitle title="From" icon={<Building2 className="h-5 w-5" />} />
            <p className="font-semibold text-neutral-900">{draft.lab?.name}</p>
            <p className="mt-1 text-sm text-neutral-600">{draft.lab?.address}</p>
            <p className="text-sm text-neutral-600">+91 {draft.lab?.phone}</p>
          </Card>
          <Card>
            <SectionTitle title="Package" description="Same for each recipient" icon={<Box className="h-5 w-5" />} />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-neutral-500">Contents</dt><dd className="font-medium text-neutral-900">{draft.contents}</dd></div>
              <div><dt className="text-neutral-500">Weight</dt><dd className="font-medium text-neutral-900">{weightText(draft)}</dd></div>
              <div><dt className="text-neutral-500">Size</dt><dd className="font-medium text-neutral-900">{draft.length_cm ? `${draft.length_cm} × ${draft.breadth_cm || "—"} × ${draft.height_cm || "—"} cm` : "Not given"}</dd></div>
              {draft.declared_value && <div><dt className="text-neutral-500">Declared value</dt><dd className="font-medium text-neutral-900">₹{draft.declared_value}</dd></div>}
            </dl>
          </Card>
        </div>
        <Card>
          <SectionTitle title={`To ${people.length} recipients`} description="One package will be booked for each person" icon={<Users className="h-5 w-5" />} />
          <ul className="grid gap-2 sm:grid-cols-2">
            {people.map((p) => (
              <li key={`${p.kind}-${p.id}`} className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
                <Avatar name={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">{p.name}</p>
                  <p className="text-xs text-neutral-500">{p.kind === "dentists" ? "Dentist" : "Executive"} · {p.city} {p.pincode}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="secondary" size="lg" onClick={onEdit}><ArrowLeft className="h-4 w-4" /> Edit details</Button>
          <Button size="lg" onClick={save} loading={busy}>{bookDirect ? "Book now" : "Save and compare prices"} <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={review} className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <SectionTitle title="1. Lab sending the package" description="Search a saved lab or add a new one" icon={<Building2 className="h-5 w-5" />} />
          <LabPicker value={draft.lab} onChange={(lab) => setDraft({ ...draft, lab })} />
        </Card>

        <Card>
          <SectionTitle title="2. Recipients" description="Filter by state and city, then tick everyone who should get this package" icon={<Stethoscope className="h-5 w-5" />} />
          <RecipientPicker value={draft.recipients} onChange={(recipients) => setDraft({ ...draft, recipients })} />
        </Card>

        <Card>
          <SectionTitle title="3. Package details" description="Couriers need the size for parcels; it's optional for documents" icon={<Box className="h-5 w-5" />} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contents">
              <Input value={draft.contents} onChange={set("contents")} required />
            </Field>
            <Field label="Weight">
              <WeightInput draft={draft} setDraft={setDraft} />
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Field label="Length (cm)"><Input inputMode="decimal" value={draft.length_cm} onChange={set("length_cm")} /></Field>
            <Field label="Breadth (cm)"><Input inputMode="decimal" value={draft.breadth_cm} onChange={set("breadth_cm")} /></Field>
            <Field label="Height (cm)"><Input inputMode="decimal" value={draft.height_cm} onChange={set("height_cm")} /></Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Declared value (₹, optional)" hint="Used for courier insurance">
              <Input inputMode="decimal" value={draft.declared_value} onChange={set("declared_value")} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24">
        <Summary draft={draft} onRemove={remove} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" className="w-full">
          Continue to review <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

/** Weight box with a g / kg switch. Only numbers can be typed; switching converts the value. */
export function WeightInput<T extends WeightFields>({ draft, setDraft }: { draft: T; setDraft: (d: T) => void }) {
  const unit = draft.weight_unit ?? "g";
  const clean = (raw: string, u: "g" | "kg") => {
    if (u === "g") return raw.replace(/\D/g, "").slice(0, 5);
    // kg: digits with one decimal point and up to 3 decimals (gram precision).
    const [whole, ...rest] = raw.replace(/[^\d.]/g, "").split(".");
    return rest.length ? `${whole.slice(0, 2)}.${rest.join("").slice(0, 3)}` : whole.slice(0, 2);
  };
  const switchTo = (u: "g" | "kg") => {
    if (u === unit) return;
    const g = weightGrams(draft);
    const value = Number.isFinite(g) && g > 0 ? (u === "kg" ? String(Number((g / 1000).toFixed(3))) : String(g)) : "";
    setDraft({ ...draft, weight_unit: u, weight_g: value });
  };
  return (
    <div className="flex">
      <Input
        inputMode={unit === "kg" ? "decimal" : "numeric"}
        value={draft.weight_g}
        onChange={(e) => setDraft({ ...draft, weight_unit: unit, weight_g: clean(e.target.value, unit) })}
        placeholder={unit === "kg" ? "e.g. 0.5" : "e.g. 500"}
        className="rounded-r-none"
        aria-label={`Weight in ${unit === "kg" ? "kilograms" : "grams"}`}
        required
      />
      <div className="flex shrink-0 rounded-r-xl border border-l-0 border-neutral-200 bg-neutral-50 p-1" role="radiogroup" aria-label="Weight unit">
        {(["g", "kg"] as const).map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={unit === u}
            onClick={() => switchTo(u)}
            className={cx(
              "min-w-[2.75rem] rounded-lg px-2.5 text-sm font-semibold transition-colors",
              unit === u ? "bg-white text-brand-700 shadow-sm ring-1 ring-neutral-200" : "text-neutral-500 hover:text-neutral-800",
            )}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}
