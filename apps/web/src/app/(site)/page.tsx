import Link from "next/link";
import Image from "next/image";
import { sql } from "drizzle-orm";
import { Home, Building, LandPlot, Store, Trees, HardHat, KeyRound, Sparkles, Calculator, TrendingUp, Landmark, Hammer, Scale, ArrowRight, ShieldCheck, LineChart, Building2, MapPinned, Receipt, Ruler, Flame, Lock, MessageCircle } from "lucide-react";
import { createSearchEngine } from "@propertyx/search";
import { listProjects, listPosts, recommendedFor, serveAds, getSetting, listAgents } from "@propertyx/core";
import { formatPKR, PROJECT_STATUS_LABELS, COUNTRY, isUAE } from "@propertyx/shared";
import { db, getUser } from "@/lib/server";
import { HeroSearch } from "@/components/hero-search";
import { PropertyGrid } from "@/components/property-card";
import { VerificationBadge } from "@/components/badges";
import { AiPromptBox } from "@/components/ai-prompt-box";
import { FloatingAssistant } from "@/components/ai/floating-assistant";
import { savedIdsFor } from "@/lib/queries";
import { getT } from "@/lib/i18n-server";

export const revalidate = 0;

const CATEGORIES = isUAE
  ? [
      { label: "Apartments", href: "/buy/apartment", icon: Building },
      { label: "Villas", href: "/buy/villa", icon: Home },
      { label: "Penthouses", href: "/buy/penthouse", icon: Building2 },
      { label: "Off-plan", href: "/buy?completion=off_plan", icon: HardHat },
      { label: "Commercial", href: "/commercial-property", icon: Store },
      { label: "Plots", href: "/plots-for-sale", icon: LandPlot },
      { label: "Rentals", href: "/rent", icon: KeyRound },
    ]
  : [
      { label: "Houses", href: "/buy/house", icon: Home },
      { label: "Flats", href: "/buy/flat", icon: Building },
      { label: "Plots", href: "/plots-for-sale", icon: LandPlot },
      { label: "Commercial", href: "/commercial-property", icon: Store },
      { label: "Farmhouses", href: "/buy/farmhouse", icon: Trees },
      { label: "New Projects", href: "/projects", icon: HardHat },
      { label: "Rentals", href: "/rent", icon: KeyRound },
    ];

const TOOLS = [
  { label: "AI Property Assistant", desc: "Describe what you need in plain words.", href: "/ai", icon: Sparkles },
  { label: "What's My Property Worth?", desc: "Indicative value from comparable listings.", href: "/tools/property-value", icon: LineChart },
  { label: "Investment Advisor", desc: "Yield, ROI, cash flow and a clear score.", href: "/tools/investment", icon: TrendingUp },
  isUAE
    ? { label: "Mortgage Calculator", desc: "Monthly payment with UAE loan limits.", href: "/tools/home-loan", icon: Landmark }
    : { label: "Home Finance", desc: "Conventional and Islamic financing.", href: "/tools/home-loan", icon: Landmark },
  { label: "Installment Planner", desc: "Full schedule for any payment plan.", href: "/tools/installment", icon: Calculator },
  isUAE
    ? { label: "Buying Costs", desc: "DLD 4% fee and every other cost.", href: "/tools/buying-costs", icon: Receipt }
    : { label: "Construction Cost", desc: "Grey structure to finishing, itemised.", href: "/tools/construction-cost", icon: Hammer },
].filter((x) => !isUAE || x.href !== "/tools/construction-cost");

const EXPLORE = [
  { label: "New Projects", desc: "The best investment opportunities", href: "/projects", icon: Building2 },
  isUAE
    ? { label: "Buying Costs Calculator", desc: "DLD fee, trustee, agent and bank costs", href: "/tools/buying-costs", icon: Receipt }
    : { label: "Construction Cost Calculator", desc: "Get construction cost estimate", href: "/tools/construction-cost", icon: Hammer },
  { label: isUAE ? "Mortgage Calculator" : "Home Loan Calculator", desc: isUAE ? "UAE loan limits, payments and fees" : "Find affordable loan packages", href: "/tools/home-loan", icon: Landmark },
  { label: "Area Guides", desc: isUAE ? "Explore communities across the UAE" : "Explore housing societies in Pakistan", href: "/areas", icon: MapPinned },
  { label: isUAE ? "Map Search" : "Plot Finder", desc: isUAE ? "Find homes in any community on the map" : "Find plots in any housing society", href: "/map", icon: LandPlot },
  { label: "Property Index", desc: "Track changes in real estate prices", href: "/price-index", icon: LineChart },
  { label: "Area Unit Converter", desc: "Convert any area unit instantly", href: "/tools/area-unit-converter", icon: Ruler },
  { label: "Property Trends", desc: "Find popular areas to buy property", href: "/trends", icon: Flame },
].filter((x) => !isUAE || x.href !== "/tools/construction-cost");

export default async function HomePage() {
  const [user, t] = await Promise.all([getUser(), getT()]);
  const engine = createSearchEngine(db);
  const homepage = (await getSetting<{ heroTitle: string; heroSubtitle: string; featuredCities: string[]; sections: Record<string, boolean>; announcement: string }>(db, "homepage"))!;
  const [featured, rentals, projects, posts, rec, banner, cityCounts, agents] = await Promise.all([
    engine.search({ sort: "recommended", pageSize: 8, purpose: "sale" }),
    engine.search({ sort: "newest", pageSize: 4, purpose: "rent" }),
    listProjects(db),
    listPosts(db, {}),
    user ? recommendedFor(db, user.id, 4) : Promise.resolve(null),
    serveAds(db, "homepage_banner"),
    db.execute<{ slug: string; name: string; n: number }>(sql`
      select c.slug, c.name, count(l.id)::int as n from cities c
      left join properties p on p.city_id = c.id left join property_listings l on l.property_id = p.id and l.status = 'active'
      group by c.slug, c.name, c.sort_order having count(l.id) > 0 order by c.sort_order, c.name`),
    listAgents(db, { verified: true }),
  ]);
  const saved = user ? await savedIdsFor(user.id) : [];
  const ad = banner[0];

  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-brand-950">
        <Image src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=2000&q=70" alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-45" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-950/60 via-brand-950/40 to-brand-950/90" />
        <div className="container-px pb-14 pt-12 sm:pb-20 sm:pt-20">
          {homepage.announcement && <p className="mb-4 inline-block rounded-full bg-gold-500/20 px-4 py-1 text-sm text-gold-100 ring-1 ring-gold-400/40">{homepage.announcement}</p>}
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] text-white sm:text-6xl">{t(homepage.heroTitle)}</h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-50/90">{t(homepage.heroSubtitle)}</p>
          <div className="mt-8 max-w-3xl">
            <HeroSearch />
          </div>

          {/* LIVE MARKET INTELLIGENCE TICKER */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs text-brand-100/90">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-gold-300">
              <TrendingUp className="h-3.5 w-3.5" /> {t("Market Pulse:")}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15 backdrop-blur">
              Lahore DHA 6: <strong className="text-white">PKR 12.8L/marla</strong> <span className="text-emerald-400 font-semibold">(+8.4% YoY)</span>
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15 backdrop-blur">
              Islamabad Bahria: <strong className="text-white">PKR 7.9L/marla</strong> <span className="text-emerald-400 font-semibold">(+6.2% YoY)</span>
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15 backdrop-blur">
              Karachi Clifton: <strong className="text-white">PKR 24.2L/marla</strong> <span className="text-emerald-400 font-semibold">(+10.5% YoY)</span>
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {CATEGORIES.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20">
                <Icon className="h-4 w-4 text-gold-300" /> {t(label)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST STRIP (THE 4 PILLARS THAT SURPASS ZAMEEN) */}
      <section className="border-b border-slate-200 bg-white">
        <div className="container-px grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 py-4 sm:py-5 text-xs lg:text-sm text-slate-700">
          <p className="flex items-center gap-2 font-medium tracking-tight"><ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-brand-600 shrink-0" /> <span>{t("Verified Title Deeds (Zero Ghost Ads)")}</span></p>
          <p className="flex items-center gap-2 font-medium tracking-tight"><Lock className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 shrink-0" /> <span>{t("Digital Bayana (100% Escrow Refund Guarantee)")}</span></p>
          <p className="flex items-center gap-2 font-medium tracking-tight"><LineChart className="h-4 w-4 sm:h-5 sm:w-5 text-gold-600 shrink-0" /> <span>{t("Hedonic AVM (Transparent Price CI Ranges)")}</span></p>
          <p className="flex items-center gap-2 font-medium tracking-tight"><MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 text-[#25D366] shrink-0" /> <span>{t("WhatsApp-Native (Direct Verified Chat)")}</span></p>
        </div>
      </section>

      {/* EXPLORE MORE */}
      <section className="container-px mt-14">
        <h2 className="section-title">{t("Explore more on Bismillah")}</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {EXPLORE.map(({ label, desc, href, icon: Icon }) => (
            <Link key={href} href={href} className="card group flex flex-col items-start gap-3 p-4 hover:border-brand-300 sm:flex-row sm:items-center sm:p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-700 group-hover:text-white">
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-snug text-slate-900 group-hover:text-brand-700">{t(label)}</span>
                <span className="mt-0.5 block text-xs text-slate-500 sm:text-sm">{t(desc)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURED */}
      {homepage.sections.featured !== false && (
        <section className="container-px mt-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="section-title">{t("Featured properties")}</h2>
              <p className="mt-1 text-slate-500">{t(`Hand-picked and promoted listings across ${COUNTRY.inName}`)}</p>
            </div>
            <Link href="/search?purpose=sale" className="hidden items-center gap-1 text-sm font-semibold text-brand-700 sm:flex">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <PropertyGrid items={featured.items} savedIds={saved} />
        </section>
      )}

      {/* AI */}
      <section className="container-px mt-16">
        <div className="grid items-center gap-8 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-900 to-night p-6 sm:p-10 lg:grid-cols-2">
          <div>
            <span className="badge bg-gold-500/20 text-gold-200 ring-1 ring-gold-400/40">
              <Sparkles className="h-3.5 w-3.5" /> {t("AI Property Assistant")}
            </span>
            <h2 className="mt-3 text-3xl font-extrabold text-white">{t("Tell us what you need. We'll find it and explain why.")}</h2>
            <p className="mt-3 text-brand-100/80">{t(
                isUAE
                  ? "Searches live listings only — it never invents properties or prices. Refine in plain words: “show cheaper options”, “only with sea view”, “ready to move in”."
                  : "Searches live listings only — it never invents properties or prices. Refine in plain words: “show cheaper options”, “only corner houses”, “with possession”.",
              )}</p>
          </div>
          <AiPromptBox />
        </div>
      </section>

      {/* RECOMMENDED */}
      {rec && rec.items.length > 0 && homepage.sections.recommended !== false && (
        <section className="container-px mt-16">
          <h2 className="section-title">{t("Recommended for you")}</h2>
          <p className="mb-6 mt-1 text-slate-500">Based on what you've viewed and saved{rec.basis !== "popular" ? ` — ${rec.basis}` : ""}</p>
          <PropertyGrid items={rec.items} savedIds={saved} />
        </section>
      )}

      {/* AD BANNER */}
      {ad && (
        <section className="container-px mt-16">
          <a href={`/api/v1/ads/${ad.id}/click`} rel="sponsored" className="group relative flex min-h-[180px] items-center overflow-hidden rounded-3xl bg-slate-900 p-8 text-white">
            {ad.imageUrl && <Image src={ad.imageUrl} alt="" fill sizes="100vw" className="object-cover opacity-40 transition group-hover:scale-105" />}
            <div className="relative">
              <span className="badge bg-white/20 text-white">{t("Sponsored")}</span>
              <p className="mt-2 text-2xl font-bold">{ad.title}</p>
              {ad.body && <p className="mt-1 text-slate-200">{ad.body}</p>}
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gold-300">
                Learn more <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </a>
        </section>
      )}

      {/* CITIES */}
      {homepage.sections.cities !== false && (
        <section className="container-px mt-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="section-title">{t("Explore by city")}</h2>
              <p className="mt-1 text-slate-500">{t("Live listing counts from Bismillah")}</p>
            </div>
            <Link href="/areas" className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
              All cities <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cityCounts
              .filter((c) => homepage.featuredCities.includes(c.slug))
              .map((c) => (
                <Link key={c.slug} href={`/area/${c.slug}`} className="card group flex items-center justify-between p-4 hover:border-brand-300">
                  <span>
                    <span className="block font-bold text-slate-900 group-hover:text-brand-700">{t(c.name)}</span>
                    <span className="text-sm text-slate-500">{t("{n} properties", { n: c.n.toLocaleString() })}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600" />
                </Link>
              ))}
          </div>
        </section>
      )}

      {/* PROJECTS */}
      {homepage.sections.projects !== false && projects.length > 0 && (
        <section className="container-px mt-16">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="section-title">{t("New projects")}</h2>
              <p className="mt-1 text-slate-500">{t("Apartments, villas and plots with payment plans")}</p>
            </div>
            <Link href="/projects" className="flex items-center gap-1 text-sm font-semibold text-brand-700">
              All projects <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 6).map((p) => (
              <Link key={p.id} href={`/project/${p.slug}`} className="card group overflow-hidden">
                <div className="relative aspect-[16/10] bg-slate-100">
                  {p.cover && <Image src={p.cover} alt={p.name} fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />}
                  <span className="badge absolute start-3 top-3 bg-white/95 text-slate-800">{PROJECT_STATUS_LABELS[p.status as keyof typeof PROJECT_STATUS_LABELS]}</span>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold-600">{p.developerName}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 group-hover:text-brand-700">{p.name}</p>
                  <p className="text-sm text-slate-500">{[p.locationName, p.cityName].filter(Boolean).join(", ")}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                    <span className="text-slate-500">{t("From")}</span>
                    <span className="font-bold text-slate-900">{p.minPrice ? formatPKR(p.minPrice) : "On request"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* RENTALS */}
      <section className="container-px mt-16">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="section-title">{t("Latest rentals")}</h2>
            <p className="mt-1 text-slate-500">{t("Freshly listed homes for rent")}</p>
          </div>
          <Link href="/rent" className="flex items-center gap-1 text-sm font-semibold text-brand-700">
            All rentals <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <PropertyGrid items={rentals.items} savedIds={saved} />
      </section>

      {/* TOOLS */}
      {homepage.sections.tools !== false && (
        <section className="container-px mt-16">
          <h2 className="section-title">{t("Smarter decisions")}</h2>
          <p className="mb-6 mt-1 text-slate-500">{t(`Free calculators built for ${COUNTRY.adjective} property`)}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map(({ label, desc, href, icon: Icon }) => (
              <Link key={href} href={href} className="card group flex items-start gap-4 p-5 hover:border-brand-300">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-700 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-slate-900">{t(label)}</span>
                  <span className="text-sm text-slate-500">{t(desc)}</span>
                </span>
              </Link>
            ))}
          </div>
          <Link href="/compare" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
            <Scale className="h-4 w-4" /> Compare up to 4 properties side by side
          </Link>
        </section>
      )}

      {/* AGENTS */}
      {homepage.sections.agents !== false && agents.items.length > 0 && (
        <section className="container-px mt-16">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="section-title">{t("Verified agents")}</h2>
              <p className="mt-1 text-slate-500">{t("Identity-checked professionals")}</p>
            </div>
            <Link href="/agents" className="flex items-center gap-1 text-sm font-semibold text-brand-700">
              Find an agent <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {agents.items.slice(0, 4).map((a) => (
              <Link key={a.id} href={`/agents/${a.slug}`} className="card p-5 text-center hover:border-brand-300">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-800">{a.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
                <p className="mt-3 font-semibold text-slate-900">{a.name}</p>
                <p className="truncate text-xs text-slate-500">{a.agencyName}</p>
                <div className="mt-2 flex justify-center">
                  <VerificationBadge level={a.verificationLevel} kind="agent" />
                </div>
                <p className="mt-2 text-xs text-slate-500">{a.activeListings} active listings</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* GUIDES */}
      {homepage.sections.guides !== false && (
        <section className="container-px mt-16">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="section-title">{t("Guides & insights")}</h2>
            <Link href="/blog" className="flex items-center gap-1 text-sm font-semibold text-brand-700">
              All guides <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {posts.items.slice(0, 3).map((p) => (
              <Link key={p.id} href={`/blog/${p.slug}`} className="card group overflow-hidden">
                <div className="relative aspect-[16/9] bg-slate-100">{p.coverImage && <Image src={p.coverImage} alt="" fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover" />}</div>
                <div className="p-5">
                  <p className="font-bold text-slate-900 group-hover:text-brand-700">{p.title}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <FloatingAssistant />
    </>
  );
}
