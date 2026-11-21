"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Person, PersonKind, PincodeInfo } from "@/lib/types";
import { Alert, Button, Field, Input, Modal, PhoneInput } from "./ui";

const EDIT_TITLES: Record<PersonKind, string> = { dentists: "Edit dentist", executives: "Edit executive", labs: "Edit lab", senders: "Edit sender" };
const TITLES: Record<PersonKind, { title: string; description: string }> = {
  dentists: { title: "Add dentist", description: "They can sign up later with this phone number." },
  executives: { title: "Add executive", description: "They can sign up later with this phone number." },
  labs: { title: "Add lab", description: "Packages are picked up from this address." },
  senders: { title: "Add sender", description: "Assets are picked up from this address and taken to a lab." },
};
const DETAIL: Record<PersonKind, { key: string; label: string; placeholder: string }> = {
  dentists: { key: "clinic_name", label: "Clinic name", placeholder: "Smile Dental Clinic" },
  executives: { key: "designation", label: "Designation", placeholder: "Sales executive" },
  labs: { key: "contact_person", label: "Contact person", placeholder: "Who to call at the lab" },
  senders: { key: "contact_person", label: "Contact person", placeholder: "Who to call at the sender" },
};

const EMPTY = { name: "", detail: "", phone: "", email: "", address_line1: "", address_line2: "", pincode: "" };
type FormValues = typeof EMPTY;

// Same rules as the server, so mistakes show next to the box before saving.
const NAME_RE = /^\p{L}[\p{L}\p{N} .'&(),/-]*$/u;
const tidy = (v: string) => v.trim().replace(/\s+/g, " ");

function validateForm(kind: PersonKind, f: FormValues): Record<string, string> {
  const e: Record<string, string> = {};
  const detailKey = DETAIL[kind].key;
  const detailLabel = DETAIL[kind].label;
  const name = tidy(f.name);
  // Labs and senders are often companies, so their names can hold digits and symbols.
  const isOrg = kind === "labs" || kind === "senders";
  const nameLabel = kind === "labs" ? "Lab name" : kind === "senders" ? "Sender name" : "Name";
  const nameMax = isOrg ? 150 : 100;
  if (!name) e.name = `${nameLabel} is required`;
  else if (name.length < 2) e.name = `${nameLabel} must be at least 2 characters`;
  else if (name.length > nameMax) e.name = `${nameLabel} must be at most ${nameMax} characters`;
  else if (!isOrg && !NAME_RE.test(name)) e.name = `${nameLabel} must start with a letter and can't have special symbols`;

  const detail = tidy(f.detail);
  const detailMax = kind === "dentists" ? 150 : 100;
  if (detail && detail.length < 2) e[detailKey] = `${detailLabel} must be at least 2 characters`;
  else if (detail.length > detailMax) e[detailKey] = `${detailLabel} must be at most ${detailMax} characters`;
  else if (detail && kind !== "dentists" && !NAME_RE.test(detail)) e[detailKey] = `${detailLabel} must start with a letter and can't have special symbols`;

  if (!f.phone) e.phone = "Phone number is required";
  else if (!/^[6-9]\d{9}$/.test(f.phone)) e.phone = "Enter a 10-digit mobile number starting with 6, 7, 8 or 9";

  const email = f.email.trim();
  if (email && (email.length > 120 || !/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email))) e.email = "Enter a valid email address, like name@example.com";

  const line1 = tidy(f.address_line1);
  if (!line1) e.address_line1 = "Address line 1 is required";
  else if (line1.length < 3) e.address_line1 = "Address line 1 must be at least 3 characters";
  else if (line1.length > 200) e.address_line1 = "Address line 1 must be at most 200 characters";
  if (tidy(f.address_line2).length > 200) e.address_line2 = "Address line 2 must be at most 200 characters";

  if (!/^\d{6}$/.test(f.pincode)) e.pincode = "Pincode must be exactly 6 digits";
  return e;
}

/** Create or edit a dentist, executive or lab. The pincode fills in the city and state. */
export function PersonForm({
  kind,
  open,
  onClose,
  onCreated,
  editing,
}: {
  kind: PersonKind;
  open: boolean;
  onClose: () => void;
  onCreated: (person: Person) => void;
  /** When set, the form edits this record instead of adding a new one. */
  editing?: Person | null;
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
      setForm(
        editing
          ? {
              name: editing.name,
              detail: editing.detail ?? "",
              phone: editing.phone,
              email: editing.email ?? "",
              address_line1: editing.address_line1,
              address_line2: editing.address_line2 ?? "",
              pincode: editing.pincode,
            }
          : EMPTY,
      );
      setPlace(null);
      setErrors({});
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Typing in a box clears its error.
  const errorKey = (key: keyof FormValues) => (key === "detail" ? DETAIL[kind].key : key);
  const clearError = (key: keyof FormValues) =>
    setErrors((prev) => {
      const k = errorKey(key);
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = key === "pincode" ? e.target.value.replace(/\D/g, "") : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // This dialog can open from inside the New package form; keep its submit from reaching that form.
    e.stopPropagation();
    setError("");
    const problems = validateForm(kind, form);
    setErrors(problems);
    if (Object.keys(problems).length) return setError("Please fix the highlighted fields");
    if (!place) return setPinError(pinError || "We couldn't find this pincode");
    setBusy(true);
    try {
      const body: Record<string, string | null> = {
        name: tidy(form.name),
        phone: form.phone,
        email: form.email.trim() || null,
        address_line1: tidy(form.address_line1),
        address_line2: tidy(form.address_line2) || null,
        pincode: form.pincode,
        [DETAIL[kind].key]: tidy(form.detail) || null,
      };
      const created = editing
        ? await api<Person>(`/${kind}/${editing.id}`, { method: "PUT", body })
        : await api<Person>(`/${kind}`, { body });
      toast.success(`${created.name} ${editing ? "updated" : "added"}`);
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
    <Modal open={open} title={editing ? EDIT_TITLES[kind] : TITLES[kind].title} description={TITLES[kind].description} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={kind === "labs" ? "Lab name" : kind === "senders" ? "Sender or company name" : "Full name"} error={errors.name}>
            <Input value={form.name} onChange={set("name")} required minLength={2} autoFocus />
          </Field>
          <Field label={`${DETAIL[kind].label} (optional)`} error={errors[DETAIL[kind].key]}>
            <Input value={form.detail} onChange={set("detail")} placeholder={DETAIL[kind].placeholder} />
          </Field>
          <Field label="Phone number" error={errors.phone}>
            <PhoneInput value={form.phone} onChange={(phone) => { setForm((f) => ({ ...f, phone })); clearError("phone"); }} required />
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
