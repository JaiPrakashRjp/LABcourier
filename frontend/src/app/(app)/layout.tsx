"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  Boxes,
  Building2,
  Check,
  ChevronDown,
  Factory,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Avatar, FullPageSpinner, Logo, cx } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { CATEGORY_LABELS, CategoryProvider, useCategory, type Category } from "@/lib/category";
import { HELPLINE_TEL, HELPLINE_TEXT } from "@/lib/support";
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
      { href: "/senders", label: "Senders", icon: Factory, admin: true },
    ],
  },
];

// Pages only admins may open; others are sent to the dashboard.
const ADMIN_ONLY = ["/packages/new", "/dentists", "/executives", "/labs", "/senders"];

const CATEGORY_ICONS: Record<Category, React.ElementType> = { DENTAL: Stethoscope, ASSET: Boxes };

/** Shipping type (admins): Dental Lab Work or Assets. Packages and New package follow it. */
function CategorySwitch({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: (href: string) => void }) {
  const { category, setCategory } = useCategory();
  const router = useRouter();
  const pathname = usePathname();
  const change = (next: Category) => {
    if (next === category) return;
    setCategory(next);
    // Leave a page that belongs to the other type.
    const target = pathname.startsWith("/packages/new") ? "/packages/new" : /^\/packages\/\d+/.test(pathname) ? "/packages" : null;
    if (target) {
      onNavigate(target);
      router.push(target);
    }
  };
  const CurrentIcon = CATEGORY_ICONS[category];
  if (collapsed) {
    const Icon = CurrentIcon;
    return (
      <button
        type="button"
        onClick={() => change(category === "ASSET" ? "DENTAL" : "ASSET")}
        title={`Showing ${CATEGORY_LABELS[category]}. Click to switch.`}
        aria-label={`Showing ${CATEGORY_LABELS[category]}. Switch shipping type`}
        className="mb-1 flex min-h-[40px] w-full items-center justify-center rounded-xl bg-white/5 text-brand-300 ring-1 ring-white/10 hover:bg-white/10"
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>
    );
  }
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Shipping type"
        className="group mb-2 flex h-11 w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-left text-sm font-semibold text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-500/40 data-[state=open]:bg-white/10"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600/20 text-brand-300">
          <CurrentIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">{CATEGORY_LABELS[category]}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-150 group-data-[state=open]:rotate-180" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border border-white/10 bg-neutral-900 p-1.5 text-neutral-300 shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => {
            const Icon = CATEGORY_ICONS[c];
            const selected = c === category;
            return (
              <Menu.Item
                key={c}
                onSelect={() => change(c)}
                className={cx(
                  "flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors data-[highlighted]:bg-white/10 data-[highlighted]:text-white",
                  selected && "text-white",
                )}
              >
                <Icon className={cx("h-4 w-4", selected ? "text-brand-400" : "text-neutral-500")} />
                <span className="flex-1">{CATEGORY_LABELS[c]}</span>
                {selected && <Check className="h-4 w-4 text-brand-400" />}
              </Menu.Item>
            );
          })}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

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
              {group.section === "Shipping" && isAdmin && <CategorySwitch collapsed={collapsed} onNavigate={onNavigate} />}
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

        {/* Courier helpline: opens the phone's dialer. */}
        <div>
          {collapsed ? (
            <div className="mx-3 mb-4 h-px bg-white/10" aria-hidden />
          ) : (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Help</p>
          )}
          <a
            href={`tel:${HELPLINE_TEL}`}
            title={collapsed ? `Courier helpline · ${HELPLINE_TEXT}` : undefined}
            className={cx(
              "group flex min-h-[44px] touch-manipulation items-center gap-3 rounded-xl text-sm font-medium text-neutral-400 transition-colors duration-100 hover:bg-white/5 hover:text-white active:bg-white/10",
              collapsed ? "justify-center px-0" : "px-3",
            )}
          >
            <PhoneCall className="h-[18px] w-[18px] text-neutral-500 group-hover:text-brand-400" />
            <span className={collapsed ? "sr-only" : "min-w-0"}>
              <span className="block">Courier helpline</span>
              <span className="block text-xs text-neutral-500">{HELPLINE_TEXT}</span>
            </span>
          </a>
        </div>
      </nav>
      <UserFooter collapsed={collapsed} />
    </div>
  );
}

/** Who is signed in, and Log out, at the bottom of the side menu. */
function UserFooter({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  const logoutButton = (
    <button
      type="button"
      onClick={() => void logout()}
      title="Log out"
      aria-label="Log out"
      className="flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 active:bg-rose-500/20"
    >
      <LogOut className="h-[18px] w-[18px]" />
    </button>
  );
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 border-t border-white/10 py-3" title={`${user.name} · ${user.company_name}`}>
        <Avatar name={user.name} />
        {logoutButton}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 border-t border-white/10 px-3 py-3">
      <Avatar name={user.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-white">{user.name}</p>
        <p className="truncate text-xs text-neutral-500" title={`${user.company_name} · ${user.role_name}`}>
          {user.company_name} · {user.role_name}
        </p>
      </div>
      {logoutButton}
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
  const { status, user } = useAuth();
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

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-neutral-200/80 bg-white/80 px-3 backdrop-blur-xl backdrop-saturate-150 sm:px-8 lg:hidden">
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
        </div>

      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-8 sm:pt-8">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <CategoryProvider>
        <Shell>{children}</Shell>
      </CategoryProvider>
    </Suspense>
  );
}
