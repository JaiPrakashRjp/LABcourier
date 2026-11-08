"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { clsx, type ClassValue } from "clsx";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Info, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { STATUS_LABELS, STATUS_TONE } from "@/lib/format";

export function cx(...classes: ClassValue[]) {
  return twMerge(clsx(classes));
}

/* ---------- Brand ---------- */

export function Logo({ dark, compact }: { dark?: boolean; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-glow ring-1 ring-white/10">
        {/* Tooth mark */}
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 3C4.8 3 3 4.8 3 7.5c0 2.3.9 3.9 1.6 5.6.6 1.5.9 3.4 1.2 5.4.2 1.4.8 2.5 1.8 2.5 1.2 0 1.6-1.4 1.9-3 .3-1.6.6-3 1.5-3s1.2 1.4 1.5 3c.3 1.6.7 3 1.9 3 1 0 1.6-1.1 1.8-2.5.3-2 .6-3.9 1.2-5.4.7-1.7 1.6-3.3 1.6-5.6C21 4.8 19.2 3 17 3c-1.9 0-3 1-5 1S8.9 3 7 3Z" />
        </svg>
      </span>
      {!compact && (
        <span className={cx("font-display text-lg font-bold tracking-tight", dark ? "text-white" : "text-neutral-900")}>
          Courier<span className={dark ? "text-brand-300" : "text-brand-600"}>Hub</span>
        </span>
      )}
    </span>
  );
}

/* ---------- Buttons ---------- */

type Variant = "primary" | "dark" | "secondary" | "danger" | "ghost" | "outline-light";
type Size = "sm" | "md" | "lg";

// touch-manipulation removes the mobile tap delay; short transitions make presses feel instant.
const BUTTON_BASE =
  "relative inline-flex touch-manipulation select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,border-color,box-shadow,transform,color] duration-100 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:pointer-events-none disabled:opacity-50";
const BUTTON_VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.1),0_4px_12px_-2px_rgb(13_148_136/0.45)] hover:bg-brand-700 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_2px_4px_rgb(0_0_0/0.1),0_8px_20px_-4px_rgb(13_148_136/0.55)]",
  dark: "bg-neutral-900 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_4px_12px_-2px_rgb(0_0_0/0.35)] hover:bg-black",
  secondary:
    "border border-neutral-200 bg-white text-neutral-800 shadow-[0_1px_2px_rgb(0_0_0/0.05)] hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-[0_2px_6px_rgb(0_0_0/0.06)]",
  danger: "bg-rose-600 text-white shadow-[0_4px_12px_-2px_rgb(225_29_72/0.4)] hover:bg-rose-700",
  ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200",
  "outline-light": "border border-white/20 bg-white/5 text-white backdrop-blur hover:border-white/30 hover:bg-white/10",
};
// At least 40px tall (44px large) so buttons are easy to tap.
const BUTTON_SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], loading && "cursor-wait", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {/* The label stays in place while loading, so the button doesn't change size. */}
      <span className={cx("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        </span>
      )}
    </button>
  );
}

/** A link that looks like a button. */
export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}>
      {children}
    </Link>
  );
}

/* ---------- Loading ---------- */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-7 w-7 animate-spin text-brand-600", className)} role="status" aria-label="Loading" />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton h-4", className)} aria-hidden />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card className="space-y-4 p-6">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </Card>
  );
}

/* ---------- Forms ---------- */

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-neutral-500">{hint}</span>}
      {error && (
        <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {error}
        </span>
      )}
    </label>
  );
}

// 16px text on phones stops iPhone Safari from zooming in when a box is tapped; 44px tall for easy tapping.
const inputClass =
  "h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-base text-neutral-900 sm:h-10 sm:text-sm shadow-sm shadow-neutral-900/[0.02] transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, className)} />;
}

/** Indian mobile number: +91 prefix, digits only, 10 long. */
export function PhoneInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex">
      <span className="inline-flex items-center rounded-l-xl border border-r-0 border-neutral-200 bg-neutral-50 px-3 text-sm font-medium text-neutral-500">+91</span>
      <input
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        {...props}
        className={cx(inputClass, "rounded-l-none")}
      />
    </div>
  );
}

export function PasswordInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={cx(inputClass, "pr-11", className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-400 transition hover:text-neutral-700"
        aria-label={shown ? "Hide password" : "Show password"}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        inputClass,
        "cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2364748b%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%2364748b%22 stroke-width=%221.6%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[length:18px] bg-[right_10px_center] bg-no-repeat pr-9",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, "h-auto py-2.5", className)} />;
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      {...props}
      className={cx("h-4 w-4 cursor-pointer rounded border-neutral-300 text-brand-600 accent-brand-600 focus:ring-brand-500", className)}
    />
  );
}

/* ---------- Layout ---------- */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-card", className)}>{children}</div>;
}

export function SectionTitle({ title, description, icon }: { title: string; description?: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900">{icon}</span>}
      <div>
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div>
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
    </div>
  );
}

/* ---------- Status ---------- */

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? { badge: "bg-neutral-100 text-neutral-700 ring-neutral-200", dot: "bg-neutral-400" };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        tone.badge,
        className,
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700", className)}>
      {children}
    </span>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: React.ReactNode }) {
  const styles = {
    error: { box: "border-rose-200 bg-rose-50 text-rose-800", icon: <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" /> },
    info: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: <Info className="h-4 w-4 shrink-0 text-brand-600" /> },
    success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> },
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm", styles.box)}>
      <span className="mt-0.5">{styles.icon}</span>
      <div>{children}</div>
    </div>
  );
}

/* ---------- Overlays ---------- */

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-neutral-950/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cx(
            "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            wide ? "max-w-3xl" : "max-w-lg",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-6 py-5">
            <div>
              <Dialog.Title className="font-display text-lg font-bold text-neutral-900">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-neutral-500">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="px-6 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- Lists ---------- */

export function Pagination({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-neutral-500">
      <span>
        Showing <strong className="text-neutral-800">{offset + 1}</strong>–<strong className="text-neutral-800">{Math.min(offset + limit, total)}</strong> of{" "}
        <strong className="text-neutral-800">{total}</strong>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(offset - limit)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-3 font-medium text-neutral-700">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(offset + limit)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center">
      {icon && <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-900">{icon}</span>}
      <p className="font-display text-base font-semibold text-neutral-900">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm text-neutral-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Shared look for data tables. */
export const table = {
  wrap: "overflow-x-auto rounded-2xl border border-neutral-200/80 bg-white shadow-card",
  table: "w-full text-sm",
  head: "border-b border-neutral-100 bg-neutral-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500",
  th: "px-5 py-3.5",
  row: "border-b border-neutral-100 transition-colors duration-100 last:border-0 hover:bg-neutral-50",
  td: "px-5 py-4 align-middle",
};

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter((p) => p && !/^dr\.?$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  // A stable colour per name, so the same person always looks the same.
  const hues = ["bg-brand-100 text-brand-700", "bg-violet-100 text-violet-700", "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-700"];
  const hue = hues[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % hues.length];
  return (
    <span className={cx("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold", hue, className)} aria-hidden>
      {initials || "?"}
    </span>
  );
}
