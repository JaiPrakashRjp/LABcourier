"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, buildQuery, errorMessage, responseCache as cache, type RequestOptions } from "./api";

/*
 * Results are kept for this tab, keyed by URL. Opening a page you've seen before shows the saved data
 * at once and quietly refreshes it, so menu clicks feel instant instead of waiting on the network.
 */
const inFlight = new Map<string, Promise<unknown>>();

function fetchOnce<T>(key: string, path: string, query?: RequestOptions["query"]): Promise<T> {
  let p = inFlight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = api<T>(path, { query }).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  return p;
}

/** Loads a GET endpoint and reloads when the path or query changes. Pass null to skip. */
export function useApi<T>(path: string | null, query?: RequestOptions["query"]) {
  const key = path ? path + buildQuery(query) : null;
  const [data, setData] = useState<T | null>(() => (key && cache.has(key) ? (cache.get(key) as T) : null));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!key && !cache.has(key));
  const latest = useRef(key);

  const load = useCallback(async () => {
    if (!path || !key) return;
    latest.current = key;
    if (cache.has(key)) setData(cache.get(key) as T);
    setLoading(true);
    setError("");
    try {
      const result = await fetchOnce<T>(key, path, query);
      cache.set(key, result);
      if (latest.current === key) setData(result);
    } catch (err) {
      if (latest.current === key) setError(errorMessage(err));
    } finally {
      if (latest.current === key) setLoading(false);
    }
    // key captures path and query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    (value: T) => {
      if (key) cache.set(key, value);
      setData(value);
    },
    [key],
  );

  return { data, error, loading, reload: load, setData: update };
}
