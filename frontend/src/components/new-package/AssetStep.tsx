"use client";

import { ArrowLeft, ArrowRight, Box, Building2, Factory } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, Button, Card, Field, Input, SectionTitle } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { Batch } from "@/lib/types";
import { WeightInput, weightGrams, weightText } from "./DetailsStep";
import { LabPicker, type PickedLab } from "./LabPicker";

interface AssetDraft {
  sender: PickedLab | null;
  lab: PickedLab | null;
  contents: string;
  weight_g: string;
  weight_unit?: "g" | "kg";
  length_cm: string;
  breadth_cm: string;
  height_cm: string;
  declared_value: string;
}

const EMPTY: AssetDraft = {
  sender: null,
  lab: null,
  contents: "",
  weight_g: "",
  weight_unit: "g",
  length_cm: "",
  breadth_cm: "",
  height_cm: "",
  declared_value: "",
};

function validate(d: AssetDraft): string {
  if (!d.sender) return "Choose who is sending the asset";
  if (!d.lab) return "Choose the lab receiving it";
  if (d.contents.trim().length < 2) return "Describe the asset, e.g. Intraoral scanner";
  const w = weightGrams(d);
  if (!Number.isInteger(w) || w < 1 || w > 35000)
    return d.weight_unit === "kg" ? "Enter the weight in kg (0.001 to 35 kg)" : "Enter the weight in whole grams (1 to 35,000 g)";
  for (const [key, label] of [["length_cm", "Length"], ["breadth_cm", "Breadth"], ["height_cm", "Height"]] as const) {
    if (!d[key].trim()) continue;
    const v = Number(d[key]);
    if (!(v > 0) || v > 150) return `${label} must be between 1 and 150 cm`;
  }
  if (d.declared_value.trim() && !(Number(d.declared_value) >= 0)) return "Declared value must be a number";
  return "";
}

/** Assets: one package from a saved sender to one of the labs. Booked straight away (postpaid). */
export function AssetStep({
  reviewing,
  onReview,
  onEdit,
  onCreated,
}: {
  reviewing: boolean;
  onReview: () => void;
  onEdit: () => void;
  onCreated: (batch: Batch) => void;
}) {
  const [draft, setDraft] = useState<AssetDraft>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof AssetDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });
  const dims = draft.length_cm ? `${draft.length_cm} × ${draft.breadth_cm || "—"} × ${draft.height_cm || "—"} cm` : "Not given";

  function review(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate(draft);
    setError(problem);
    if (!problem) {
      onReview();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function book() {
    setBusy(true);
    setError("");
    try {
      const num = (v: string) => (v.trim() ? Number(v) : null);
      const batch = await api<Batch>("/batches", {
        body: {
          category: "ASSET",
          sender_id: draft.sender!.id,
          lab_id: draft.lab!.id,
          weight_g: weightGrams(draft),
          length_cm: num(draft.length_cm),
          breadth_cm: num(draft.breadth_cm),
          height_cm: num(draft.height_cm),
          contents: draft.contents.trim(),
          declared_value: Number(draft.declared_value || 0),
        },
      });
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
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <SectionTitle title="From (pickup)" icon={<Factory className="h-5 w-5" />} />
            <p className="font-semibold text-neutral-900">{draft.sender?.name}</p>
            <p className="mt-1 text-sm text-neutral-600">{draft.sender?.address}</p>
            <p className="text-sm text-neutral-600">+91 {draft.sender?.phone}</p>
          </Card>
          <Card>
            <SectionTitle title="To (lab)" icon={<Building2 className="h-5 w-5" />} />
            <p className="font-semibold text-neutral-900">{draft.lab?.name}</p>
            <p className="mt-1 text-sm text-neutral-600">{draft.lab?.address}</p>
            <p className="text-sm text-neutral-600">+91 {draft.lab?.phone}</p>
          </Card>
        </div>
        <Card>
          <SectionTitle title="Asset" icon={<Box className="h-5 w-5" />} />
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-neutral-500">Item</dt><dd className="font-medium text-neutral-900">{draft.contents}</dd></div>
            <div><dt className="text-neutral-500">Weight</dt><dd className="font-medium text-neutral-900">{weightText(draft)}</dd></div>
            <div><dt className="text-neutral-500">Size</dt><dd className="font-medium text-neutral-900">{dims}</dd></div>
            {draft.declared_value && <div><dt className="text-neutral-500">Declared value</dt><dd className="font-medium text-neutral-900">₹{draft.declared_value}</dd></div>}
          </dl>
        </Card>
        <Alert tone="info">The courier picks this up from the sender. Send them the label after booking so it can be stuck on the box.</Alert>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="secondary" size="lg" onClick={onEdit}><ArrowLeft className="h-4 w-4" /> Edit details</Button>
          <Button size="lg" onClick={book} loading={busy}>Book now <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={review} noValidate className="mx-auto max-w-4xl space-y-6">
      <Card>
        <SectionTitle title="1. Sender (pickup)" description="Who is sending the asset. The courier collects it from this address." icon={<Factory className="h-5 w-5" />} />
        <LabPicker kind="senders" value={draft.sender} onChange={(sender) => setDraft({ ...draft, sender })} />
      </Card>

      <Card>
        <SectionTitle title="2. Lab receiving it" description="Search a saved lab or add a new one" icon={<Building2 className="h-5 w-5" />} />
        <LabPicker value={draft.lab} onChange={(lab) => setDraft({ ...draft, lab })} />
      </Card>

      <Card>
        <SectionTitle title="3. Asset details" description="Write what is being sent; it goes on the label" icon={<Box className="h-5 w-5" />} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item">
            <Input value={draft.contents} onChange={set("contents")} placeholder="e.g. Intraoral scanner" maxLength={200} required />
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

      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" size="lg">Continue to review <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </form>
  );
}
