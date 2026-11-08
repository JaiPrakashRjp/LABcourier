"use client";

import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { RoleTabs } from "@/components/RoleTabs";
import { Alert, Button, Field, Input, PasswordInput, PhoneInput, cx } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLES, type RoleId } from "@/lib/types";

const RULES = [
  { test: (p: string) => p.length >= 8, label: "8+ characters" },
  { test: (p: string) => /[A-Z]/.test(p), label: "Uppercase letter" },
  { test: (p: string) => /[a-z]/.test(p), label: "Lowercase letter" },
  { test: (p: string) => /\d/.test(p), label: "Number" },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: "Symbol" },
];

const STRENGTH = ["", "Weak", "Weak", "Fair", "Good", "Strong"];

function SignupForm() {
  const { signup } = useAuth();
  const params = useSearchParams();
  const initialRole = Number(params.get("role")) === ROLES.EXECUTIVE ? ROLES.EXECUTIVE : ROLES.DOCTOR;
  const [role, setRole] = useState<RoleId>(initialRole);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const passed = RULES.filter((r) => r.test(password)).length;
  const strong = passed === RULES.length;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!strong) return setError("Choose a stronger password");
    if (mismatch) return setError("Passwords do not match");
    setBusy(true);
    try {
      await signup(name.trim(), phone, password, role);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Use the phone number your lab admin registered for you.">
      <form onSubmit={submit} className="space-y-5">
        <RoleTabs value={role} onChange={setRole} includeAdmin={false} label="I am a" />
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} placeholder="Dr. Priya Sharma" />
        </Field>
        <Field label="Phone number" hint="Must match the number your admin added">
          <PhoneInput value={phone} onChange={setPhone} required />
        </Field>
        <Field label="Password">
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {password && (
          <div className="-mt-2 rounded-xl bg-neutral-50 p-3.5">
            <div className="mb-2.5 flex items-center gap-3">
              <div className="flex flex-1 gap-1" aria-hidden>
                {RULES.map((_, i) => (
                  <span
                    key={i}
                    className={cx(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      i < passed ? (strong ? "bg-emerald-500" : passed >= 3 ? "bg-amber-400" : "bg-rose-400") : "bg-neutral-200",
                    )}
                  />
                ))}
              </div>
              <span className={cx("text-xs font-semibold", strong ? "text-emerald-600" : passed >= 3 ? "text-amber-600" : "text-rose-600")}>
                {STRENGTH[passed]}
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {RULES.map((r) => {
                const ok = r.test(password);
                return (
                  <li key={r.label} className={cx("flex items-center gap-1.5", ok ? "text-emerald-700" : "text-neutral-500")}>
                    {ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />} {r.label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <Field label="Confirm password" error={mismatch ? "Passwords do not match" : undefined}>
          <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" loading={busy} className="w-full" disabled={!strong || mismatch || !confirm}>
          Create account
        </Button>
        <p className="text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link className="font-semibold text-brand-600 hover:text-brand-700" href="/login">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
