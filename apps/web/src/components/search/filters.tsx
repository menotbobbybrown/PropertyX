"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X, Search, Map as MapIcon, ShieldCheck } from "lucide-react";
import { LISTABLE_TYPES, FEATURES, FURNISHING_LABELS, CONDITION_LABELS, serializeSearchQuery, AREA_UNIT_LABELS, type SearchQuery, type PropertyType, type AreaUnit, COUNTRY, isUAE, COMPLETION_LABELS, formatPriceShort } from "@propertyx/shared";
import { LocationAutocomplete } from "../location-autocomplete";
import { CITY_LINKS } from "../nav-data";

const AE_SALE_PRICES = [300_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 25_000_000, 50_000_000];
const AE_RENT_PRICES = [20_000, 40_000, 60_000, 80_000, 100_000, 150_000, 200_000, 300_000, 500_000, 1_000_000];
const PK_SALE_PRICES = [500_000, 1_000_000, 2_500_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000, 50_000_000, 75_000_000, 100_000_000, 200_000_000, 500_000_000];
const PK_RENT_PRICES = [10_000, 20_000, 30_000, 50_000, 75_000, 100_000, 150_000, 200_000, 300_000, 500_000, 1_000_000];
const SALE_PRICES = isUAE ? AE_SALE_PRICES : PK_SALE_PRICES;
const RENT_PRICES = isUAE ? AE_RENT_PRICES : PK_RENT_PRICES;
const fmt = (n: number) => (isUAE ? formatPriceShort(n) : n >= 10_000_000 ? `${n / 10_000_000} Crore` : n >= 100_000 ? `${n / 100_000} Lakh` : `${n / 1000}K`);

export function SearchFilters({ initial, locationLabel, total }: { initial: SearchQuery; locationLabel?: string; total: number }) {
  const router = useRouter();
  const [q, setQ] = useState<SearchQuery>(initial);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => setQ(initial), [initial]);
  const set = (patch: Partial<SearchQuery>) => setQ((x) => ({ ...x, ...patch }));
  const prices = q.purpose === "rent" ? RENT_PRICES : SALE_PRICES;
  const toggleArr = <T,>(arr: T[] | undefined, v: T) => (arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v]);
  const extraCount = useMemo(() => (q.features?.length ?? 0) + (q.furnishing ? 1 : 0) + (q.condition ? 1 : 0) + (q.verified ? 1 : 0) + (q.hasVideo ? 1 : 0) + (q.installments ? 1 : 0) + (q.completion ? 1 : 0) + (q.bathsMin ? 1 : 0), [q]);

  const apply = (map = false) => {
    const { page: _p, ...rest } = q;
    router.push(`${map ? "/map" : "/search"}?${serializeSearchQuery(rest).toString()}`);
    setOpen(false);
  };
  const reset = () => router.push(`/search${q.purpose ? `?purpose=${q.purpose}` : ""}`);

  const panel = (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        {(["sale", "rent"] as const).map((p) => (
          <button key={p} type="button" onClick={() => set({ purpose: p, priceMin: undefined, priceMax: undefined })} className={`chip justify-center ${q.purpose === p ? "chip-active" : ""}`}>
            {p === "sale" ? "Buy" : "Rent"}
          </button>
        ))}
      </div>

      {/* KILLER ADVANTAGE: 1-CLICK VERIFIED TITLE DEEDS FILTER */}
      <button
        type="button"
        onClick={() => set({ verified: !q.verified })}
        className={`w-full flex items-center justify-between rounded-xl p-2.5 sm:p-3 border text-xs sm:text-sm font-semibold transition-all ${
          q.verified
            ? "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-xs ring-2 ring-emerald-500/20"
            : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40"
        }`}
      >
        <span className="flex items-center gap-2">
          <ShieldCheck className={`h-4 w-4 shrink-0 ${q.verified ? "text-emerald-600" : "text-slate-400"}`} />
          <span className="text-start">Verified Title Deeds Only</span>
        </span>
        <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${q.verified ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
          {q.verified ? "Active" : "0 Ghost Ads"}
        </span>
      </button>
      <div>
        <label className="label" htmlFor="f-q">Keyword</label>
        <input id="f-q" className="input" placeholder="e.g. corner, solar, PX-1000123" value={q.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="f-city">City</label>
          <select id="f-city" className="input" value={q.city ?? ""} onChange={(e) => set({ city: e.target.value || undefined, location: undefined })}>
            <option value="">All cities</option>
            {CITY_LINKS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Area / Society / Block</span>
          <LocationAutocomplete city={q.city} value={q.location ? { slug: q.location, label: locationLabel ?? q.location } : null} onSelect={(s) => set({ location: s?.slug, city: s?.citySlug ?? q.city })} />
        </div>
      </div>
      {isUAE && q.purpose !== "rent" && (
        <div>
          <span className="label">Completion</span>
          <div className="grid grid-cols-3 gap-1.5">
            {([undefined, "ready", "off_plan"] as const).map((c) => (
              <button key={c ?? "any"} type="button" onClick={() => set({ completion: c })} className={`chip justify-center px-2 text-xs ${q.completion === c ? "chip-active" : ""}`}>
                {c ? COMPLETION_LABELS[c] : "Any"}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <span className="label">Property type</span>
        <div className="flex flex-wrap gap-1.5">
          {LISTABLE_TYPES.filter((t) => !(q.purpose === "rent" && t.category === "plot")).map((t) => (
            <button key={t.key} type="button" onClick={() => set({ types: toggleArr(q.types, t.key as PropertyType) })} className={`chip px-2.5 py-1 text-xs ${q.types?.includes(t.key as PropertyType) ? "chip-active" : ""}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="f-pmin">Min price ({COUNTRY.currency})</label>
          <select id="f-pmin" className="input" value={q.priceMin ?? ""} onChange={(e) => set({ priceMin: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">No min</option>
            {prices.map((p) => (
              <option key={p} value={p}>
                {fmt(p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-pmax">Max price ({COUNTRY.currency})</label>
          <select id="f-pmax" className="input" value={q.priceMax ?? ""} onChange={(e) => set({ priceMax: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">No max</option>
            {prices.map((p) => (
              <option key={p} value={p}>
                {fmt(p)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <span className="label">Area</span>
        <div className="grid grid-cols-[1fr_1fr_110px] gap-2">
          <input className="input" inputMode="decimal" placeholder="Min" aria-label="Minimum area" value={q.areaMin ?? ""} onChange={(e) => set({ areaMin: e.target.value ? Number(e.target.value) : undefined })} />
          <input className="input" inputMode="decimal" placeholder="Max" aria-label="Maximum area" value={q.areaMax ?? ""} onChange={(e) => set({ areaMax: e.target.value ? Number(e.target.value) : undefined })} />
          <select className="input" aria-label="Area unit" value={q.areaUnit ?? COUNTRY.defaultAreaUnit} onChange={(e) => set({ areaUnit: e.target.value as AreaUnit })}>
            {COUNTRY.areaUnits.map((u) => (
              <option key={u} value={u}>
                {AREA_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <span className="label">Bedrooms</span>
        <div className="flex flex-wrap gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map((b) => (
            <button key={b} type="button" onClick={() => set({ beds: toggleArr(q.beds, b) })} className={`chip min-w-11 justify-center px-3 ${q.beds?.includes(b) ? "chip-active" : ""}`}>
              {b === 0 ? "Studio" : b === 6 ? "6+" : b}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => setMore((m) => !m)} className="text-sm font-semibold text-brand-700">
        {more ? "Hide" : "Show"} more filters {extraCount > 0 && `(${extraCount})`}
      </button>
      {more && (
        <div className="space-y-5 rounded-2xl bg-slate-50 p-4">
          <div>
            <span className="label">Bathrooms</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((b) => (
                <button key={b} type="button" onClick={() => set({ bathsMin: q.bathsMin === b ? undefined : b })} className={`chip px-3 ${q.bathsMin === b ? "chip-active" : ""}`}>
                  {b}
                  {b === 4 ? "+" : "+"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="f-furn">Furnishing</label>
              <select id="f-furn" className="input" value={q.furnishing ?? ""} onChange={(e) => set({ furnishing: (e.target.value || undefined) as SearchQuery["furnishing"] })}>
                <option value="">Any</option>
                {Object.entries(FURNISHING_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-cond">Condition</label>
              <select id="f-cond" className="input" value={q.condition ?? ""} onChange={(e) => set({ condition: (e.target.value || undefined) as SearchQuery["condition"] })}>
                <option value="">Any</option>
                {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {[
              ["verified", "Verified properties only"],
              ...(isUAE ? [] : [["installments", "Installments available"]]),
              ["hasVideo", "Has video"],
            ].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!q[k as "verified"]} onChange={(e) => set({ [k]: e.target.checked || undefined })} /> {l}
              </label>
            ))}
          </div>
          <div>
            <span className="label">Features & amenities</span>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {FEATURES.filter((f) => f.filter && f.key !== "installments").map((f) => (
                <label key={f.key} className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={!!q.features?.includes(f.key)} onChange={() => set({ features: toggleArr(q.features, f.key) })} /> {f.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="sticky bottom-0 flex gap-2 bg-white pt-2">
        <button type="button" onClick={() => apply(false)} className="btn-primary flex-1">
          <Search className="h-4 w-4" /> Show results
        </button>
        <button type="button" onClick={() => apply(true)} className="btn-outline" title="View on map">
          <MapIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={reset} className="btn-ghost">
          Reset
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-outline w-full lg:hidden">
        <SlidersHorizontal className="h-4 w-4" /> Filters {total ? `· ${total.toLocaleString()} results` : ""}
      </button>
      <aside className="card hidden p-5 lg:block">{panel}</aside>
      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-lg font-bold">Filters</p>
              <button onClick={() => setOpen(false)} className="btn-ghost px-2" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
