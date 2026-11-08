"use client";

import { BadgeIndianRupee, Bell, MousePointerClick, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { FullPageSpinner, Logo } from "./ui";

/** Only allow same-site paths, so ?next= can't send users to another website. */
export function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

const POINTS = [
  { icon: BadgeIndianRupee, text: "Compare courier prices for every pincode" },
  { icon: MousePointerClick, text: "Book a whole batch in one click" },
  { icon: Bell, text: "Follow every status as it happens" },
  { icon: RotateCcw, text: "Report damage and track the return" },
];

/** Sign-in and sign-up layout: brand panel on the left, form on the right. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  if (status !== "anonymous") return <FullPageSpinner />;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" aria-hidden />
        <div className="absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-brand-600/40 blur-[110px]" aria-hidden />
        <div className="absolute -bottom-20 right-0 h-80 w-80 rounded-full bg-brand-500/20 blur-[110px]" aria-hidden />
        <Link href="/" className="relative w-fit">
          <Logo dark />
        </Link>
        <div className="relative">
          <h2 className="max-w-md font-display text-4xl font-bold leading-tight">
            Every courier.
            <br />
            <span className="bg-gradient-to-r from-white via-neutral-300 to-brand-400 bg-clip-text text-transparent">One place to ship.</span>
          </h2>
          <ul className="mt-10 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-neutral-200">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <p.icon className="h-4 w-4 text-brand-200" />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-neutral-400">India Post · Shadowfax · more couriers soon</p>
      </aside>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-up">
          <Link href="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-3xl font-bold text-neutral-900">{title}</h1>
          <p className="mt-2 text-neutral-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
