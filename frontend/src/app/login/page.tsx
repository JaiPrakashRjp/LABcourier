"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { RoleTabs } from "@/components/RoleTabs";
import { Alert, Button, Field, PasswordInput, PhoneInput } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ROLES, type RoleId } from "@/lib/types";

function LoginForm() {
  const { login } = useAuth();
  const params = useSearchParams();
  const [role, setRole] = useState<RoleId>(ROLES.ADMIN);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = params.get("next");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(phone, password, role);
      // AuthShell sends the user back to ?next= once the session is set.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to book and track your packages.">
      <form onSubmit={submit} className="space-y-5">
        <RoleTabs value={role} onChange={setRole} />
        <Field label="Phone number">
          <PhoneInput value={phone} onChange={setPhone} placeholder="10-digit mobile number" required autoFocus />
        </Field>
        <Field label="Password">
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" loading={busy} className="w-full">
          Sign in <ArrowRight className="h-4 w-4" />
        </Button>
        {role !== ROLES.ADMIN && (
          <p className="text-center text-sm text-neutral-500">
            First time here?{" "}
            <Link
              className="font-semibold text-brand-600 hover:text-brand-700"
              href={`/signup?role=${role}${next ? `&next=${encodeURIComponent(next)}` : ""}`}
            >
              Create your account
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
