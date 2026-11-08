"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Person, PersonKind, PincodeInfo } from "@/lib/types";
import { Alert, Button, Field, Input, Modal, PhoneInput } from "./ui";

const TITLES: Record<PersonKind, { title: string; description: string }> = {
  dentists: { title: "Add dentist", description: "They can sign up later with this phone number." },
  executives: { title: "Add executive", description: "They can sign up later with this phone number." },
  labs: { title: "Add lab", description: "Packages are picked up from this address." },
};
const DETAIL: Record<PersonKind, { key: string; label: string; placeholder: string }> = {
  dentists: { key: "clinic_name", label: "Clinic name", placeholder: "Smile Dental Clinic" },
  executives: { key: "designation", label: "Designation", placeholder: "Sales executive" },
  labs: { key: "contact_person", label: "Contact person", placeholder: "Who to call at the lab" },
};

const EMPTY = { name: "", detail: "", phone: "", email: "", address_line1: "", address_line2: "", pincode: "" };

/** Create a dentist, executive or lab. The pincode fills in the city and state. */
export function PersonForm({
  kind,
  open,
  onClose,
  onCreated,
}: {
  kind: PersonKind;
  open: boolean;
  onClose: () => void;
  onCreated: (person: Person) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [place, setPlace] = useState<PincodeInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const [pinError, setPinError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setPlace(null);
      setErrors({});
      setError("");
    }
  }, [open]);

  useEffect(() => {
    setPlace(null);
    setPinError("");
    if (!/^\d{6}$/.test(form.pincode)) return;
    let cancelled = false;
    setLooking(true);
    api<PincodeInfo>(`/locations/pincodes/${form.pincode}`)
      .then((p) => !cancelled && setPlace(p))
      .catch(() => !cancelled && setPinError("We couldn't find this pincode"))
      .finally(() => !cancelled && setLooking(false));
    return () => {
      cancelled = true;
    };
  }, [form.pincode]);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = key === "pincode" ? e.target.value.replace(/\D/g, "") : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // This dialog can open from inside the New package form; keep its submit from reaching that form.
    e.stopPropagation();
    setError("");
    setErrors({});
    if (!place) return setPinError("Enter a valid 6-digit pincode");
    setBusy(true);
    try {
      const body: Record<string, string | null> = {
        name: form.name.trim(),
        phone: form.phone,
        email: form.email.trim() || null,
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim() || null,
        pincode: form.pincode,
        [DETAIL[kind].key]: form.detail.trim() || null,
      };
      const created = await api<Person>(`/${kind}`, { body });
      toast.success(`${created.name} added`);
      onCreated(created);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) {
        setErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={TITLES[kind].title} description={TITLES[kind].description} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={kind === "labs" ? "Lab name" : "Full name"} error={errors.name}>
            <Input value={form.name} onChange={set("name")} required minLength={2} autoFocus />
          </Field>
          <Field label={`${DETAIL[kind].label} (optional)`} error={errors[DETAIL[kind].key]}>
            <Input value={form.detail} onChange={set("detail")} placeholder={DETAIL[kind].placeholder} />
          </Field>
          <Field label="Phone number" error={errors.phone}>
            <PhoneInput value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} required />
          </Field>
          <Field label="Email (optional)" error={errors.email}>
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
          <p className="mb-3 text-sm font-semibold text-neutral-800">Address</p>
          <div className="space-y-4">
            <Field label="Address line 1" error={errors.address_line1}>
              <Input value={form.address_line1} onChange={set("address_line1")} required minLength={3} placeholder="Building, street" />
            </Field>
            <Field label="Address line 2 (optional)" error={errors.address_line2}>
              <Input value={form.address_line2} onChange={set("address_line2")} placeholder="Area, landmark" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <Field label="Pincode" error={pinError || errors.pincode}>
                <div className="relative">
                  <Input value={form.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} required placeholder="560034" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {looking ? <Loader2 className="h-4 w-4 animate-spin text-neutral-400" /> : place ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
                  </span>
                </div>
              </Field>
              <Field label="City and state">
                <Input value={place ? `${place.city_name}, ${place.state_name}` : ""} disabled placeholder="Filled from the pincode" />
              </Field>
            </div>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto border-t border-neutral-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
