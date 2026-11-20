"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Avatar, FullPageSpinner, LinkButton, Logo, cx } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ROLES } from "@/lib/types";

const NAV = [
  { section: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, admin: false }] },
  {
    section: "Shipping",
    items: [
      { href: "/packages", label: "Packages", icon: Package, admin: false },
      { href: "/packages/new", label: "New package", icon: PackagePlus, admin: true },
    ],
  },
  {
    section: "Directory",
    items: [
      { href: "/dentists", label: "Dentists", icon: Stethoscope, admin: true },
      { href: "/executives", label: "Executives", icon: Users, admin: true },
      { href: "/labs", label: "Labs", icon: Building2, admin: true },
    ],
  },
];

// Pages only admins may open; others are sent to the dashboard.
const ADMIN_ONLY = ["/packages/new", "/dentists", "/executives", "/labs"];

function isActive(pathname: string, href: string) {
  if (href === "/packages") return pathname === "/packages" || /^\/packages\/\d+/.test(pathname);
  return pathname.startsWith(href);
}

const SIDEBAR_KEY = "courier-hub:sidebar-collapsed";

function Sidebar({
  isAdmin,
  current,
  onNavigate,
  collapsed = false,
  onToggle,
}: {
  isAdmin: boolean;
  current: string;
  onNavigate: (href: string) => void;
  /** Icons only (desktop). The phone drawer is always expanded. */
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-ink text-neutral-300">
      <div className={cx("flex py-6", collapsed ? "flex-col items-center gap-3 px-2" : "items-center justify-between gap-2 pl-5 pr-3")}>
        <Link href="/dashboard" onClick={() => onNavigate("/dashboard")} title="Dashboard">
          <Logo dark compact={collapsed} />
        </Link>
        {onToggle && (
          <button
            onClick={onToggle}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>
      <nav className={cx("flex-1 overflow-y-auto pb-6", collapsed ? "space-y-4 px-2" : "space-y-7 px-3")}>
        {NAV.map((group, gi) => {
          const items = group.items.filter((i) => isAdmin || !i.admin);
          if (!items.length) return null;
          return (
            <div key={group.section}>
              {collapsed ? (
                gi > 0 && <div className="mx-3 mb-4 h-px bg-white/10" aria-hidden />
              ) : (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{group.section}</p>
              )}
              <ul className="space-y-1">
                {items.map((item) => {
                  const active = isActive(current, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        prefetch
                        onClick={() => onNavigate(item.href)}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cx(
                          "group relative flex min-h-[44px] touch-manipulation items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-100",
                          collapsed ? "justify-center px-0" : "px-3",
                          active ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white active:bg-white/10",
                        )}
                      >
                        {/* Teal bar marks the current page. */}
                        <span
                          className={cx(
                            "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400 transition-opacity duration-100",
                            active ? "opacity-100" : "opacity-0",
                          )}
                          aria-hidden
                        />
                        <item.icon className={cx("h-[18px] w-[18px] transition-colors duration-100", active ? "text-brand-400" : "text-neutral-500 group-hover:text-neutral-300")} />
                        <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      {isAdmin &&
        (collapsed ? (
          <div className="flex justify-center px-2 pb-3">
            <LinkButton href="/packages/new" size="sm" className="h-10 w-10 px-0" aria-label="New package">
              <PackagePlus className="h-4 w-4" />
            </LinkButton>
          </div>
        ) : (
          <div className="m-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-semibold text-white">Ship to many at once</p>
            <p className="mt-1 text-xs text-neutral-400">Send to many dentists and book them all in one click.</p>
            <LinkButton href="/packages/new" size="sm" className="mt-3 w-full">
              <PackagePlus className="h-4 w-4" /> New package
            </LinkButton>
          </div>
        ))}
    </div>
  );
}

/** Thin teal bar at the top while the next page loads, so every click shows it was received. */
function NavProgress({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-0.5" role="progressbar" aria-label="Loading page">
      <div className="h-full animate-nav-progress bg-brand-500 shadow-[0_0_8px_rgb(20_184_166/0.7)]" />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // The page the user just clicked; it lights up before the page has loaded.
  const [pending, setPending] = useState<string | null>(null);
  const isAdmin = user?.role_id === ROLES.ADMIN;
  const blocked = !!user && !isAdmin && ADMIN_ONLY.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (status === "anonymous") {
      // Remember the exact page, so signing in returns here.
      const here = pathname + (search ? `?${search}` : "");
      router.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [status, pathname, search, router]);

  useEffect(() => {
    if (blocked) router.replace("/dashboard");
  }, [blocked, router]);

  // Remember whether the desktop menu was collapsed (only for this browser).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* storage blocked: start expanded */
    }
  }, []);
  const toggleSidebar = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {
        /* not saved; still works for this visit */
      }
      return !c;
    });

  useEffect(() => {
    setDrawer(false);
    setPending(null);
  }, [pathname]);

  // If a page never finishes loading, stop showing it as pending.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 8000);
    return () => clearTimeout(t);
  }, [pending]);

  const navigate = (href: string) => {
    setDrawer(false);
    setPending(href === pathname ? null : href);
  };

  if (status !== "authenticated" || !user || blocked) return <FullPageSpinner />;

  const current = pending ?? pathname;

  return (
    <div
      className="min-h-screen transition-[padding] duration-200 lg:pl-[var(--sidebar-w)]"
      style={{ "--sidebar-w": collapsed ? "4.5rem" : "16rem" } as React.CSSProperties}
    >
      <NavProgress active={!!pending} />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] border-r border-black transition-[width] duration-200 lg:block">
        <Sidebar isAdmin={isAdmin} current={current} onNavigate={navigate} collapsed={collapsed} onToggle={toggleSidebar} />
      </aside>

      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] shadow-pop duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden">
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Dialog.Description className="sr-only">Main navigation</Dialog.Description>
            <Sidebar isAdmin={isAdmin} current={current} onNavigate={navigate} />
            <Dialog.Close className="absolute right-3 top-6 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Close menu">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-neutral-200/80 bg-white/80 px-3 backdrop-blur-xl backdrop-saturate-150 sm:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <button
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="min-w-0 lg:hidden">
            <Logo />
          </span>
          <span className="hidden truncate text-sm font-medium text-neutral-500 sm:inline">{user.company_name}</span>
        </div>

        <Menu.Root>
          <Menu.Trigger className="flex touch-manipulation items-center gap-3 rounded-xl py-1.5 pl-1.5 pr-2 transition-colors duration-100 hover:bg-neutral-100 data-[state=open]:bg-neutral-100 sm:pr-3">
            <Avatar name={user.name} />
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-semibold leading-tight text-neutral-900">{user.name}</span>
              <span className="block text-xs text-neutral-500">{user.role_name}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="end"
              sideOffset={8}
              className="z-50 w-64 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
            >
              <div className="flex items-center gap-3 px-3 py-3">
                <Avatar name={user.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-900">{user.name}</p>
                  <p className="truncate text-xs text-neutral-500">+91 {user.phone} · {user.role_name}</p>
                </div>
              </div>
              <Menu.Separator className="my-1 h-px bg-neutral-100" />
              <Menu.Item
                onSelect={() => void logout()}
                className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-medium text-rose-600 outline-none data-[highlighted]:bg-rose-50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-8 sm:pt-8">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
