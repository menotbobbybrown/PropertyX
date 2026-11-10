"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LayoutDashboard, LogOut, Menu, Settings, Shield, User, X, HousePlus, Sparkles } from "lucide-react";
import { NAV } from "./nav-data";
import { api } from "@/lib/client";
import { Logo } from "./logo";
import { LanguageToggle, useT } from "./i18n";

export function DesktopNav() {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const path = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setOpen(null), [path]);
  return (
    <nav className="ms-2 hidden items-center lg:flex xl:ms-4 shrink min-w-0" aria-label="Main">
      {NAV.map((item, i) => {
        const active = path === item.href || path.startsWith(item.href + "/");
        const hiddenOnLg =
          i >= 8
            ? "hidden min-[1800px]:block"
            : i >= 7
              ? "hidden 2xl:block"
              : i >= 5
                ? "hidden xl:block"
                : "";
        return (
          <div
            key={item.label}
            className={`relative shrink-0 ${hiddenOnLg}`}
            onMouseEnter={() => {
              if (timer.current) clearTimeout(timer.current);
              setOpen(item.label);
            }}
            onMouseLeave={() => {
              timer.current = setTimeout(() => setOpen(null), 120);
            }}
          >
            <Link
              href={item.href}
              className={`flex items-center gap-0.5 rounded-lg px-1.5 py-2 text-[12px] xl:px-2 xl:text-[13px] font-semibold uppercase tracking-wide transition ${active ? "text-brand-700" : "text-slate-700 hover:text-brand-700"}`}
              onFocus={() => setOpen(item.label)}
            >
              {t(item.label)}
              {item.columns && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
            </Link>
            {item.columns && open === item.label && (
              <div className="absolute start-0 top-full z-50 pt-2">
                <div className="flex gap-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-lift)]">
                  {item.columns.map((col) => (
                    <div key={col.title} className="min-w-[180px]">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{t(col.title)}</p>
                      <ul className="space-y-1">
                        {col.links.map((l) => (
                          <li key={l.href}>
                            <Link href={l.href} className="block rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-800">
                              {t(l.label)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {[
        { cls: "xl:hidden", from: 5 },
        { cls: "hidden xl:block 2xl:hidden", from: 7 },
        { cls: "hidden 2xl:block min-[1800px]:hidden", from: 8 },
      ].map((m) => (
        <div key={m.from} className={`relative shrink-0 ${m.cls}`} onMouseEnter={() => setOpen(`more${m.from}`)} onMouseLeave={() => setOpen(null)}>
          <button className="flex items-center gap-0.5 rounded-lg px-2 py-2 text-[12px] xl:px-2.5 xl:text-[13px] font-semibold uppercase tracking-wide text-slate-700 hover:text-brand-700">
            {t("More")} <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
          {open === `more${m.from}` && (
            <div className="absolute end-0 top-full z-50 pt-2">
              <div className="w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-[var(--shadow-lift)]">
                {NAV.slice(m.from).map((n) => (
                  <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-brand-50">
                    {t(n.label)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

export function MobileMenu({ user }: { user: { name: string } | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);
  return (
    <>
      <button className="btn-ghost -ms-2 px-2 lg:hidden" onClick={() => setOpen(true)} aria-label={t("Open menu")}>
        <Menu className="h-6 w-6" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <Logo />
              <button onClick={() => setOpen(false)} className="btn-ghost px-2" aria-label={t("Close menu")}>
                <X className="h-6 w-6" />
              </button>
            </div>
            <Link href="/post-property" className="btn-gold mb-4 w-full">
              <HousePlus className="h-4 w-4" /> {t("Post Property")}
            </Link>
            <Link href="/ai" className="btn-outline mb-4 w-full">
              <Sparkles className="h-4 w-4 text-gold-500" /> {t("Ask the AI assistant")}
            </Link>
            <LanguageToggle className="mb-3 w-full justify-center border border-slate-200" />
            <nav className="space-y-1">
              {NAV.map((n) => (
                <details key={n.label} className="group rounded-xl">
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-3 font-semibold text-slate-800 hover:bg-slate-50">
                    {n.columns ? t(n.label) : <Link href={n.href}>{t(n.label)}</Link>}
                    {n.columns && <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />}
                  </summary>
                  {n.columns && (
                    <div className="space-y-1 pb-2 ps-3">
                      <Link href={n.href} className="block rounded-lg px-3 py-2 text-sm text-brand-700">
                        {t("View all")} · {t(n.label)}
                      </Link>
                      {n.columns.flatMap((c) => c.links).map((l) => (
                        <Link key={l.href + l.label} href={l.href} className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                          {t(l.label)}
                        </Link>
                      ))}
                    </div>
                  )}
                </details>
              ))}
            </nav>
            <div className="mt-auto border-t border-slate-200 pt-4 text-sm text-slate-500">{user ? `Signed in as ${user.name}` : <Link href="/login" className="btn-primary w-full"><User className="h-4 w-4" /> {t("Login / Register")}</Link>}</div>
          </div>
        </div>
      )}
    </>
  );
}

function useClickOutside(onOut: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onOut]);
  return ref;
}

export function UserMenu({ user }: { user: { name: string; email: string; roles: string[]; isStaff: boolean; avatarUrl: string | null } }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useClickOutside(() => setOpen(false));
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const logout = async () => {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full p-0.5 pe-2 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={open}>
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{initials}</span>}
        <ChevronDown className="hidden h-4 w-4 text-slate-500 sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-full mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-[var(--shadow-lift)]">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
            <LayoutDashboard className="h-4 w-4" /> {t("Dashboard")}
          </Link>
          <Link href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
            <User className="h-4 w-4" /> {t("Account")}
          </Link>
          <Link href="/account/notifications" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
            <Settings className="h-4 w-4" /> {t("Notification settings")}
          </Link>
          {user.isStaff && (
            <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50">
              <Shield className="h-4 w-4" /> {t("Admin panel")}
            </Link>
          )}
          <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" /> {t("Sign out")}
          </button>
        </div>
      )}
    </div>
  );
}

type Notif = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

export function NotificationBell({ count }: { count: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[] | null>(null);
  const [unread, setUnread] = useState(count);
  const ref = useClickOutside(() => setOpen(false));
  const router = useRouter();
  const toggle = async () => {
    setOpen((o) => !o);
    if (!items) {
      const r = await api<{ items: Notif[] }>("/api/v1/notifications");
      setItems(r.items);
    }
  };
  const markAll = async () => {
    await api("/api/v1/notifications", { method: "PATCH", body: {} });
    setUnread(0);
    setItems((x) => x?.map((i) => ({ ...i, readAt: new Date().toISOString() })) ?? null);
    router.refresh();
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="btn-ghost relative px-2.5" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-2 w-[min(92vw,380px)] rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-lift)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold">{t("Notifications")}</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-semibold text-brand-700">
                {t("Mark all read")}
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {!items && <p className="p-4 text-sm text-slate-500">{t("Loading…")}</p>}
            {items?.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{t("You're all caught up.")}</p>}
            {items?.map((n) => (
              <Link key={n.id} href={n.link ?? "#"} onClick={() => setOpen(false)} className={`block border-b border-slate-50 px-4 py-3 hover:bg-slate-50 ${n.readAt ? "" : "bg-brand-50/50"}`}>
                <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{n.body}</p>
                <p className="mt-1 text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</p>
              </Link>
            ))}
          </div>
          <Link href="/account/notifications" className="block px-4 py-2.5 text-center text-xs font-semibold text-brand-700" onClick={() => setOpen(false)}>
            {t("Notification settings")}
          </Link>
        </div>
      )}
    </div>
  );
}
