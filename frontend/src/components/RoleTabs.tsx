"use client";

import { Stethoscope, UserCog, Users } from "lucide-react";
import { ROLES, type RoleId } from "@/lib/types";
import { cx } from "./ui";

const ALL = [
  { id: ROLES.DOCTOR, label: "Doctor", icon: Stethoscope },
  { id: ROLES.EXECUTIVE, label: "Executive", icon: Users },
  { id: ROLES.ADMIN, label: "Admin", icon: UserCog },
] as const;

export function RoleTabs({
  value,
  onChange,
  includeAdmin = true,
  label = "Sign in as",
}: {
  value: RoleId;
  onChange: (role: RoleId) => void;
  includeAdmin?: boolean;
  label?: string;
}) {
  const roles = includeAdmin ? ALL : ALL.filter((r) => r.id !== ROLES.ADMIN);
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-neutral-700">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${roles.length}, minmax(0, 1fr))` }} role="radiogroup">
        {roles.map((r) => {
          const active = value === r.id;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(r.id)}
              className={cx(
                "flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition",
                active
                  ? "border-brand-600 bg-brand-50 text-brand-700 shadow-glow"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50",
              )}
            >
              <r.icon className={cx("h-5 w-5", active ? "text-brand-600" : "text-neutral-400")} />
              {r.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
