"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface DeliveryAnswer {
  deliverable: boolean;
  message: string | null;
}

// Answers are kept for the session so lists don't ask again for every pincode they show.
const answers = new Map<string, DeliveryAnswer>();
const pending = new Map<string, Promise<DeliveryAnswer | null>>();

function lookup(pincode: string): Promise<DeliveryAnswer | null> {
  const known = answers.get(pincode);
  if (known) return Promise.resolve(known);
  let request = pending.get(pincode);
  if (!request) {
    request = api<DeliveryAnswer>(`/locations/pincodes/${pincode}/delivery`)
      .then((a) => {
        answers.set(pincode, a);
        return a;
      })
      // A failed check must not block anyone: the booking itself is the final word.
      .catch(() => null)
      .finally(() => pending.delete(pincode));
    pending.set(pincode, request);
  }
  return request;
}

/** For each 6-digit pincode given, the reason delivery isn't available there. Pincodes that are fine are left out. */
export function useUndeliverable(pincodes: string[]): Record<string, string> {
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  const key = [...new Set(pincodes.filter((p) => /^\d{6}$/.test(p)))].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const wanted = key ? key.split(",") : [];
    Promise.all(wanted.map(async (p) => [p, await lookup(p)] as const)).then((rows) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [p, a] of rows) if (a && !a.deliverable) next[p] = a.message || `Delivery isn't available to pincode ${p} yet`;
      setBlocked(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return blocked;
}
