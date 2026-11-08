"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Page state (filters, tabs, wizard step) kept in the URL, so a browser refresh,
 * back button or shared link lands on exactly the same view.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const values = useMemo(() => {
    const out: Record<string, string> = {};
    params.forEach((v, k) => {
      if (!(k in out)) out[k] = v;
    });
    return out;
  }, [params]);

  const getAll = useCallback((key: string) => params.getAll(key), [params]);

  const update = useCallback(
    (changes: Record<string, string | string[] | number | null | undefined>, opts: { push?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        next.delete(key);
        if (value === null || value === undefined || value === "") continue;
        if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
        else next.set(key, String(value));
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (opts.push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router],
  );

  return { values, getAll, update };
}
