import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, Bath, Maximize, Car, Building2, CalendarClock, Layers, Sofa, Hammer, Hash, Clock, CheckCircle2, ShieldAlert, ShieldCheck, AlertTriangle, Calculator, TrendingUp, HardHat, Receipt, Wallet, BadgeCheck, Landmark } from "lucide-react";
import { getBoundaries, getListingDetail, similarListings } from "@propertyx/core";
import { formatPKR, formatArea, formatPriceWords, PROPERTY_TYPE_LABELS, FURNISHING_LABELS, CONDITION_LABELS, FEATURE_GROUP_LABELS, verificationInfo, describeSqft, truncate, isUAE, COUNTRY, COMPLETION_LABELS, formatHandover, annualServiceCharge } from "@propertyx/shared";
import { db, getUser, appUrl } from "@/lib/server";
import { savedIdsFor } from "@/lib/queries";
import { Gallery } from "@/components/listing/gallery";
import { ContactPanel } from "@/components/listing/contact-panel";
import { LocationSection } from "@/components/listing/location-section";
import { ViewTracker, FinanceWidget, PriceHistoryChart, ReadMore } from "@/components/listing/widgets";
import { VerificationBadge, PriceReducedBadge, PremiumBadge, FeaturedBadge, StatusPill, DemoBadge } from "@/components/badges";
import { Breadcrumbs, JsonLd } from "@/components/seo";
import { PropertyGrid } from "@/components/property-card";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await getListingDetail(db, slug, null);
  if (!d) return { title: "Property not found", robots: { index: false } };
  const desc = truncate(`${formatPKR(d.listing.price)} — ${d.listing.description.replace(/\s+/g, " ")}`, 158);
  const img = d.images[0]?.url;
  return {
    title: d.listing.title,
    description: desc,
    alternates: { canonical: `/property/${d.listing.slug}` },
    openGraph: { title: d.listing.title, description: desc, type: "website", url: `/property/${d.listing.slug}`, images: img ? [{ url: img }] : undefined },
    robots: d.listing.status === "active" ? undefined : { index: false, follow: true },
  };
}

export default async function PropertyPage({ params }: Props) {
  const { slug } = await params;
  const user = await getUser();
  const d = await getListingDetail(db, slug, user);
  if (!d) notFound();
  const { listing: l, property: p } = d;
  const [similar, boundaryRows] = await Promise.all([
    similarListings(db, d),
    // outline of the listing's society / area for the location map (traced, or approximate from listings)
    d.area && p.lat != null && p.lng != null ? getBoundaries(db, [p.lng - 0.05, p.lat - 0.05, p.lng + 0.05, p.lat + 0.05], { slugs: [d.area.slug] }).catch(() => []) : Promise.resolve([]),
  ]);
  const boundary = boundaryRows[0] ? { name: boundaryRows[0].name, polygon: boundaryRows[0].polygon, source: boundaryRows[0].source } : null;
  const saved = user ? await savedIdsFor(user.id) : [];
  const reduced = !!l.priceReducedAt && !!l.previousPrice;
  const recentlyUpdated = Date.now() - l.updatedAt.getTime() < 7 * 86400_000;
  const areaLabel = formatArea(p.areaValue, p.areaUnit);
  const v = verificationInfo(l.verificationLevel);
  const location = [d.block?.name, d.area?.name, d.city.name].filter(Boolean).join(", ");
  const det = l.details ?? {};
  const offPlan = l.purpose === "sale" && det.completionStatus === "off_plan";
  const serviceYear = annualServiceCharge(det.serviceChargePerSqft, p.areaSqft);
  const groups = d.features.reduce<Record<string, string[]>>((acc, f) => ((acc[f.group] ??= []).push(f.label), acc), {});
  const facts = [
    { icon: Building2, label: "Type", value: PROPERTY_TYPE_LABELS[p.type] },
    { icon: Maximize, label: "Area", value: `${areaLabel}${p.areaUnit !== "sqft" ? ` (${Math.round(p.areaSqft).toLocaleString()} sq ft)` : ""}` },
    p.beds != null && { icon: BedDouble, label: "Bedrooms", value: p.beds === 0 ? "Studio" : String(p.beds) },
    p.baths != null && { icon: Bath, label: "Bathrooms", value: String(p.baths) },
    p.parkingSpaces != null && { icon: Car, label: "Parking", value: p.parkingSpaces ? `${p.parkingSpaces} car${p.parkingSpaces > 1 ? "s" : ""}` : "None" },
    p.floors != null && { icon: Layers, label: "Floors", value: String(p.floors) },
    p.floorNumber != null && { icon: Layers, label: "Floor", value: String(p.floorNumber) },
    p.furnishing && { icon: Sofa, label: "Furnishing", value: FURNISHING_LABELS[p.furnishing] },
    p.condition && { icon: Hammer, label: "Condition", value: CONDITION_LABELS[p.condition] },
    p.yearBuilt && { icon: CalendarClock, label: "Built", value: String(p.yearBuilt) },
    l.purpose === "sale" && det.completionStatus && { icon: HardHat, label: "Completion", value: COMPLETION_LABELS[det.completionStatus] },
    offPlan && det.handoverDate && { icon: CalendarClock, label: "Handover", value: formatHandover(det.handoverDate)! },
    offPlan && det.paymentPlan && { icon: Wallet, label: "Payment plan", value: det.paymentPlan },
    det.developer && { icon: Building2, label: "Developer", value: det.developer },
    det.serviceChargePerSqft && { icon: Receipt, label: "Service charge", value: `${COUNTRY.currency} ${det.serviceChargePerSqft}/sq ft${serviceYear ? ` (≈ ${formatPKR(serviceYear)}/yr)` : ""}` },
    l.purpose === "rent" && det.cheques && { icon: Receipt, label: "Cheques", value: det.cheques === 1 ? "1 (full payment)" : `Up to ${det.cheques}` },
    { icon: Hash, label: "Reference", value: l.referenceCode },
    l.publishedAt && { icon: Clock, label: "Listed", value: l.publishedAt.toLocaleDateString(COUNTRY.locale, { dateStyle: "medium" }) },
  ].filter(Boolean) as { icon: typeof Building2; label: string; value: string }[];
  const base = appUrl();
  const purposeLabel = l.purpose === "sale" ? "Buy" : "Rent";

  return (
    <div className="container-px py-6">
      <ViewTracker listingId={l.id} />
      <Breadcrumbs
        baseUrl={base}
        items={[
          { label: purposeLabel, href: `/${l.purpose === "sale" ? "buy" : "rent"}` },
          { label: d.city.name, href: `/${l.purpose === "sale" ? "buy" : "rent"}/property/${d.city.slug}` },
          ...(d.area ? [{ label: d.area.name, href: `/${l.purpose === "sale" ? "buy" : "rent"}/property/${d.city.slug}/${d.area.slug}` }] : []),
          { label: l.referenceCode },
        ]}
      />
      {l.status !== "active" && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <StatusPill status={l.status} />
          {l.status === "rejected" && l.rejectionReason ? `Not approved: ${l.rejectionReason}` : l.status === "pending_review" ? "This listing is waiting for moderator review and is not visible to the public yet." : "This listing is not currently available."}
        </div>
      )}

      {/* HARDENED CONSUMER PROTECTION / VERIFIED DEED BANNERS */}
      {l.status === "active" && l.verificationLevel < 2 && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs sm:text-sm text-amber-900 shadow-2xs">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-amber-950">Direct Seller Listing (Title Deeds Pending Verification)</p>
            <p className="text-amber-800/90 leading-relaxed text-xs">
              PropertyX has not yet physically inspected or legally verified ownership title deeds for this individual listing.
              Never send advance cash, unrecorded token deposits, or mobile wallet transfers outside official escrow or banking channels.
            </p>
          </div>
        </div>
      )}

      {l.status === "active" && l.verificationLevel >= 4 && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/80 p-4 text-xs sm:text-sm text-emerald-950 shadow-2xs">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-emerald-950">Verified Title Deed & Ownership (100% Escrow Guaranteed)</p>
            <p className="text-emerald-800/90 leading-relaxed text-xs">
              The original allotment letter, transfer slip, or registry for this property has been audited by PropertyX.
              This listing is fully eligible for Digital Bayana / Escrow Token Reservation with a 100% refund guarantee.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {l.verificationLevel > 0 && <VerificationBadge level={l.verificationLevel} size="md" />}
        {d.isFeatured && <FeaturedBadge />}
        {l.isPremium && <PremiumBadge />}
        {reduced && <PriceReducedBadge />}
        {offPlan && <span className="badge bg-violet-50 text-violet-700 ring-1 ring-violet-200">Off-plan</span>}
        {det.permitNumber && (
          <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            <BadgeCheck className="h-3.5 w-3.5" /> Permit
          </span>
        )}
        {recentlyUpdated && <span className="badge bg-sky-50 text-sky-700 ring-1 ring-sky-200">Recently Updated</span>}
        {l.isSeed && <DemoBadge />}
      </div>

      <div className="mt-4">
        <Gallery images={d.images.map((m) => ({ url: m.url, caption: m.caption }))} floorPlans={d.floorPlans.map((m) => ({ url: m.url, caption: m.caption }))} videoUrl={l.videoUrl} tourUrl={l.tourUrl} title={l.title} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
                  {formatPKR(l.price)}
                  {l.purpose === "rent" && <span className="text-lg font-semibold text-slate-500"> / {l.rentPeriod === "yearly" ? "year" : "month"}</span>}
                </p>
                {reduced && (
                  <p className="mt-1 text-sm">
                    <span className="text-slate-400 line-through">{formatPKR(l.previousPrice!)}</span> <span className="font-semibold text-red-600">Reduced by {formatPriceWords(l.previousPrice! - l.price)}</span>
                  </p>
                )}
                {l.pricePerSqft && l.purpose === "sale" && (
                  <p className="mt-1 text-sm text-slate-500">
                    {COUNTRY.currency} {Math.round(l.pricePerSqft).toLocaleString()} per sq ft{!isUAE && ` · ${formatPKR(l.pricePerSqft * 225)} per marla`}
                  </p>
                )}
              </div>
              {l.installmentAvailable && l.advanceAmount && (
                <div className="rounded-xl bg-gold-50 px-4 py-2 text-sm ring-1 ring-gold-200">
                  <p className="font-semibold text-gold-800">Installments available</p>
                  <p className="text-gold-700">
                    {formatPKR(l.advanceAmount)} advance · {l.installmentsRemaining} × {formatPKR(l.monthlyInstallment ?? 0)}
                  </p>
                </div>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-bold leading-tight text-slate-900 sm:text-[28px]">{l.title}</h1>
            <p className="mt-1 text-slate-500">{location}</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-slate-700">
              {p.beds != null && (
                <span className="flex items-center gap-2">
                  <BedDouble className="h-5 w-5 text-brand-600" /> {p.beds === 0 ? "Studio" : `${p.beds} Beds`}
                </span>
              )}
              {p.baths != null && (
                <span className="flex items-center gap-2">
                  <Bath className="h-5 w-5 text-brand-600" /> {p.baths} Baths
                </span>
              )}
              <span className="flex items-center gap-2">
                <Maximize className="h-5 w-5 text-brand-600" /> {areaLabel}
              </span>
            </div>
          </section>

          {(l.highlights ?? []).length > 0 && (
            <section className="flex flex-wrap gap-2">
              {l.highlights!.map((h) => (
                <span key={h} className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800">
                  <CheckCircle2 className="h-4 w-4" /> {h}
                </span>
              ))}
            </section>
          )}

          <section className="card p-6">
            <h2 className="mb-4 text-lg font-bold">Property details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div>
                    <dt className="text-xs text-slate-500">{f.label}</dt>
                    <dd className="font-semibold text-slate-900">{f.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-6">
            <h2 className="mb-3 text-lg font-bold">Description</h2>
            <ReadMore text={l.description} />
          </section>

          {isUAE && (det.permitNumber || det.brn || det.orn) && (
            <section className="card p-6">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
                <Landmark className="h-5 w-5 text-brand-600" /> Regulatory information
              </h2>
              <p className="mb-4 text-sm text-slate-500">As provided by the advertiser. Check the permit on the land department&apos;s app (DLD / Trakheesi in Dubai, ADREC in Abu Dhabi) before paying anything.</p>
              <dl className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Permit number", det.permitNumber],
                  ["Agent BRN", det.brn],
                  ["Office ORN", det.orn],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-slate-500">{k}</dt>
                      <dd className="font-mono font-semibold text-slate-900">{v}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          )}

          {Object.keys(groups).length > 0 && (
            <section className="card p-6">
              <h2 className="mb-4 text-lg font-bold">Amenities & features</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                {Object.entries(groups).map(([g, items]) => (
                  <div key={g}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{FEATURE_GROUP_LABELS[g] ?? g}</p>
                    <ul className="space-y-1.5 text-sm text-slate-700">
                      {items.map((i) => (
                        <li key={i} className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-brand-600" /> {i}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {p.lat != null && p.lng != null && (
            <section className="card p-6">
              <h2 className="mb-3 text-lg font-bold">Location & nearby</h2>
              <LocationSection lat={p.lat} lng={p.lng} address={p.address ?? location} boundary={boundary} />
              {d.area && (
                <Link href={`/area/${d.area.slug}`} className="mt-4 inline-block text-sm font-semibold text-brand-700">
                  Explore {d.area.name}: prices, trends & guide →
                </Link>
              )}
            </section>
          )}

          <section className="card p-6">
            <h2 className="mb-3 text-lg font-bold">Price history</h2>
            <PriceHistoryChart points={d.priceHistory.map((h) => ({ at: h.changedAt.toISOString(), price: h.newPrice }))} />
          </section>

          <section className="card p-6">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <ShieldAlert className="h-5 w-5 text-brand-600" /> Verification & safety
            </h2>
            <p className="text-sm text-slate-600">
              <b>Level {l.verificationLevel} — {v.label}.</b> {v.description}
              {l.verifiedAt && ` Last checked ${l.verifiedAt.toLocaleDateString("en-PK", { dateStyle: "medium" })}.`}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Never pay token money before visiting and checking ownership documents.</li>
              <li>Pay only by bank transfer or pay order in the registered owner's name.</li>
              <li>
                Read our <Link href={isUAE ? "/safety" : "/blog/verify-property-documents-pakistan"} className="text-brand-700 underline">{isUAE ? "safety tips" : "document checklist"}</Link>.
              </li>
            </ul>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">{l.contactName.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{d.agent?.displayName ?? l.contactName}</p>
                <p className="truncate text-sm text-slate-500">{d.agent?.agencyName ?? (d.agent ? "Independent agent" : "Owner")}</p>
                <div className="mt-1 flex gap-1">
                  {d.agent && <VerificationBadge level={d.agent.verificationLevel} kind="agent" />}
                  {!d.agent && d.poster && <VerificationBadge level={d.poster.verificationLevel} kind="profile" />}
                </div>
              </div>
            </div>
            <ContactPanel
              listingId={l.id}
              slug={l.slug}
              title={l.title}
              price={l.price}
              purpose={l.purpose}
              contactName={l.contactName}
              contactPhone={l.contactPhone}
              contactWhatsapp={l.contactWhatsapp}
              isSeed={l.isSeed}
              isOwner={d.isOwner}
              active={l.status === "active"}
              saved={d.isSaved}
              verificationLevel={l.verificationLevel}
              user={user ? { name: user.name, email: user.email, phone: user.phone } : null}
            />
            {d.agent && (
              <div className="mt-4 flex gap-3 border-t border-slate-100 pt-3 text-sm">
                <Link href={`/agents/${d.agent.slug}`} className="font-semibold text-brand-700">
                  Agent profile
                </Link>
                {d.agent.agencySlug && (
                  <Link href={`/agencies/${d.agent.agencySlug}`} className="font-semibold text-brand-700">
                    Agency
                  </Link>
                )}
              </div>
            )}
          </div>
          {l.purpose === "sale" && (
            <div className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-bold">
                <Calculator className="h-5 w-5 text-brand-600" /> {isUAE ? "Mortgage & costs" : "Home financing"}
              </h2>
              <FinanceWidget price={l.price} offPlan={offPlan} />
            </div>
          )}
          {l.purpose === "sale" && (
            <Link href={`/tools/investment?price=${l.price}&area=${Math.round(p.areaSqft)}`} className="card flex items-center gap-3 p-4 hover:border-brand-300">
              <TrendingUp className="h-5 w-5 text-gold-500" />
              <span className="text-sm">
                <b>Is this a good investment?</b>
                <span className="block text-slate-500">Run the AI investment advisor</span>
              </span>
            </Link>
          )}
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-14">
          <h2 className="section-title mb-6">Similar properties</h2>
          <PropertyGrid items={similar.slice(0, 4)} savedIds={saved} />
        </section>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "RealEstateListing",
          name: l.title,
          description: truncate(l.description, 500),
          url: `${base}/property/${l.slug}`,
          datePosted: l.publishedAt?.toISOString(),
          image: d.images.slice(0, 5).map((i) => i.url),
          offers: { "@type": "Offer", price: l.price, priceCurrency: COUNTRY.currency, availability: l.status === "active" ? "https://schema.org/InStock" : "https://schema.org/SoldOut", businessFunction: l.purpose === "rent" ? "https://purl.org/goodrelations/v1#LeaseOut" : "https://purl.org/goodrelations/v1#Sell" },
          about: {
            "@type": p.type === "flat" || p.type === "apartment" || p.type === "penthouse" ? "Apartment" : p.category === "residential" ? "SingleFamilyResidence" : "Place",
            numberOfRooms: p.beds ?? undefined,
            numberOfBathroomsTotal: p.baths ?? undefined,
            floorSize: { "@type": "QuantitativeValue", value: Math.round(p.areaSqft), unitCode: "FTK", description: describeSqft(p.areaSqft) },
            address: { "@type": "PostalAddress", addressLocality: d.city.name, addressRegion: d.province.name, streetAddress: p.address ?? undefined, addressCountry: "PK" },
            geo: p.lat ? { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } : undefined,
          },
        }}
      />
    </div>
  );
}
