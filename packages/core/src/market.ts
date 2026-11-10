/**
 * Market analytics computed from listings on the platform (asking prices, not
 * transaction prices). Every consumer must label these as "based on Bismillah
 * listings" — and as demo data while demo_mode is on.
 */
import { sql, eq, and } from "drizzle-orm";
import type { Database } from "@propertyx/database";
import * as s from "@propertyx/database";
import { estimateValue, toSqft, type AreaUnit, type PropertyType, TYPE_GROUPS, type SearchQuery, COUNTRY } from "@propertyx/shared";
import { createSearchEngine, type ListingCard } from "@propertyx/search";
import { getSetting } from "./settings";

type Row = Record<string, unknown>;

export interface IndexFilters {
  city?: string;
  location?: string;
  types?: string[];
  period?: "monthly" | "quarterly" | "yearly";
  months?: number;
}

async function locationFilter(db: Database, f: IndexFilters) {
  const parts = [];
  if (f.city) parts.push(sql`c.slug = ${f.city}`);
  if (f.location) {
    const [loc] = await db.select().from(s.locations).where(eq(s.locations.slug, f.location));
    if (loc) {
      if (loc.kind === "area") parts.push(sql`p.area_id = ${loc.refId}`);
      else if (loc.kind === "society") parts.push(sql`p.society_id = ${loc.refId}`);
      else if (loc.kind === "block") parts.push(sql`p.block_id = ${loc.refId}`);
      else if (loc.kind === "city") parts.push(sql`p.city_id = ${loc.refId}`);
    } else parts.push(sql`false`);
  }
  if (f.types?.length) parts.push(sql`p.type::text in (${sql.join(f.types.map((t) => sql`${t}`), sql`, `)})`);
  return parts.length ? sql.join(parts, sql` and `) : sql`true`;
}

export async function priceIndex(db: Database, f: IndexFilters) {
  const period = f.period ?? "monthly";
  const months = f.months ?? (period === "yearly" ? 36 : 24);
  const trunc = period === "monthly" ? "month" : period === "quarterly" ? "quarter" : "year";
  const where = await locationFilter(db, f);
  const marla = (await getSetting<number>(db, "marla_sqft")) ?? 225;
  const series = await db.execute<Row>(sql`
    select date_trunc(${trunc}, l.published_at) as period,
      percentile_cont(0.5) within group (order by l.price / nullif(p.area_sqft, 0)) filter (where l.purpose = 'sale') as sale_ppsf,
      avg(l.price) filter (where l.purpose = 'sale') as avg_sale_price,
      percentile_cont(0.5) within group (order by l.price / nullif(p.area_sqft, 0)) filter (where l.purpose = 'rent') as rent_ppsf,
      count(*) filter (where l.purpose = 'sale')::int as sale_n,
      count(*) filter (where l.purpose = 'rent')::int as rent_n
    from property_listings l join properties p on p.id = l.property_id join cities c on c.id = p.city_id
    where l.published_at is not null and l.published_at > now() - make_interval(months => ${months})
      and l.status in ('active','sold','rented','expired','paused') and ${where}
    group by 1 order by 1`);
  const demand = await db.execute<Row>(sql`
    select date_trunc(${trunc}, e.created_at) as period, count(*) filter (where e.type = 'view')::int as views, count(*) filter (where e.type in ('lead','visit_request','message'))::int as enquiries
    from listing_events e join property_listings l on l.id = e.listing_id join properties p on p.id = l.property_id join cities c on c.id = p.city_id
    where e.created_at > now() - make_interval(months => ${months}) and ${where} group by 1`);
  const demandBy = new Map(demand.map((d) => [new Date(d.period as string).toISOString(), d]));
  const points = series.map((r) => {
    const key = new Date(r.period as string).toISOString();
    const saleP = r.sale_ppsf != null ? Number(r.sale_ppsf) : null;
    const rentP = r.rent_ppsf != null ? Number(r.rent_ppsf) : null;
    return {
      period: key.slice(0, 10),
      salePricePerSqft: saleP != null ? Math.round(saleP) : null,
      salePricePerMarla: saleP != null ? Math.round(saleP * marla) : null,
      avgSalePrice: r.avg_sale_price != null ? Math.round(Number(r.avg_sale_price)) : null,
      rentPerSqft: rentP != null ? Math.round(rentP * 100) / 100 : null,
      rentalYield: saleP && rentP ? Math.round(((rentP * 12) / saleP) * 1000) / 10 : null,
      supply: Number(r.sale_n) + Number(r.rent_n),
      demand: Number(demandBy.get(key)?.views ?? 0),
      enquiries: Number(demandBy.get(key)?.enquiries ?? 0),
    };
  });
  const withSale = points.filter((p) => p.salePricePerSqft != null && (p.supply ?? 0) >= 2);
  const first = withSale[0];
  const last = withSale[withSale.length - 1];
  const [current] = await db.execute<Row>(sql`
    select percentile_cont(0.5) within group (order by l.price / nullif(p.area_sqft,0)) filter (where l.purpose='sale') as ppsf,
      avg(l.price) filter (where l.purpose='sale') as avg_price,
      percentile_cont(0.5) within group (order by l.price / nullif(p.area_sqft,0)) filter (where l.purpose='rent') as rent_ppsf,
      count(*)::int as n
    from property_listings l join properties p on p.id = l.property_id join cities c on c.id = p.city_id
    where l.status = 'active' and ${where}`);
  const ppsf = current?.ppsf != null ? Number(current.ppsf) : null;
  const rppsf = current?.rent_ppsf != null ? Number(current.rent_ppsf) : null;
  return {
    period,
    points,
    summary: {
      activeListings: Number(current?.n ?? 0),
      avgPrice: current?.avg_price != null ? Math.round(Number(current.avg_price)) : null,
      pricePerSqft: ppsf != null ? Math.round(ppsf) : null,
      pricePerMarla: ppsf != null ? Math.round(ppsf * marla) : null,
      rentalYield: ppsf && rppsf ? Math.round(((rppsf * 12) / ppsf) * 1000) / 10 : null,
      growthPct: first && last && first !== last ? Math.round(((last.salePricePerSqft! - first.salePricePerSqft!) / first.salePricePerSqft!) * 1000) / 10 : null,
      growthFrom: first?.period ?? null,
      demand: points.reduce((t, p) => t + p.demand, 0),
      supply: points.reduce((t, p) => t + p.supply, 0),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Area / society pages                                                 */
/* ------------------------------------------------------------------ */

export async function getLocationPage(db: Database, slug: string) {
  const [loc] = await db.select().from(s.locations).where(eq(s.locations.slug, slug));
  if (!loc) return null;
  const [city] = loc.cityId ? await db.select().from(s.cities).where(eq(s.cities.id, loc.cityId)) : [];
  const parent = loc.parentId ? (await db.select().from(s.locations).where(eq(s.locations.id, loc.parentId)))[0] ?? null : null;
  const filter: IndexFilters = loc.kind === "city" ? { city: loc.slug } : { location: loc.slug };
  const where = await locationFilter(db, filter);
  const marla = (await getSetting<number>(db, "marla_sqft")) ?? 225;

  const typeCounts = await db.execute<Row>(sql`
    select p.type, l.purpose, count(*)::int as n from property_listings l join properties p on p.id = l.property_id join cities c on c.id = p.city_id
    where l.status = 'active' and ${where} group by 1, 2 order by n desc`);
  // median prices for common size bands
  const bands = [
    { label: "5 Marla", sqft: 5 * marla },
    { label: "10 Marla", sqft: 10 * marla },
    { label: "1 Kanal", sqft: 20 * marla },
  ];
  const priceTable: { size: string; house: number | null; plot: number | null; rent: number | null }[] = [];
  // UAE: by bedrooms — apartment sale, villa / townhouse sale, yearly rent
  if (COUNTRY.code === "ae")
    for (const beds of [1, 2, 3, 4]) {
      const [r] = await db.execute<Row>(sql`
        select percentile_cont(0.5) within group (order by l.price) filter (where l.purpose='sale' and p.type in ('apartment','flat','penthouse','hotel_apartment')) as apt,
          percentile_cont(0.5) within group (order by l.price) filter (where l.purpose='sale' and p.type in ('villa','townhouse','house')) as villa,
          percentile_cont(0.5) within group (order by l.price) filter (where l.purpose='rent') as rent
        from property_listings l join properties p on p.id = l.property_id join cities c on c.id = p.city_id
        where l.status in ('active','sold','rented') and ${where} and ${beds === 4 ? sql`p.beds >= 4` : sql`p.beds = ${beds}`}`);
      priceTable.push({ size: beds === 4 ? "4+ Bed" : `${beds} Bed`, house: r?.apt != null ? Math.round(Number(r.apt)) : null, plot: r?.villa != null ? Math.round(Number(r.villa)) : null, rent: r?.rent != null ? Math.round(Number(r.rent)) : null });
    }
  for (const b of COUNTRY.code === "ae" ? [] : bands) {
    const [r] = await db.execute<Row>(sql`
      select percentile_cont(0.5) within group (order by l.price) filter (where l.purpose='sale' and p.type in ('house','villa')) as house,
        percentile_cont(0.5) within group (order by l.price) filter (where l.purpose='sale' and p.type = 'residential_plot') as plot,
        percentile_cont(0.5) within group (order by l.price) filter (where l.purpose='rent' and p.type in ('house','villa')) as rent,
        count(*)::int as n
      from property_listings l join properties p on p.id = l.property_id join cities c on c.id = p.city_id
      where l.status in ('active','sold','rented') and ${where} and p.area_sqft between ${b.sqft * 0.9} and ${b.sqft * 1.1}`);
    priceTable.push({ size: b.label, house: r?.house != null ? Math.round(Number(r.house)) : null, plot: r?.plot != null ? Math.round(Number(r.plot)) : null, rent: r?.rent != null ? Math.round(Number(r.rent)) : null });
  }
  const [apt] = await db.execute<Row>(sql`
    select percentile_cont(0.5) within group (order by l.price / nullif(p.area_sqft,0)) filter (where l.purpose='sale') as sale_ppsf,
      percentile_cont(0.5) within group (order by l.price) filter (where l.purpose='rent') as rent
    from property_listings l join properties p on p.id = l.property_id join cities c on c.id = p.city_id
    where l.status in ('active','sold','rented') and p.type in ('apartment','flat') and ${where}`);

  const children = await db.execute<Row>(sql`
    select x.slug, x.name, x.kind, x.active_listings from locations x where x.parent_id = ${loc.id} order by x.active_listings desc, x.name limit 24`);
  const agents = await db.execute<Row>(sql`
    select a.id, a.slug, a.display_name, a.photo_url, a.verification_level, a.rating_avg, a.reviews_count, ag.name as agency_name,
      (select count(*)::int from property_listings l where l.agent_id = a.id and l.status = 'active') as listings
    from agents a left join agencies ag on ag.id = a.agency_id
    where a.id in (select agent_id from agent_areas where location_id = ${loc.id} or location_id in (select id from locations where parent_id = ${loc.id}))
       ${loc.kind === "city" ? sql`or ag.city_id = ${loc.refId}` : sql``}
    order by a.verification_level desc, listings desc limit 8`);
  const projects = await db.execute<Row>(sql`
    select pr.id, pr.slug, pr.name, pr.status, pr.min_price, pr.cover_image, d.name as developer_name
    from projects pr join developers d on d.id = pr.developer_id
    where pr.publish_status = 'published' and ${loc.kind === "city" ? sql`pr.city_id = ${loc.refId}` : sql`pr.location_id in (select id from locations where id = ${loc.id} or parent_id = ${loc.id})`}
    order by pr.is_featured desc limit 6`);
  const [guide] = await db.select().from(s.areaGuides).where(and(eq(s.areaGuides.locationId, loc.id), eq(s.areaGuides.status, "published")));
  const index = await priceIndex(db, { ...filter, period: "quarterly", months: 24 });
  const demo = await getSetting<boolean>(db, "demo_mode");
  return {
    location: loc,
    city: city ?? null,
    parent,
    typeCounts: typeCounts.map((r) => ({ type: r.type as PropertyType, purpose: r.purpose as string, count: Number(r.n) })),
    priceTable,
    apartments: { salePricePerSqft: apt?.sale_ppsf != null ? Math.round(Number(apt.sale_ppsf)) : null, medianRent: apt?.rent != null ? Math.round(Number(apt.rent)) : null },
    children: children.map((c) => ({ slug: c.slug as string, name: c.name as string, kind: c.kind as string, activeListings: Number(c.active_listings) })),
    agents: agents.map((a) => ({ id: a.id as string, slug: a.slug as string, name: a.display_name as string, photo: (a.photo_url as string) ?? null, verificationLevel: Number(a.verification_level), rating: Number(a.rating_avg), reviews: Number(a.reviews_count), agencyName: (a.agency_name as string) ?? null, listings: Number(a.listings) })),
    projects: projects.map((p) => ({ id: p.id as string, slug: p.slug as string, name: p.name as string, status: p.status as string, minPrice: p.min_price != null ? Number(p.min_price) : null, cover: (p.cover_image as string) ?? null, developerName: p.developer_name as string })),
    guide: guide ?? null,
    index,
    isDemoData: !!demo,
  };
}

/* ------------------------------------------------------------------ */
/* Valuation ("What's my property worth?")                              */
/* ------------------------------------------------------------------ */

export interface ValuationInput {
  city: string;
  location?: string;
  type: PropertyType;
  areaValue: number;
  areaUnit: AreaUnit;
  beds?: number | null;
  baths?: number | null;
  condition?: "brand_new" | "good" | "old" | "under_construction";
  floor?: number | null;
  corner?: boolean;
  parkFacing?: boolean;
  mainBoulevard?: boolean;
  westOpen?: boolean;
  purpose?: "sale" | "rent";
}

export async function valueProperty(db: Database, v: ValuationInput) {
  const marla = (await getSetting<number>(db, "marla_sqft")) ?? 225;
  const sqft = toSqft(v.areaValue, v.areaUnit, marla);
  const purpose = v.purpose ?? "sale";
  const similarTypes = ["house", "villa"].includes(v.type) ? ["house", "villa"] : ["flat", "apartment"].includes(v.type) ? ["flat", "apartment"] : [v.type];
  const run = async (scope: "location" | "city", band: number) => {
    const where = await locationFilter(db, scope === "location" && v.location ? { location: v.location, types: similarTypes } : { city: v.city, types: similarTypes });
    return db.execute<Row>(sql`
      select l.id, l.price / nullif(p.area_sqft,0) as ppsf, abs(p.area_sqft - ${sqft}) as size_diff
      from property_listings l join properties p on p.id = l.property_id join cities c on c.id = p.city_id
      where ${where} and l.purpose = ${purpose} and l.status in ('active','sold','rented','expired')
        and coalesce(l.published_at, l.created_at) > now() - interval '24 months'
        and p.area_sqft between ${sqft * (1 - band)} and ${sqft * (1 + band)}
        ${v.beds != null && TYPE_GROUPS.homes.includes(v.type) ? sql`and p.beds between ${Math.max(0, v.beds - 1)} and ${v.beds + 1}` : sql``}
      order by size_diff limit 60`);
  };
  let scope: "location" | "city" = v.location ? "location" : "city";
  let comps = await run(scope, 0.25);
  if (comps.length < 6 && scope === "location") comps = await run(scope, 0.5);
  if (comps.length < 6) {
    scope = "city";
    comps = await run("city", 0.35);
  }
  const est = estimateValue(
    comps.map((c) => Number(c.ppsf)),
    sqft,
    {
      condition: v.condition,
      corner: v.corner,
      parkFacing: v.parkFacing,
      mainBoulevard: v.mainBoulevard,
      westOpen: v.westOpen,
      floor: v.floor,
    },
  );
  const cards = await createSearchEngine(db).cardsByIds(comps.slice(0, 6).map((c) => c.id as string), { anyStatus: true });
  return { input: v, sqft, scope, estimate: est, comparables: cards, isDemoData: !!(await getSetting<boolean>(db, "demo_mode")) };
}

/* ------------------------------------------------------------------ */
/* Investment opportunities                                             */
/* ------------------------------------------------------------------ */

export interface Opportunity {
  slug: string;
  name: string;
  cityName: string;
  citySlug: string;
  kind: string;
  medianPricePerSqft: number;
  medianHomePrice: number | null;
  rentalYield: number | null;
  appreciation12m: number | null;
  demandPerListing: number;
  activeListings: number;
  installmentListings: number;
  commercialListings: number;
  score: number;
  categories: string[];
}

export async function investmentOpportunities(db: Database, opts: { city?: string } = {}) {
  const weights = (await getSetting<{ yield: number; appreciation: number; demand: number; affordability: number }>(db, "investment_weights")) ?? { yield: 0.35, appreciation: 0.3, demand: 0.2, affordability: 0.15 };
  const rows = await db.execute<Row>(sql`
    with base as (
      select x.slug, x.name, x.kind, c.name as city_name, c.slug as city_slug, l.id, l.purpose, l.status, l.price, p.area_sqft, p.type, l.published_at, l.installment_available, p.category
      from property_listings l join properties p on p.id = l.property_id join cities c on c.id = p.city_id
      join locations x on x.kind in ('area','society') and x.ref_id = coalesce(p.society_id, p.area_id)
      where l.status in ('active','sold','rented','expired') ${opts.city ? sql`and c.slug = ${opts.city}` : sql``})
    select slug, name, kind, city_name, city_slug,
      percentile_cont(0.5) within group (order by price / nullif(area_sqft,0)) filter (where purpose='sale' and status='active') as ppsf_now,
      percentile_cont(0.5) within group (order by price / nullif(area_sqft,0)) filter (where purpose='sale' and published_at between now() - interval '18 months' and now() - interval '9 months') as ppsf_then,
      percentile_cont(0.5) within group (order by price / nullif(area_sqft,0)) filter (where purpose='sale' and type in ('house','apartment','flat','villa')) as home_ppsf,
      percentile_cont(0.5) within group (order by price / nullif(area_sqft,0)) filter (where purpose='rent' and type in ('house','apartment','flat','villa')) as rent_ppsf,
      percentile_cont(0.5) within group (order by price) filter (where purpose='sale' and type in ('house','apartment','flat','villa')) as home_price,
      count(*) filter (where status='active')::int as active,
      count(*) filter (where status='active' and installment_available)::int as installments,
      count(*) filter (where status='active' and category='commercial')::int as commercial,
      (select count(*)::int from listing_events e where e.listing_id in (select b2.id from base b2 where b2.slug = base.slug) and e.created_at > now() - interval '90 days') as events
    from base group by slug, name, kind, city_name, city_slug having count(*) filter (where status='active') >= 3`);
  const items = rows
    .map((r) => {
      const now = r.ppsf_now != null ? Number(r.ppsf_now) : null;
      const then = r.ppsf_then != null ? Number(r.ppsf_then) : null;
      const homePpsf = r.home_ppsf != null ? Number(r.home_ppsf) : null;
      const rentPpsf = r.rent_ppsf != null ? Number(r.rent_ppsf) : null;
      return {
        slug: r.slug as string,
        name: r.name as string,
        cityName: r.city_name as string,
        citySlug: r.city_slug as string,
        kind: r.kind as string,
        medianPricePerSqft: Math.round(now ?? 0),
        medianHomePrice: r.home_price != null ? Math.round(Number(r.home_price)) : null,
        rentalYield: homePpsf && rentPpsf ? Math.round(((rentPpsf * 12) / homePpsf) * 1000) / 10 : null,
        appreciation12m: now && then ? Math.round(((now - then) / then) * 1000) / 10 : null,
        demandPerListing: Math.round((Number(r.events) / Math.max(1, Number(r.active))) * 10) / 10,
        activeListings: Number(r.active),
        installmentListings: Number(r.installments),
        commercialListings: Number(r.commercial),
        score: 0,
        categories: [] as string[],
      } satisfies Opportunity;
    })
    .filter((o) => o.medianPricePerSqft > 0);
  // normalise each signal to 0..1 across the set
  const norm = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x != null);
    const min = Math.min(...v);
    const max = Math.max(...v);
    return (x: number | null) => (x == null || max === min ? 0.5 : (x - min) / (max - min));
  };
  const nY = norm(items.map((i) => i.rentalYield));
  const nA = norm(items.map((i) => i.appreciation12m));
  const nD = norm(items.map((i) => i.demandPerListing));
  const nP = norm(items.map((i) => i.medianPricePerSqft));
  for (const i of items) {
    i.score = Math.round(100 * (weights.yield * nY(i.rentalYield) + weights.appreciation * nA(i.appreciation12m) + weights.demand * nD(i.demandPerListing) + weights.affordability * (1 - nP(i.medianPricePerSqft))));
  }
  const top = (arr: Opportunity[], key: (o: Opportunity) => number | null, n = 6) => [...arr].filter((o) => key(o) != null).sort((a, b) => (key(b) ?? 0) - (key(a) ?? 0)).slice(0, n);
  const sortedPrice = [...items].sort((a, b) => a.medianPricePerSqft - b.medianPricePerSqft);
  const categories = {
    high_rental_yield: top(items, (o) => o.rentalYield),
    high_appreciation: top(items, (o) => o.appreciation12m),
    emerging_areas: top(
      items.filter((o) => o.kind === "society" && o.medianPricePerSqft <= sortedPrice[Math.floor(sortedPrice.length * 0.6)]?.medianPricePerSqft),
      (o) => (o.appreciation12m ?? 0) + o.demandPerListing,
    ),
    affordable_areas: sortedPrice.filter((o) => o.activeListings >= 5).slice(0, 6),
    commercial: top(items.filter((o) => o.commercialListings >= 2), (o) => o.commercialListings),
    installments: top(items.filter((o) => o.installmentListings >= 1), (o) => o.installmentListings),
  };
  for (const [k, list] of Object.entries(categories)) for (const o of list) o.categories.push(k);
  const installmentProjects = await db.execute<Row>(sql`
    select pr.slug, pr.name, pr.status, pr.min_price, pr.cover_image, c.name as city_name, min(pp.down_payment_pct) as min_down, max(pp.duration_months) as max_months
    from projects pr join cities c on c.id = pr.city_id join project_payment_plans pp on pp.project_id = pr.id
    where pr.publish_status = 'published' and pp.duration_months > 1 ${opts.city ? sql`and c.slug = ${opts.city}` : sql``}
    group by pr.id, c.name order by pr.is_featured desc, min(pp.down_payment_pct) limit 8`);
  const overseas = await db.execute<Row>(sql`
    select pr.slug, pr.name, pr.status, pr.min_price, pr.cover_image, c.name as city_name, d.verification_level
    from projects pr join cities c on c.id = pr.city_id join developers d on d.id = pr.developer_id
    where pr.publish_status = 'published' and pr.status in ('ready','near_completion','completed') ${opts.city ? sql`and c.slug = ${opts.city}` : sql``}
    order by d.verification_level desc limit 6`);
  return {
    all: items.sort((a, b) => b.score - a.score),
    categories,
    installmentProjects: installmentProjects.map((p) => ({ slug: p.slug as string, name: p.name as string, status: p.status as string, minPrice: Number(p.min_price), cover: p.cover_image as string, cityName: p.city_name as string, minDown: Number(p.min_down), maxMonths: Number(p.max_months) })),
    overseasPicks: overseas.map((p) => ({ slug: p.slug as string, name: p.name as string, status: p.status as string, minPrice: Number(p.min_price), cover: p.cover_image as string, cityName: p.city_name as string })),
    weights,
    isDemoData: !!(await getSetting<boolean>(db, "demo_mode")),
  };
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                      */
/* ------------------------------------------------------------------ */

export async function recommendedFor(db: Database, userId: string | null, limit = 8): Promise<{ items: ListingCard[]; basis: string }> {
  const engine = createSearchEngine(db);
  if (!userId) {
    const r = await engine.search({ sort: "recommended", pageSize: limit });
    return { items: r.items, basis: "popular" };
  }
  const signals = await db.execute<Row>(sql`
    select c.slug as city, p.type, l.purpose, l.price, p.beds, ue.type as kind
    from user_events ue join property_listings l on l.id = ue.listing_id join properties p on p.id = l.property_id join cities c on c.id = p.city_id
    where ue.user_id = ${userId} and ue.created_at > now() - interval '120 days'
    order by ue.created_at desc limit 80`);
  const saved = await db.select({ query: s.savedSearches.query }).from(s.savedSearches).where(eq(s.savedSearches.userId, userId)).limit(3);
  if (!signals.length && !saved.length) {
    const r = await engine.search({ sort: "recommended", pageSize: limit });
    return { items: r.items, basis: "popular" };
  }
  const tally = <T,>(vals: T[]) => {
    const m = new Map<T, number>();
    vals.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const weight = (r: Row) => (r.kind === "save" ? 3 : 1);
  const expanded = signals.flatMap((r) => Array(weight(r)).fill(r));
  const city = tally(expanded.map((r) => r.city as string))[0] ?? (saved[0]?.query.city as string | undefined);
  const purpose = tally(expanded.map((r) => r.purpose as string))[0] as "sale" | "rent" | undefined;
  const types = tally(expanded.map((r) => r.type as string)).slice(0, 2) as PropertyType[];
  const prices = expanded.filter((r) => r.purpose === purpose).map((r) => Number(r.price)).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const seen = new Set<string>();
  const q: SearchQuery = { city, purpose, types: types.length ? types : undefined, priceMin: median ? Math.round(median * 0.7) : undefined, priceMax: median ? Math.round(median * 1.3) : undefined, pageSize: limit * 2 };
  let r = await engine.search(q);
  if (r.total < limit) r = await engine.search({ ...q, priceMin: undefined, priceMax: undefined });
  const viewedIds = await db.execute<{ listing_id: string }>(sql`select distinct listing_id from user_events where user_id = ${userId} and listing_id is not null`);
  viewedIds.forEach((v) => seen.add(v.listing_id));
  const fresh = r.items.filter((i) => !seen.has(i.id));
  return { items: (fresh.length >= 4 ? fresh : r.items).slice(0, limit), basis: `${types.join(", ") || "properties"} ${purpose === "rent" ? "for rent" : "for sale"}${city ? ` in ${city}` : ""}` };
}

export async function trackSearch(db: Database, userId: string | null, anonId: string | null, q: SearchQuery) {
  if (!userId && !anonId) return;
  await db.insert(s.userEvents).values({ userId, anonId, type: "search", payload: q as Record<string, unknown> });
}

/* ------------------------------------------------------------------ */
/* Area guide directory & property trends                               */
/* ------------------------------------------------------------------ */

/** Areas and societies grouped under their city, busiest first (live active-listing counts). */
export async function listAreaDirectory(db: Database, opts: { city?: string; q?: string; perCity?: number } = {}) {
  const perCity = opts.perCity ?? 12;
  const rows = await db.execute<Row>(sql`
    with counts as (
      select loc.id, count(l.id)::int as n
      from locations loc
      join properties p on (loc.kind = 'society' and p.society_id = loc.ref_id) or (loc.kind = 'area' and p.area_id = loc.ref_id)
      join property_listings l on l.property_id = p.id and l.status = 'active'
      group by loc.id
    ), ranked as (
      select loc.slug, loc.name, loc.kind, c.slug as city_slug, c.name as city_name, c.sort_order, coalesce(k.n, 0) as n,
        row_number() over (partition by c.id order by coalesce(k.n, 0) desc, loc.name) as rk
      from locations loc join cities c on c.id = loc.city_id left join counts k on k.id = loc.id
      where loc.kind in ('area', 'society')
        ${opts.city ? sql`and c.slug = ${opts.city}` : sql``}
        ${opts.q ? sql`and loc.full_name ilike ${"%" + opts.q + "%"}` : sql``}
    )
    select * from ranked where rk <= ${perCity} order by sort_order, city_name, rk`);
  const cities = new Map<string, { slug: string; name: string; areas: { slug: string; name: string; kind: string; activeListings: number }[] }>();
  for (const r of rows) {
    const key = r.city_slug as string;
    if (!cities.has(key)) cities.set(key, { slug: key, name: r.city_name as string, areas: [] });
    cities.get(key)!.areas.push({ slug: r.slug as string, name: r.name as string, kind: r.kind as string, activeListings: Number(r.n) });
  }
  return [...cities.values()];
}

/** Popular areas by buyer interest: views and enquiries in the last 30 days vs the 30 before, plus supply, median price and price change. */
export async function propertyTrends(db: Database, opts: { city?: string; purpose?: "sale" | "rent"; limit?: number } = {}) {
  const purpose = opts.purpose ?? "sale";
  const marla = (await getSetting<number>(db, "marla_sqft")) ?? 225;
  const rows = await db.execute<Row>(sql`
    with ev as (
      select listing_id,
        count(*) filter (where type = 'view' and created_at > now() - interval '30 days')::int as views,
        count(*) filter (where type = 'view' and created_at <= now() - interval '30 days')::int as prev_views,
        count(*) filter (where type in ('lead', 'visit_request', 'message') and created_at > now() - interval '30 days')::int as enquiries
      from listing_events where created_at > now() - interval '60 days' group by 1
    )
    select loc.slug, loc.name, c.slug as city_slug, c.name as city_name,
      count(*) filter (where l.status = 'active')::int as active,
      percentile_cont(0.5) within group (order by l.price / nullif(p.area_sqft, 0)) filter (where l.status = 'active') as ppsf,
      percentile_cont(0.5) within group (order by l.price / nullif(p.area_sqft, 0)) filter (where l.published_at > now() - interval '6 months') as recent_ppsf,
      percentile_cont(0.5) within group (order by l.price / nullif(p.area_sqft, 0)) filter (where l.published_at between now() - interval '18 months' and now() - interval '6 months') as earlier_ppsf,
      count(*) filter (where l.published_at > now() - interval '6 months')::int as recent_n,
      count(*) filter (where l.published_at between now() - interval '18 months' and now() - interval '6 months')::int as earlier_n,
      coalesce(sum(ev.views), 0)::int as views, coalesce(sum(ev.prev_views), 0)::int as prev_views, coalesce(sum(ev.enquiries), 0)::int as enquiries
    from property_listings l
    join properties p on p.id = l.property_id
    join cities c on c.id = p.city_id
    join locations loc on (loc.kind = 'society' and loc.ref_id = p.society_id) or (p.society_id is null and loc.kind = 'area' and loc.ref_id = p.area_id)
    left join ev on ev.listing_id = l.id
    where l.purpose = ${purpose} and l.status in ('active', 'sold', 'rented', 'expired', 'paused')
      ${opts.city ? sql`and c.slug = ${opts.city}` : sql``}
    group by loc.id, loc.slug, loc.name, c.slug, c.name
    having count(*) filter (where l.status = 'active') > 0
    order by views desc, enquiries desc, active desc
    limit ${opts.limit ?? 20}`);
  return rows.map((r) => {
    const views = Number(r.views);
    const prev = Number(r.prev_views);
    const ppsf = r.ppsf != null ? Number(r.ppsf) : null;
    // only report a price change when both periods have enough listings to be meaningful
    const enough = Number(r.recent_n) >= 5 && Number(r.earlier_n) >= 5;
    const recent = enough && r.recent_ppsf != null ? Number(r.recent_ppsf) : null;
    const earlier = enough && r.earlier_ppsf != null ? Number(r.earlier_ppsf) : null;
    return {
      slug: r.slug as string,
      name: r.name as string,
      citySlug: r.city_slug as string,
      cityName: r.city_name as string,
      activeListings: Number(r.active),
      views,
      enquiries: Number(r.enquiries),
      interestChangePct: prev > 0 ? Math.round(((views - prev) / prev) * 1000) / 10 : null,
      pricePerSqft: ppsf != null ? Math.round(ppsf) : null,
      pricePerMarla: ppsf != null ? Math.round(ppsf * marla) : null,
      /** median asking price per sq ft, last 6 months vs the 12 months before */
      priceChangePct: recent && earlier ? Math.round(((recent - earlier) / earlier) * 1000) / 10 : null,
    };
  });
}
