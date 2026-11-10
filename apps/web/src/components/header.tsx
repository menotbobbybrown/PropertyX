import Link from "next/link";
import { Heart, HousePlus, MessageSquare, UserRound } from "lucide-react";
import { unreadCount } from "@propertyx/notifications";
import { unreadMessages } from "@propertyx/core";
import { db, getUser } from "@/lib/server";
import { Logo } from "./logo";
import { DesktopNav, MobileMenu, UserMenu, NotificationBell } from "./header-client";
import { LanguageToggle } from "./i18n";
import { getT } from "@/lib/i18n-server";

export async function Header() {
  const [user, t] = await Promise.all([getUser(), getT()]);
  const [notif, msgs] = user ? await Promise.all([unreadCount(db, user.id), unreadMessages(db, user.id)]) : [0, 0];
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md transform-gpu">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        <MobileMenu user={user ? { name: user.name } : null} />
        <div className="shrink-0">
          <Logo />
        </div>
        <DesktopNav />
        <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageToggle className="hidden sm:inline-flex" />
          <Link href="/saved" className="btn-ghost hidden px-2.5 md:inline-flex shrink-0" title={t("Saved")}>
            <Heart className="h-5 w-5" />
            <span className="hidden xl:inline text-xs font-semibold">{t("Saved")}</span>
          </Link>
          <Link href="/messages" className="btn-ghost relative hidden px-2.5 md:inline-flex shrink-0" title={t("Messages")}>
            <MessageSquare className="h-5 w-5" />
            <span className="hidden xl:inline text-xs font-semibold">{t("Messages")}</span>
            {msgs > 0 && <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{msgs > 9 ? "9+" : msgs}</span>}
          </Link>
          {user && <NotificationBell count={notif} />}
          <Link href="/post-property" className="btn-gold shrink-0 px-3 py-2 text-xs font-semibold sm:text-sm shadow-xs hover:shadow-md transition-all" title={t("Post Property")} aria-label={t("Post Property")}>
            <HousePlus className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="inline">{t("Post Property")}</span>
          </Link>
          {user ? (
            <UserMenu user={{ name: user.name, email: user.email, roles: user.roles, isStaff: user.isStaff, avatarUrl: user.avatarUrl }} />
          ) : (
            <Link href="/login" className="btn-primary shrink-0 px-2.5 py-2 text-xs font-semibold sm:text-sm" title={t("Login / Register")} aria-label={t("Login / Register")}>
              <UserRound className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden lg:inline">{t("Login")}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
