"use client";

import anime from "animejs";
import {
  ArrowRight,
  BadgeIndianRupee,
  Bell,
  Building2,
  CheckCircle2,
  FileStack,
  Menu,
  MousePointerClick,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Truck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LinkButton, Logo, cx } from "@/components/ui";
import { useAuth } from "@/lib/auth";

const FEATURES = [
  { icon: BadgeIndianRupee, title: "Compare prices by pincode", text: "India Post and Shadowfax side by side for every recipient, with the best value marked.", wide: true },
  { icon: MousePointerClick, title: "Book a batch in one click", text: "Anyone one courier can't reach goes to the next best automatically." },
  { icon: Bell, title: "Every status, live", text: "Courier updates arrive as they happen, with a regular check as backup." },
  { icon: RotateCcw, title: "Damage returns built in", text: "Report damage with photos. The same courier collects it and the return is tracked with the original.", wide: true },
  { icon: FileStack, title: "All labels in one PDF", text: "Every label for a batch, ready to print." },
  { icon: ShieldCheck, title: "Right access for each role", text: "Admins run everything; doctors and executives see only their packages." },
];

const STEPS = [
  { icon: Building2, title: "Pick the lab", text: "Search a saved lab or add a new one." },
  { icon: Users, title: "Tick the recipients", text: "Filter by state and city, then select dentists and executives." },
  { icon: BadgeIndianRupee, title: "Compare couriers", text: "Every courier prices every recipient." },
  { icon: PackageCheck, title: "Book and track", text: "One click books them all. Follow each one to the door." },
];

const ROLES = [
  { icon: UserCog, name: "Admin", text: "Manages labs, dentists and executives, compares prices, books and cancels, and sees every package." },
  { icon: Stethoscope, name: "Doctor", text: "Signs up with their registered number, tracks packages sent to them and reports damage." },
  { icon: Users, name: "Executive", text: "Their own packages, live status and returns, just like doctors." },
];

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#roles", label: "Who it's for" },
];

export default function Landing() {
  const { status } = useAuth();
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const signedIn = status === "authenticated";
  const primaryHref = signedIn ? "/dashboard" : "/login";

  useEffect(() => {
    if (!root.current) return;
    const q = (s: string) => root.current!.querySelectorAll(s);
    // Without motion, show everything at once.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      q(".hero-in, .preview, .quote-row, .best-pill, .reveal").forEach((el) => ((el as HTMLElement).style.opacity = "1"));
      q(".count").forEach((el) => (el.textContent = `₹${(el as HTMLElement).dataset.value}`));
      return;
    }

    anime
      .timeline({ easing: "easeOutCubic" })
      .add({ targets: q(".hero-in"), opacity: [0, 1], translateY: [16, 0], delay: anime.stagger(80), duration: 650 })
      .add({ targets: q(".preview"), opacity: [0, 1], translateY: [28, 0], scale: [0.97, 1], duration: 750 }, "-=450")
      .add({ targets: q(".quote-row"), opacity: [0, 1], translateX: [-12, 0], delay: anime.stagger(110), duration: 450 }, "-=300")
      .add({ targets: q(".best-pill"), scale: [0.6, 1], opacity: [0, 1], duration: 400, easing: "easeOutBack" }, "-=150");

    // Prices count up once the preview appears.
    q(".count").forEach((el) => {
      const obj = { v: 0 };
      anime({
        targets: obj,
        v: Number((el as HTMLElement).dataset.value),
        round: 1,
        delay: 1000,
        duration: 1100,
        easing: "easeOutExpo",
        update: () => (el.textContent = `₹${obj.v}`),
      });
    });

    // A parcel travels from lab to clinic, again and again.
    const path = root.current.querySelector<SVGPathElement>("#route");
    const trip = path
      ? anime({
          targets: q(".parcel"),
          translateX: anime.path(path)("x"),
          translateY: anime.path(path)("y"),
          easing: "easeInOutSine",
          duration: 3400,
          loop: true,
          delay: 1300,
        })
      : null;
    const dash = anime({ targets: q(".route-line"), strokeDashoffset: [anime.setDashoffset, 0], duration: 1300, delay: 850, easing: "easeInOutQuad" });

    // Sections below the fold animate once as they scroll into view.
    const seen = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          seen.unobserve(entry.target);
          anime({ targets: entry.target.querySelectorAll(".reveal"), opacity: [0, 1], translateY: [22, 0], delay: anime.stagger(70), duration: 600, easing: "easeOutCubic" });
        }),
      { threshold: 0.12 },
    );
    q("[data-reveal]").forEach((el) => seen.observe(el));

    return () => {
      trip?.pause();
      dash.pause();
      seen.disconnect();
    };
  }, []);

  return (
    <div ref={root} className="bg-white">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" aria-hidden />
        <div className="absolute left-1/2 top-[-18rem] h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[140px]" aria-hidden />

        <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" aria-label="Courier Hub home">
            <Logo dark />
          </Link>
          <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm backdrop-blur md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="rounded-full px-4 py-1.5 text-neutral-300 transition-colors duration-100 hover:bg-white/10 hover:text-white">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <LinkButton href="/dashboard" size="sm">
                Dashboard <ArrowRight className="h-4 w-4" />
              </LinkButton>
            ) : (
              <>
                <LinkButton href="/login" variant="outline-light" size="sm" className="hidden sm:inline-flex">
                  Sign in
                </LinkButton>
                <LinkButton href="/signup" size="sm" className="hidden sm:inline-flex">
                  Create account
                </LinkButton>
              </>
            )}
            <button
              onClick={() => setMenu((m) => !m)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-300 hover:bg-white/10 hover:text-white md:hidden"
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
            >
              {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </header>

        {/* Phone menu */}
        {menu && (
          <div className="relative z-20 mx-4 mb-2 rounded-2xl border border-white/10 bg-neutral-900/95 p-2 shadow-pop backdrop-blur animate-fade-up md:hidden">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="block rounded-xl px-4 py-3 text-sm font-medium text-neutral-200 hover:bg-white/5">
                {n.label}
              </a>
            ))}
            {!signedIn && (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 p-2 pt-3">
                <LinkButton href="/login" variant="outline-light">Sign in</LinkButton>
                <LinkButton href="/signup">Create account</LinkButton>
              </div>
            )}
          </div>
        )}

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-32 lg:pt-16">
          <div>
            <span className="hero-in inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-neutral-300 opacity-0 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" /> Built for dental labs across India
            </span>
            <h1 className="hero-in mt-6 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight opacity-0 sm:text-6xl lg:text-[4.25rem]">
              Every courier.
              <br />
              <span className="bg-gradient-to-r from-white via-neutral-300 to-brand-400 bg-clip-text text-transparent">One place to ship.</span>
            </h1>
            <p className="hero-in mt-6 max-w-xl text-lg leading-relaxed text-neutral-400 opacity-0">
              Compare courier prices by pincode, book packages to many dentists and executives in a single click, and follow every status to the clinic door.
            </p>
            <div className="hero-in mt-9 flex flex-col gap-3 opacity-0 sm:flex-row">
              <LinkButton href={primaryHref} size="lg">
                {signedIn ? "Go to dashboard" : "Get started"} <ArrowRight className="h-4 w-4" />
              </LinkButton>
              <LinkButton href="#how" variant="outline-light" size="lg">
                See how it works
              </LinkButton>
            </div>
            <dl className="hero-in mt-12 grid max-w-lg grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-8 opacity-0">
              {[
                ["2", "couriers connected"],
                ["19,300", "pincodes ready"],
                ["1 click", "books a batch"],
              ].map(([value, label], i) => (
                <div key={label} className={cx(i > 0 && "pl-5")}>
                  <dt className="font-display text-2xl font-bold text-white sm:text-3xl">{value}</dt>
                  <dd className="mt-1 text-xs text-neutral-500">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Live product preview */}
          <div className="preview relative opacity-0">
            <div className="absolute -inset-6 rounded-[32px] bg-brand-500/15 blur-3xl" aria-hidden />
            <div className="relative rounded-[28px] border border-white/10 bg-white/[0.04] p-3 shadow-pop backdrop-blur-xl">
              <div className="rounded-[20px] bg-white p-5 text-neutral-900 shadow-lift sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Compare couriers</p>
                    <p className="mt-1 font-display text-lg font-bold">Smile Lab → 3 clinics</p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">600 g parcel</span>
                </div>

                <svg viewBox="0 0 320 90" className="my-4 w-full" aria-hidden>
                  <path id="route" d="M20 60 C 90 5, 160 95, 300 30" fill="none" stroke="transparent" />
                  <path className="route-line" d="M20 60 C 90 5, 160 95, 300 30" fill="none" stroke="#d4d4d4" strokeWidth="2.5" strokeDasharray="6 6" strokeLinecap="round" />
                  <circle cx="20" cy="60" r="7" fill="#171717" />
                  <circle cx="300" cy="30" r="9" fill="#0d9488" opacity="0.2" />
                  <circle cx="300" cy="30" r="6" fill="#0d9488" />
                  <g className="parcel" transform="translate(20 60)">
                    <rect x="-9" y="-9" width="18" height="18" rx="4" fill="#0d9488" />
                    <path d="M-9 -2 H9 M0 -9 V9" stroke="white" strokeWidth="1.6" />
                  </g>
                </svg>

                <div className="space-y-2.5">
                  {[
                    { name: "India Post", note: "Reaches 2 of 3 · Speed Post", value: 142, best: false },
                    { name: "Shadowfax", note: "Reaches 3 of 3 · Regular", value: 157, best: true },
                  ].map((c) => (
                    <div
                      key={c.name}
                      className={cx(
                        "quote-row flex items-center justify-between rounded-2xl border p-3.5 opacity-0",
                        c.best ? "border-brand-500 bg-brand-50/50 shadow-glow" : "border-neutral-200",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={cx("flex h-9 w-9 items-center justify-center rounded-xl", c.best ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600")}>
                          <Truck className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{c.name}</p>
                          <p className="text-xs text-neutral-500">{c.note}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="count font-display text-lg font-bold" data-value={c.value}>₹0</p>
                        {c.best && <span className="best-pill inline-block rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white opacity-0">Reaches all</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-2xl bg-neutral-950 px-4 py-3.5 text-white">
                  <span className="text-sm text-neutral-400">3 packages ready</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                    Book all <ArrowRight className="h-4 w-4 text-brand-400" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Couriers strip ---------- */}
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-7 text-sm sm:px-8">
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Connected couriers</span>
          {["India Post", "Shadowfax"].map((c) => (
            <span key={c} className="flex items-center gap-2 font-semibold text-neutral-800">
              <Truck className="h-5 w-5 text-neutral-900" /> {c}
            </span>
          ))}
          <span className="text-neutral-400">+ more anytime</span>
        </div>
      </section>

      {/* ---------- Features (bento) ---------- */}
      <section id="features" data-reveal className="relative bg-canvas py-24">
        <div className="bg-dots absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
          <div className="reveal mx-auto max-w-2xl text-center opacity-0">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Features</p>
            <h2 className="mt-3 text-3xl font-bold text-neutral-950 sm:text-[2.6rem] sm:leading-tight">Everything from booking to the doorstep</h2>
            <p className="mt-4 text-lg text-neutral-500">No more switching between courier websites. One account, every courier, every package.</p>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={cx(
                  "reveal group card-hover rounded-3xl border border-neutral-200 bg-white p-7 opacity-0 shadow-card",
                  f.wide && "lg:col-span-2",
                )}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white shadow-lift transition-colors duration-200 group-hover:bg-brand-600">
                  <f.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-6 text-lg font-semibold text-neutral-950">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-neutral-500">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" data-reveal className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="reveal mx-auto max-w-2xl text-center opacity-0">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">How it works</p>
            <h2 className="mt-3 text-3xl font-bold text-neutral-950 sm:text-[2.6rem] sm:leading-tight">From lab to clinic in four steps</h2>
          </div>
          <ol className="relative mt-16 grid gap-10 sm:grid-cols-2 md:grid-cols-4 md:gap-6">
            <div className="absolute left-[12%] right-[12%] top-7 hidden border-t-2 border-dashed border-neutral-200 md:block" aria-hidden />
            {STEPS.map((s, i) => (
              <li key={s.title} className="reveal relative text-center opacity-0">
                <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-neutral-900 shadow-lift ring-1 ring-neutral-200">
                  <s.icon className="h-6 w-6" />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white ring-4 ring-white">{i + 1}</span>
                </span>
                <h3 className="mt-5 font-semibold text-neutral-950">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-[15rem] text-sm text-neutral-500">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Roles ---------- */}
      <section id="roles" data-reveal className="bg-canvas py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="reveal mx-auto max-w-2xl text-center opacity-0">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Who it&apos;s for</p>
            <h2 className="mt-3 text-3xl font-bold text-neutral-950 sm:text-[2.6rem] sm:leading-tight">The right view for every role</h2>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {ROLES.map((r, i) => (
              <div
                key={r.name}
                className={cx(
                  "reveal card-hover rounded-3xl border p-7 opacity-0",
                  i === 0 ? "border-neutral-900 bg-neutral-950 text-white shadow-pop" : "border-neutral-200 bg-white shadow-card",
                )}
              >
                <span className={cx("flex h-11 w-11 items-center justify-center rounded-xl", i === 0 ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-900")}>
                  <r.icon className="h-5 w-5" />
                </span>
                <h3 className={cx("mt-5 text-lg font-semibold", i === 0 ? "text-white" : "text-neutral-950")}>{r.name}</h3>
                <p className={cx("mt-2 leading-relaxed", i === 0 ? "text-neutral-400" : "text-neutral-500")}>{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Call to action ---------- */}
      <section className="bg-canvas px-5 pb-24 sm:px-8">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-ink px-6 py-16 text-center text-white shadow-pop sm:px-16">
          <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden />
          <div className="absolute left-1/2 top-0 h-64 w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/25 blur-[100px]" aria-hidden />
          <div className="relative">
            <h2 className="text-3xl font-bold sm:text-5xl">Ready to ship smarter?</h2>
            <p className="mx-auto mt-4 max-w-xl text-neutral-400">Doctors and executives can sign up with the phone number their lab registered.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <LinkButton href={primaryHref} size="lg">
                {signedIn ? "Open dashboard" : "Sign in"} <ArrowRight className="h-4 w-4" />
              </LinkButton>
              {!signedIn && (
                <LinkButton href="/signup" variant="outline-light" size="lg">
                  Create account
                </LinkButton>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-neutral-400">
              {["Live courier status", "Damage returns with photos", "Labels in one PDF"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-brand-400" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-neutral-500 sm:flex-row sm:px-8">
          <Logo />
          <span>Compare, book and track dental lab shipments.</span>
          <Link href="/login" className="font-semibold text-neutral-900 hover:text-brand-600">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
