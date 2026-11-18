import type { Session } from "./types";

/*
 * Session model
 * - The access token lives only in memory (never localStorage), so scripts on the page can't steal it from storage.
 * - The refresh token is an httpOnly cookie set by the backend. On every page load, refreshSession()
 *   trades it for a new access token, which is why a browser refresh keeps the user signed in.
 * - A 401 from any call triggers one refresh and a retry. Refreshes are serialised across tabs with
 *   the Web Locks API, so two tabs never rotate the same refresh token at once.
 */

let accessToken: string | null = null;

/** Saved GET results for this tab (see useApi). Any change, sign-in or sign-out empties it. */
export const responseCache = new Map<string, unknown>();
let sessionListener: ((session: Session | null) => void) | null = null;
let inFlight: Promise<Session | null> | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export function setSession(session: Session | null) {
  // A different user (or none) must never see the previous user's saved results.
  if (!session || session.user.id !== currentUserId) responseCache.clear();
  currentUserId = session?.user.id ?? null;
  accessToken = session?.access_token ?? null;
}

let currentUserId: number | null = null;

export function onSessionChange(listener: (session: Session | null) => void) {
  sessionListener = listener;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks.request("courier-hub-refresh", fn) as Promise<T>;
  }
  return fn();
}

export function refreshSession(): Promise<Session | null> {
  if (!inFlight) {
    inFlight = withLock(async () => {
      const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
      if (!res.ok) return null;
      return (await res.json()) as Session;
    })
      .catch(() => null)
      .then((session) => {
        setSession(session);
        sessionListener?.(session);
        return session;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  query?: Query;
  raw?: boolean;
}

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  try {
    return await fetch(`/api/v1${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      credentials: "same-origin",
    });
  } catch {
    // fetch only throws when the request never reached the server.
    throw new ApiError(
      0,
      typeof navigator !== "undefined" && !navigator.onLine
        ? "You're offline. Check your internet connection and try again."
        : "Can't reach the server right now. Please check your connection and try again.",
      [],
    );
  }
}

/** Plain-English fallbacks for when the server doesn't send its own message. */
const STATUS_MESSAGES: Record<number, string> = {
  400: "Something in the request isn't right. Please check and try again.",
  401: "Your session has ended. Please sign in again.",
  403: "You don't have permission to do this.",
  404: "We couldn't find what you were looking for.",
  408: "The server took too long to answer. Please try again.",
  409: "This conflicts with existing data. Please refresh and try again.",
  413: "The upload is too large.",
  422: "Please check the highlighted fields.",
  429: "Too many attempts. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again in a minute.",
  502: "The server is restarting or busy. Please try again in a minute.",
  503: "The server is temporarily unavailable. Please try again in a minute.",
  504: "The server took too long to answer. Please try again.",
};

export function statusMessage(status: number): string {
  return STATUS_MESSAGES[status] ?? (status >= 500 ? STATUS_MESSAGES[500] : "Something went wrong. Please try again.");
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const changesData = (opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET")) !== "GET";
  if (changesData) responseCache.clear();
  let res = await send(path, opts);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const session = await refreshSession();
    if (session) res = await send(path, opts);
  }
  if (!res.ok) {
    let message = statusMessage(res.status);
    let fields: { field: string; message: string }[] = [];
    try {
      const data = await res.json();
      if (typeof data.detail === "string" && data.detail.trim()) message = data.detail;
      fields = data.errors ?? [];
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message, fields);
  }
  if (opts.raw) return res as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Download a protected file (labels, photos) using the in-memory token. */
export async function openFile(path: string, filename?: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } else {
    window.open(url, "_blank");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  // Browser errors (e.g. "Failed to fetch") are technical; show a plain sentence instead.
  if (err instanceof Error && err.message && !/fetch|network|load failed|undefined|null|JSON/i.test(err.message)) return err.message;
  return "Something went wrong. Please try again.";
}
