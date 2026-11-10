import Link from "next/link";
import Image from "next/image";
import { BedDouble, Bath, Maximize, MapPin, Images, Video } from "lucide-react";
import type { ListingCard } from "@propertyx/search";
import { formatPKR, formatArea, PROPERTY_TYPE_LABELS } from "@propertyx/shared";
import { Tr } from "./tr";
import { VerificationBadge, PriceReducedBadge, PremiumBadge, FeaturedBadge, DemoBadge } from "./badges";
import { SaveButton } from "./save-button";
import { CompareToggle } from "./compare";

export function priceLabel(l: { price: number; purpose: string; rentPeriod?: string | null }) {
  return `${formatPKR(l.price)}${l.purpose === "rent" ? (l.rentPeriod === "yearly" ? "/yr" : "/mo") : ""}`;
}

export function PropertyCard({ l, saved = false, layout = "grid", priority = false }: { l: ListingCard; saved?: boolean; layout?: "grid" | "list"; priority?: boolean }) {
  const reduced = !!l.priceReducedAt && !!l.previousPrice && Date.now() - new Date(l.priceReducedAt).getTime() < 60 * 86400_000;
  const href = `/property/${l.slug}`;
  const list = layout === "list";
  return (
    <article className={`group card relative overflow-hidden transition hover:shadow-[var(--shadow-lift)] ${list ? "flex flex-col sm:flex-row" : "flex flex-col"} ${l.isFeatured ? "ring-1 ring-gold-300" : ""}`}>
      <Link href={href} className={`relative block overflow-hidden bg-slate-100 ${list ? "aspect-[4/3] sm:aspect-auto sm:w-[340px] sm:shrink-0" : "aspect-[4/3]"}`} aria-label={l.title}>
        {l.coverUrl ? (
          <Image src={l.coverUrl} alt={l.title} fill sizes={list ? "(min-width: 640px) 340px, 100vw" : "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"} className="object-cover transition duration-500 group-hover:scale-[1.04]" priority={priority} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400"><Tr k="No photo" /></div>
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1.5 p-3">
          {l.isFeatured && <FeaturedBadge />}
          {l.isPremium && <PremiumBadge />}
          {reduced && <PriceReducedBadge />}
          {l.completionStatus === "off_plan" && <span className="badge bg-violet-600 text-white">Off-plan</span>}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/55 to-transparent p-3 pt-10">
          <span className="flex items-center gap-2 text-xs font-medium text-white">
            <span className="flex items-center gap-1">
              <Images className="h-3.5 w-3.5" /> {l.imageCount}
            </span>
            {l.hasVideo && <Video className="h-3.5 w-3.5" />}
          </span>
          {l.isSeed && <DemoBadge />}
        </div>
      </Link>
      <div className="absolute end-3 top-3 z-10">
        <SaveButton listingId={l.id} initial={saved} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-xl font-extrabold text-slate-900">{priceLabel(l)}</p>
            {reduced && l.previousPrice && <p className="text-xs text-slate-500 line-through">{formatPKR(l.previousPrice)}</p>}
          </div>
          {l.areaValue > 0 && l.purpose === "sale" && (
            <span className="text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">
              {formatPKR(Math.round(l.price / l.areaValue))}/{l.areaUnit}
            </span>
          )}
        </div>
        {l.verificationLevel > 0 && (
          <div className="mt-1.5">
            <VerificationBadge level={l.verificationLevel} />
          </div>
        )}
        <Link href={href} className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-snug text-slate-800 hover:text-brand-700">
          {l.title}
        </Link>
        <p className="mt-1 flex items-center gap-1 truncate text-sm text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{l.locationFullName ?? l.cityName}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
          {l.beds != null && (
            <span className="flex items-center gap-1.5" title="Bedrooms">
              <BedDouble className="h-4 w-4 text-slate-400" /> {l.beds === 0 ? "Studio" : l.beds}
            </span>
          )}
          {l.baths != null && (
            <span className="flex items-center gap-1.5" title="Bathrooms">
              <Bath className="h-4 w-4 text-slate-400" /> {l.baths}
            </span>
          )}
          <span className="flex items-center gap-1.5" title="Area">
            <Maximize className="h-4 w-4 text-slate-400" /> {formatArea(l.areaValue, l.areaUnit)}
          </span>
          <span className="ms-auto text-xs text-slate-400">{PROPERTY_TYPE_LABELS[l.type]}</span>
        </div>
        {list && l.agentName && (
          <p className="mt-3 text-xs text-slate-500">
            Listed by <span className="font-medium text-slate-700">{l.agentName}</span>
            {l.agencyName ? ` · ${l.agencyName}` : ""}
          </p>
        )}
        <div className="mt-auto pt-3 flex items-center justify-between border-t border-slate-50">
          <CompareToggle id={l.id} title={l.title} />
          <Link href={href} className="text-xs font-semibold text-brand-700 hover:text-brand-800 transition-colors">
            View Details →
          </Link>
        </div>
      </div>
    </article>
  );
}

export function PropertyGrid({ items, savedIds = [], cols = 4 }: { items: ListingCard[]; savedIds?: string[]; cols?: 3 | 4 }) {
  const set = new Set(savedIds);
  return (
    <div className={`grid gap-5 sm:grid-cols-2 ${cols === 4 ? "lg:grid-cols-3 xl:grid-cols-4" : "lg:grid-cols-3"}`}>
      {items.map((l, i) => (
        <PropertyCard key={l.id} l={l} saved={set.has(l.id)} priority={i < 4} />
      ))}
    </div>
  );
}
