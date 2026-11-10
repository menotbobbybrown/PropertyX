import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { AREA_UNIT_LABELS, CONDITIONS, CONDITION_LABELS, LISTABLE_TYPES, formatPKR, type AreaUnit, type Condition, type PropertyType, COUNTRY } from "@propertyx/shared";
import { listAreaDirectory, valueProperty } from "@propertyx/core";
import { db } from "@/lib/server";
import { CITY_LINKS } from "@/components/nav-data";
import { PropertyGrid } from "@/components/property-card";
import { MarketDataNote } from "@/components/market/data-note";
import { AutoSubmitSelect } from "@/components/tools/auto-submit-select";
import { ToolLeadForm } from "@/components/tools/tool-lead-form";

export const metadata: Metadata = {
  title: "What's my property worth? — free property valuation",
  description: `Get an indicative value for your house, flat or plot in ${COUNTRY.inName} from comparable listings in the same area, with a price range and confidence level.`,
  alternates: { canonical: "/tools/property-value" },
};

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const VALUE_TYPES = LISTABLE_TYPES.filter((t) => !["room", "plot_file", "other"].includes(t.key));

export default async function PropertyValuePage({ searchParams }: Props) {
  const sp = await searchParams;
  const city = CITY_LINKS.find((c) => c.slug === sp.city)?.slug ?? CITY_LINKS[0].slug;
  const type = (VALUE_TYPES.find((t) => t.key === sp.type)?.key ?? "house") as PropertyType;
  const unit = (COUNTRY.areaUnits.includes(sp.unit as AreaUnit) ? sp.unit : COUNTRY.defaultAreaUnit) as AreaUnit;
  const purpose = sp.purpose === "rent" ? "rent" : "sale";
  const condition = CONDITIONS.includes(sp.condition as Condition) ? (sp.condition as Condition) : undefined;
  const areaValue = Number(sp.area);
  const beds = sp.beds ? Number(sp.beds) : null;
  const hasRooms = VALUE_TYPES.find((t) => t.key === type)!.hasRooms;

  const areas = (await listAreaDirectory(db, { city, perCity: 200 }))[0]?.areas ?? [];
  const location = areas.some((a) => a.slug === sp.location) ? sp.location : undefined;
  const result =
    sp.go && areaValue > 0
      ? await valueProperty(db, {
          city,
          location,
          type,
          areaValue,
          areaUnit: unit,
          purpose,
          condition,
          beds: hasRooms ? beds : null,
          corner: sp.corner === "1",
          parkFacing: sp.park === "1",
          mainBoulevard: sp.boulevard === "1",
          westOpen: sp.west === "1",
        })
      : null;
  const est = result?.estimate;
  const placeName = location ? areas.find((a) => a.slug === location)!.name : CITY_LINKS.find((c) => c.slug === city)!.name;

  return (
    <div className="container-px py-12">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-extrabold sm:text-4xl">What&apos;s my property worth?</h1>
        <p className="mt-3 text-slate-500">An indicative value worked out from similar properties listed in the same area.</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form action="/tools/property-value" className="card space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pv-city">City</label>
              <AutoSubmitSelect id="pv-city" name="city" defaultValue={city} className="input">
                {CITY_LINKS.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </AutoSubmitSelect>
            </div>
            <div>
              <label className="label" htmlFor="pv-loc">Area / society</label>
              <select id="pv-loc" name="location" defaultValue={location ?? ""} className="input">
                <option value="">Anywhere in the city</option>
                {areas.map((a) => (
                  <option key={a.slug} value={a.slug}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pv-type">Property type</label>
              <select id="pv-type" name="type" defaultValue={type} className="input">
                {VALUE_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pv-purpose">Value for</label>
              <select id="pv-purpose" name="purpose" defaultValue={purpose} className="input">
                <option value="sale">Selling price</option>
                <option value="rent">Monthly rent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="pv-area">Size</label>
            <div className="flex gap-2">
              <input id="pv-area" name="area" className="input" type="number" min={0} step="any" required defaultValue={sp.area ?? (COUNTRY.defaultAreaUnit === "marla" ? "10" : "1500")} />
              <select name="unit" defaultValue={unit} className="input w-32 shrink-0" aria-label="Unit">
                {COUNTRY.areaUnits.map((u) => (
                  <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pv-beds">Bedrooms (homes only)</label>
              <select id="pv-beds" name="beds" defaultValue={sp.beds ?? ""} className="input">
                <option value="">Any</option>
                {[1, 2, 3, 4, 5, 6, 7].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pv-cond">Condition</label>
              <select id="pv-cond" name="condition" defaultValue={condition ?? ""} className="input">
                <option value="">Not sure</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-700">
            <label className="flex items-center gap-2"><input type="checkbox" name="corner" value="1" defaultChecked={sp.corner === "1"} className="h-4 w-4 accent-brand-700" /> Corner</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="park" value="1" defaultChecked={sp.park === "1"} className="h-4 w-4 accent-brand-700" /> Park facing</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="boulevard" value="1" defaultChecked={sp.boulevard === "1"} className="h-4 w-4 accent-brand-700" /> Main Boulevard (50ft+ road)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="west" value="1" defaultChecked={sp.west === "1"} className="h-4 w-4 accent-brand-700" /> West Open</label>
          </div>
          <button name="go" value="1" className="btn-primary w-full py-3 text-base">Estimate value</button>
        </form>

        <div className="card p-6 lg:self-start" aria-live="polite">
          {!result && <p className="py-16 text-center text-slate-500">Fill in your property details and press Estimate value.</p>}
          {result && !est && (
            <div className="py-12 text-center">
              <p className="font-semibold text-slate-800">Not enough similar listings to estimate this property.</p>
              <p className="mt-2 text-sm text-slate-500">Try &quot;Anywhere in the city&quot;, a nearby size or a related property type.</p>
            </div>
          )}
          {result && est && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">Estimated {purpose === "rent" ? "monthly rent" : "market value"}</p>
                {est.confidenceScore != null && (
                  <span className="badge bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                    AVM Confidence: {est.confidenceScore}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-4xl font-extrabold text-brand-800">{formatPKR(est.estimate.avg)}</p>
              <p className="mt-1 text-sm text-slate-500">
                Conservative to Premium: {formatPKR(est.estimate.low)} – {formatPKR(est.estimate.high)}
              </p>
              {est.confidenceInterval95 && (
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600 border border-slate-100 flex items-center justify-between">
                  <span>95% Statistically Verified Range:</span>
                  <span className="font-semibold text-slate-800">
                    {formatPKR(est.confidenceInterval95.lower)} – {formatPKR(est.confidenceInterval95.upper)}
                  </span>
                </div>
              )}
              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  ["Per sq ft", `${COUNTRY.currency} ${est.pricePerSqft.avg.toLocaleString()}`],
                  ["Comps Analyzed", `${est.sampleSize} verified`],
                  ["Sample Depth", est.confidence[0].toUpperCase() + est.confidence.slice(1)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-800">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-600">
                Hedonic regression based on similar properties {result.scope === "location" ? `in ${placeName}` : `across ${CITY_LINKS.find((c) => c.slug === city)!.name}`}
                {location && result.scope === "city" ? " (expanded to city level due to localized sample size)" : ""}.
              </p>
              {est.adjustments.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {est.adjustments.map((a) => (
                    <li key={a.label} className="badge bg-brand-50 text-brand-800">{a.label} {a.pct > 0 ? "+" : ""}{a.pct}%</li>
                  ))}
                </ul>
              )}

              {/* Viral WhatsApp Share Action */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `*PropertyX AVM Valuation Report*\n📍 Location: ${placeName}\n🏡 Type: ${VALUE_TYPES.find((t) => t.key === type)!.label}\n📐 Size: ${areaValue} ${AREA_UNIT_LABELS[unit]}\n💰 Estimated Value: ${formatPKR(est.estimate.avg)}\n📊 95% Confidence Range: ${formatPKR(est.confidenceInterval95?.lower ?? est.estimate.low)} - ${formatPKR(est.confidenceInterval95?.upper ?? est.estimate.high)}\n\nCalculate yours free: https://propertyx.pk/tools/property-value?city=${city}&location=${location ?? ""}&type=${type}&area=${areaValue}&unit=${unit}&go=1`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn bg-[#25D366] text-white hover:bg-[#1ebe5b] w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold shadow-xs"
                >
                  <MessageCircle className="h-4 w-4" /> Share Valuation Report on WhatsApp
                </a>
              </div>
              <div className="mt-5">
                <MarketDataNote demo={result.isDemoData} />
              </div>
              <ToolLeadForm
                tool="property_value"
                context={{
                  Location: placeName,
                  Type: VALUE_TYPES.find((t) => t.key === type)!.label,
                  Purpose: purpose === "rent" ? "Rent out" : "Sell",
                  Size: `${areaValue} ${AREA_UNIT_LABELS[unit]}`,
                  ...(hasRooms && beds ? { Bedrooms: beds } : {}),
                  Estimate: formatPKR(est.estimate.avg),
                  Range: `${formatPKR(est.estimate.low)} – ${formatPKR(est.estimate.high)}`,
                }}
              />
            </>
          )}
        </div>
      </div>

      {result && est && result.comparables.length > 0 && (
        <section className="mt-10">
          <h2 className="section-title">Similar properties</h2>
          <p className="mb-6 mt-1 text-slate-500">Listings used for this estimate</p>
          <PropertyGrid items={result.comparables} cols={3} />
        </section>
      )}
    </div>
  );
}
