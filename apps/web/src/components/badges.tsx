import { BadgeCheck, ShieldCheck, TrendingDown, Crown, Sparkles, Phone, IdCard, FileCheck2 } from "lucide-react";
import { verificationInfo } from "@propertyx/shared";
import { Tr } from "./tr";

export function VerificationBadge({ level, kind = "property", size = "sm" }: { level: number; kind?: "property" | "agent" | "profile"; size?: "sm" | "md" }) {
  if (level <= 0) return null;
  const info = verificationInfo(level);
  const cls = size === "md" ? "text-xs px-2.5 py-1 font-semibold" : "text-[11px] font-semibold";
  if (kind !== "property") {
    if (level >= 2)
      return (
        <span className={`badge bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20 shadow-xs ${cls}`} title={info.description}>
          <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> <Tr k={kind === "agent" ? "Verified Agent" : "Verified Identity"} />
        </span>
      );
    return (
      <span className={`badge bg-slate-100 text-slate-700 ring-1 ring-slate-200 ${cls}`} title={info.description}>
        <Phone className="h-3 w-3 text-slate-500" /> <Tr k="Phone Verified" />
      </span>
    );
  }
  if (level >= 5)
    return (
      <span className={`badge bg-gold-50 text-gold-900 ring-1 ring-gold-400/40 shadow-xs ${cls}`} title={info.description}>
        <Crown className="h-3.5 w-3.5 text-gold-600" /> <Tr k="Physical Inspection Verified" />
      </span>
    );
  if (level >= 4)
    return (
      <span className={`badge bg-emerald-800 text-white shadow-xs tracking-tight ${cls}`} title={info.description}>
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-200" /> <Tr k="Verified Title Deed" />
      </span>
    );
  if (level === 3)
    return (
      <span className={`badge bg-sky-50 text-sky-800 ring-1 ring-sky-200 ${cls}`} title={info.description}>
        <FileCheck2 className="h-3.5 w-3.5 text-sky-600" /> <Tr k="Docs In Review" />
      </span>
    );
  if (level === 2)
    return (
      <span className={`badge bg-slate-100 text-slate-800 ring-1 ring-slate-200 ${cls}`} title={info.description}>
        <IdCard className="h-3.5 w-3.5 text-slate-600" /> <Tr k="ID Verified Owner" />
      </span>
    );
  return (
    <span className={`badge bg-slate-100 text-slate-600 ring-1 ring-slate-200/80 ${cls}`} title={info.description}>
      <Phone className="h-3 w-3 text-slate-400" /> <Tr k="Phone Verified" />
    </span>
  );
}

export function PriceReducedBadge() {
  return (
    <span className="badge bg-red-50 text-red-700 ring-1 ring-red-200">
      <TrendingDown className="h-3.5 w-3.5" /> <Tr k="Price Reduced" />
    </span>
  );
}

export function PremiumBadge() {
  return (
    <span className="badge bg-gradient-to-r from-gold-400 to-gold-600 text-white shadow-sm">
      <Sparkles className="h-3.5 w-3.5" /> <Tr k="Premium" />
    </span>
  );
}

export function FeaturedBadge() {
  return <span className="badge bg-gold-500 text-white"><Tr k="Featured" /></span>;
}

export function DemoBadge() {
  return (
    <span className="badge bg-slate-900/70 text-white backdrop-blur" title="Sample listing created for demonstration">
      <Tr k="Demo listing" />
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pending_review: "bg-amber-50 text-amber-800 ring-amber-200",
    draft: "bg-slate-100 text-slate-700 ring-slate-200",
    paused: "bg-slate-100 text-slate-700 ring-slate-200",
    sold: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    rented: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    expired: "bg-orange-50 text-orange-700 ring-orange-200",
    rejected: "bg-red-50 text-red-700 ring-red-200",
    requested: "bg-amber-50 text-amber-800 ring-amber-200",
    confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    completed: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
    no_show: "bg-red-50 text-red-700 ring-red-200",
    new: "bg-sky-50 text-sky-700 ring-sky-200",
    contacted: "bg-violet-50 text-violet-700 ring-violet-200",
    qualified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    negotiation: "bg-amber-50 text-amber-800 ring-amber-200",
    won: "bg-emerald-600 text-white ring-emerald-600",
    lost: "bg-slate-100 text-slate-600 ring-slate-200",
    open: "bg-amber-50 text-amber-800 ring-amber-200",
    investigating: "bg-sky-50 text-sky-700 ring-sky-200",
    resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dismissed: "bg-slate-100 text-slate-600 ring-slate-200",
    pending: "bg-amber-50 text-amber-800 ring-amber-200",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    published: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
    refunded: "bg-slate-100 text-slate-700 ring-slate-200",
    paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    due: "bg-sky-50 text-sky-700 ring-sky-200",
    overdue: "bg-red-50 text-red-700 ring-red-200",
    partial: "bg-amber-50 text-amber-800 ring-amber-200",
    in_progress: "bg-sky-50 text-sky-700 ring-sky-200",
    occupied: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    vacant: "bg-orange-50 text-orange-700 ring-orange-200",
    ended: "bg-slate-100 text-slate-600 ring-slate-200",
    confirmed_fraud: "bg-red-50 text-red-700 ring-red-200",
  };
  return <span className={`badge ring-1 ${map[status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>{status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</span>;
}
