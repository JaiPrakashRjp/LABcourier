"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, onSessionChange, refreshSession, setSession } from "./api";
import type { RoleId, Session, User } from "./types";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (phone: string, password: string, roleId: RoleId) => Promise<void>;
  signup: (name: string, phone: string, password: string, roleId: RoleId) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const CHANNEL = "courier-hub-auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const endTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // When the current session ends (24 hours after sign-in), in ms since 1970.
  const sessionEnd = useRef<number | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  const apply = useCallback((session: Session | null) => {
    clearTimeout(timer.current);
    clearTimeout(endTimer.current);
    if (!session && sessionEnd.current && Date.now() >= sessionEnd.current - 5000) {
      toast.info("You were signed out because sessions last 24 hours. Please sign in again.", { id: "session-ended" });
    }
    sessionEnd.current = session ? Date.parse(session.session_expires_at) : null;
    setSession(session);
    setUser(session?.user ?? null);
    setStatus(session ? "authenticated" : "anonymous");
    if (session) {
      const untilEnd = sessionEnd.current! - Date.now();
      // Renew a minute before the access token expires, so users never hit an expired token.
      const renewIn = Math.max(30, session.expires_in - 60) * 1000;
      if (renewIn < untilEnd) timer.current = setTimeout(() => void refreshSession(), renewIn);
      // When the session ends, even with the page left open, the server refuses to renew it, which signs the user out.
      endTimer.current = setTimeout(() => void refreshSession(), Math.max(untilEnd, 0) + 1000);
    }
  }, []);

  useEffect(() => {
    onSessionChange(apply);
    // Restore the session from the refresh cookie on every page load.
    void refreshSession();

    channel.current = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
    channel.current?.addEventListener("message", (e: MessageEvent) => {
      if (e.data === "logout") apply(null);
      if (e.data === "login") void refreshSession();
    });

    // A tab woken from sleep may hold an expired token; refresh when it becomes visible.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer.current);
      clearTimeout(endTimer.current);
      channel.current?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [apply]);

  const login = useCallback(
    async (phone: string, password: string, roleId: RoleId) => {
      const session = await api<Session>("/auth/login", { body: { phone, password, role_id: roleId } });
      apply(session);
      channel.current?.postMessage("login");
    },
    [apply],
  );

  const signup = useCallback(
    async (name: string, phone: string, password: string, roleId: RoleId) => {
      const session = await api<Session>("/auth/signup", { body: { name, phone, password, role_id: roleId } });
      apply(session);
      channel.current?.postMessage("login");
    },
    [apply],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      apply(null);
      channel.current?.postMessage("logout");
    }
  }, [apply]);

  return <AuthContext.Provider value={{ status, user, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
