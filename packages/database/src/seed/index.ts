/**
 * Demo dataset. Every row created here has is_seed = true.
 *
 *   seedDemo(db)  -> wipes ALL application tables and loads reference + demo data
 *
 * Demo login accounts (password DEMO_PASSWORD) are listed in DEMO_ACCOUNTS and README.
 */
import { sql } from "drizzle-orm";
import { slugify, PROPERTY_TYPE_LABELS, propertyTypeInfo, type PropertyType } from "@propertyx/shared";
import bcrypt from "bcryptjs";
import type { Database } from "../client";
import * as s from "../schema";
import { syncGeography } from "../geography";
import { syncReferenceData, CITY_COST_MULTIPLIERS, DEFAULT_CONSTRUCTION_RATES } from "../reference";
import { createRng } from "./rng";
import { CITIES } from "./data/locations";
import { AGENCIES, DEVELOPERS, PROJECTS, FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES, SPECIALIZATIONS } from "./data/organizations";
import { IMG } from "./data/images";
import { BLOG_POSTS, AREA_GUIDES } from "./data/content";
import { generateListing } from "./listing-generator";

export const DEMO_PASSWORD = "Demo@12345";
export const DEMO_DOMAIN = "bismillah.test";

export const DEMO_ACCOUNTS = [
  { key: "superadmin", email: `superadmin@${DEMO_DOMAIN}`, name: "Platform Super Admin", roles: ["super_admin"] },
  { key: "admin", email: `admin@${DEMO_DOMAIN}`, name: "Operations Admin", roles: ["admin"] },
  { key: "moderator", email: `moderator@${DEMO_DOMAIN}`, name: "Trust & Safety Moderator", roles: ["moderator"] },
  { key: "support", email: `support@${DEMO_DOMAIN}`, name: "Customer Support Agent", roles: ["support"] },
  { key: "buyer", email: `buyer@${DEMO_DOMAIN}`, name: "Ali Raza", roles: ["buyer", "investor"] },
  { key: "seller", email: `seller@${DEMO_DOMAIN}`, name: "Nadia Hussain", roles: ["seller"] },
  { key: "agent", email: `agent@${DEMO_DOMAIN}`, name: "Usman Tariq", roles: ["agent"] },
  { key: "agency", email: `agency@${DEMO_DOMAIN}`, name: "Kamran Qureshi", roles: ["agency", "agent"] },
  { key: "developer", email: `developer@${DEMO_DOMAIN}`, name: "Farah Siddiqui", roles: ["developer"] },
  { key: "landlord", email: `landlord@${DEMO_DOMAIN}`, name: "Tariq Mehmood", roles: ["landlord", "seller"] },
  { key: "tenant", email: `tenant@${DEMO_DOMAIN}`, name: "Hira Saleem", roles: ["tenant", "buyer"] },
  { key: "investor", email: `investor@${DEMO_DOMAIN}`, name: "Bilal Ahmed", roles: ["investor", "buyer"] },
  { key: "manager", email: `manager@${DEMO_DOMAIN}`, name: "Saad Property Management", roles: ["property_manager"] },
  { key: "builder", email: `builder@${DEMO_DOMAIN}`, name: "Brickline Construction", roles: ["construction_company"] },
] as const;

type LStatus = NonNullable<(typeof s.propertyListings.$inferInsert)["status"]>;
type LSource = NonNullable<(typeof s.leads.$inferInsert)["source"]>;

const chunk = <T,>(arr: T[], n = 400): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const DAY = 86_400_000;

function demoPhone(n: number) {
  // Demo numbers in a single fixed block; the UI disables call/WhatsApp for demo listings.
  return `+9230000${String(n % 100000).padStart(5, "0")}`;
}

export async function wipeAll(db: Database) {
  const rows = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

export async function seedDemo(db: Database, opts: { log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const rng = createRng();
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const ahead = (days: number) => new Date(now.getTime() + days * DAY);
  const rid = (len = 5) => {
    let x = "";
    for (let i = 0; i < len; i++) x += "abcdefghijkmnpqrstuvwxyz23456789"[rng.int(0, 31)];
    return x;
  };

  log("• wiping tables");
  await wipeAll(db);
  log("• reference data");
  await syncReferenceData(db, { geography: false });
  await db.insert(s.siteSettings).values({ key: "demo_mode", value: true }).onConflictDoUpdate({ target: s.siteSettings.key, set: { value: true } });

  const roleRows = await db.select().from(s.roles);
  const roleId = new Map(roleRows.map((r) => [r.key, r.id]));
  const featureRows = await db.select().from(s.features);
  const featureId = new Map(featureRows.map((f) => [f.key, f.id]));
  const planRows = await db.select().from(s.subscriptionPlans);
  const planId = new Map(planRows.map((p) => [p.key, p.id]));

  /* ---------------- geography ---------------- */
  log("• locations");
  const provinceNames = [...new Set(CITIES.map((c) => c.province))];
  const provinces = await db
    .insert(s.provinces)
    .values(provinceNames.map((name) => ({ name, slug: slugify(name), isSeed: true })))
    .returning();
  const provinceId = new Map(provinces.map((p) => [p.name, p.id]));
  const locationRows: (typeof s.locations.$inferInsert)[] = [];
  for (const p of provinces) locationRows.push({ kind: "province", refId: p.id, name: p.name, fullName: p.name, slug: `province-${p.slug}`, isSeed: true });

  type LocRef = { cityIdx: number; locIdx: number; areaId: string | null; societyId: string | null; slug: string; blocks: { name: string; id: string; slug: string }[] };
  const cityIds: string[] = [];
  const locRefs: LocRef[][] = [];
  for (const [ci, c] of CITIES.entries()) {
    const citySlug = slugify(c.name);
    const [city] = await db
      .insert(s.cities)
      .values({ provinceId: provinceId.get(c.province)!, name: c.name, slug: citySlug, district: c.district, lat: c.lat, lng: c.lng, isMajor: true, description: c.description, sortOrder: ci, isSeed: true })
      .returning();
    cityIds.push(city.id);
    locationRows.push({ kind: "city", refId: city.id, cityId: city.id, name: c.name, fullName: `${c.name}, ${c.province}`, slug: citySlug, lat: c.lat, lng: c.lng, overview: c.description, isSeed: true });
    await db.insert(s.constructionRates).values({ cityId: city.id, rates: { ...DEFAULT_CONSTRUCTION_RATES, cityMultiplier: CITY_COST_MULTIPLIERS[citySlug] ?? 1 } });

    const refs: LocRef[] = [];
    for (const [li, l] of c.locs.entries()) {
      const base = slugify(l.name);
      const slug = base.includes(citySlug) ? base : `${base}-${citySlug}`;
      let areaId: string | null = null;
      let societyId: string | null = null;
      if (l.kind === "area") {
        const [a] = await db.insert(s.areas).values({ cityId: city.id, name: l.name, slug, lat: l.lat, lng: l.lng, description: l.description, isSeed: true }).returning();
        areaId = a.id;
      } else {
        const [so] = await db.insert(s.societies).values({ cityId: city.id, name: l.name, slug, lat: l.lat, lng: l.lng, description: l.description, approvalAuthority: l.authority ?? null, isSeed: true }).returning();
        societyId = so.id;
      }
      const refId = (areaId ?? societyId)!;
      locationRows.push({
        kind: l.kind,
        refId,
        cityId: city.id,
        name: l.name,
        fullName: `${l.name}, ${c.name}`,
        slug,
        lat: l.lat,
        lng: l.lng,
        overview: l.description,
        highlights: l.highlights ?? [],
        investmentOutlook: null,
        isSeed: true,
      });
      const blocks: LocRef["blocks"] = [];
      for (const b of l.blocks ?? []) {
        const bslug = `${slugify(b)}-${slug}`;
        const [blk] = await db
          .insert(s.blocks)
          .values({ cityId: city.id, societyId, areaId, name: b, slug: bslug, lat: l.lat + (rng.next() - 0.5) * 0.02, lng: l.lng + (rng.next() - 0.5) * 0.02, isSeed: true })
          .returning();
        blocks.push({ name: b, id: blk.id, slug: bslug });
        locationRows.push({ kind: "block", refId: blk.id, cityId: city.id, name: b, fullName: `${b}, ${l.name}, ${c.name}`, slug: bslug, lat: blk.lat, lng: blk.lng, isSeed: true });
      }
      refs.push({ cityIdx: ci, locIdx: li, areaId, societyId, slug, blocks });
    }
    locRefs.push(refs);
  }
  for (const part of chunk(locationRows)) await db.insert(s.locations).values(part);
  // every other Pakistani city (no localities / demo listings)
  await syncGeography(db);
  const allLocs = await db.select({ id: s.locations.id, slug: s.locations.slug, kind: s.locations.kind, refId: s.locations.refId }).from(s.locations);
  const locBySlug = new Map(allLocs.map((l) => [l.slug, l]));
  // parent links
  await db.execute(sql`
    update locations l set parent_id = p.id from cities c, locations p
    where l.kind = 'city' and c.id = l.ref_id and p.kind = 'province' and p.ref_id = c.province_id`);
  await db.execute(sql`update locations l set parent_id = p.id from locations p where l.kind in ('area','society') and p.kind = 'city' and p.ref_id = l.city_id`);
  await db.execute(sql`
    update locations l set parent_id = p.id from blocks b, locations p
    where l.kind = 'block' and b.id = l.ref_id and p.ref_id = coalesce(b.society_id, b.area_id)`);

  /* ---------------- users ---------------- */
  log("• users");
  const pwHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userRows: (typeof s.users.$inferInsert)[] = [];
  const userRoleKeys: string[][] = [];
  let phoneCounter = 1;
  const addUser = (u: { email: string; name: string; roles: readonly string[]; cityId?: string; verification?: number; avatar?: boolean }) => {
    userRows.push({
      email: u.email,
      name: u.name,
      phone: demoPhone(phoneCounter++),
      passwordHash: pwHash,
      primaryRole: u.roles[0],
      status: "active",
      phoneVerifiedAt: (u.verification ?? 1) >= 1 ? ago(rng.int(30, 400)) : null,
      emailVerifiedAt: ago(rng.int(30, 400)),
      identityVerifiedAt: (u.verification ?? 1) >= 2 ? ago(rng.int(10, 300)) : null,
      verificationLevel: u.verification ?? 1,
      cityId: u.cityId ?? cityIds[0],
      isSeed: true,
      createdAt: ago(rng.int(60, 900)),
    });
    userRoleKeys.push([...u.roles]);
    return userRows.length - 1;
  };
  const demoIdx: Record<string, number> = {};
  for (const a of DEMO_ACCOUNTS) demoIdx[a.key] = addUser({ email: a.email, name: a.name, roles: a.roles, verification: ["agent", "agency", "developer"].includes(a.key) ? 2 : 1 });

  const personName = () => (rng.chance(0.75) ? rng.pick(FIRST_NAMES_M) : rng.pick(FIRST_NAMES_F)) + " " + rng.pick(LAST_NAMES);
  const usedEmails = new Set<string>(DEMO_ACCOUNTS.map((a) => a.email));
  const uniqueEmail = (name: string, prefix: string) => {
    let base = `${prefix}.${slugify(name).replace(/-/g, ".")}`;
    let e = `${base}@demo.${DEMO_DOMAIN}`;
    let n = 2;
    while (usedEmails.has(e)) e = `${base}${n++}@demo.${DEMO_DOMAIN}`;
    usedEmails.add(e);
    return e;
  };

  // agency owners + agents
  type AgentPlan = { userIdx: number; agencyIdx: number; cityIdx: number; name: string };
  const agentPlans: AgentPlan[] = [];
  const agencyOwnerIdx: number[] = [];
  for (const [ai, ag] of AGENCIES.entries()) {
    const cityIdx = CITIES.findIndex((c) => c.name === ag.city);
    if (ai === 0) {
      agencyOwnerIdx.push(demoIdx.agency);
      agentPlans.push({ userIdx: demoIdx.agency, agencyIdx: ai, cityIdx, name: DEMO_ACCOUNTS.find((a) => a.key === "agency")!.name });
      agentPlans.push({ userIdx: demoIdx.agent, agencyIdx: ai, cityIdx, name: DEMO_ACCOUNTS.find((a) => a.key === "agent")!.name });
    } else {
      const n = personName();
      const idx = addUser({ email: uniqueEmail(n, "owner"), name: n, roles: ["agency", "agent"], cityId: cityIds[cityIdx], verification: 2 });
      agencyOwnerIdx.push(idx);
      agentPlans.push({ userIdx: idx, agencyIdx: ai, cityIdx, name: n });
    }
    const extra = ai === 0 ? 2 : rng.int(2, 3);
    for (let k = 0; k < extra; k++) {
      const n = personName();
      const idx = addUser({ email: uniqueEmail(n, "agent"), name: n, roles: ["agent"], cityId: cityIds[cityIdx], verification: rng.weighted({ 0: 1, 1: 4, 2: 4 }) === "0" ? 0 : rng.int(1, 2) });
      agentPlans.push({ userIdx: idx, agencyIdx: ai, cityIdx, name: n });
    }
  }
  // developer owners
  const developerOwnerIdx = DEVELOPERS.map((d, i) => {
    if (i === 0) return demoIdx.developer;
    const n = personName();
    return addUser({ email: uniqueEmail(n, "developer"), name: n, roles: ["developer"], cityId: cityIds[CITIES.findIndex((c) => c.name === d.city)], verification: 2 });
  });
  // individual sellers / landlords per city
  const sellerIdxByCity: number[][] = CITIES.map((c, ci) =>
    Array.from({ length: 4 }, () => {
      const n = personName();
      return addUser({ email: uniqueEmail(n, "owner"), name: n, roles: rng.chance(0.5) ? ["seller"] : ["landlord", "seller"], cityId: cityIds[ci], verification: rng.int(0, 2) });
    }),
  );
  // buyers (lead / review / forum authors)
  const buyerIdx = Array.from({ length: 30 }, (_, i) => {
    const n = personName();
    return addUser({ email: uniqueEmail(n, "user"), name: n, roles: rng.chance(0.2) ? ["investor", "buyer"] : rng.chance(0.3) ? ["tenant", "buyer"] : ["buyer"], cityId: cityIds[i % cityIds.length], verification: rng.int(0, 1) });
  });

  const insertedUsers: { id: string; email: string }[] = [];
  for (const part of chunk(userRows, 200)) insertedUsers.push(...(await db.insert(s.users).values(part).returning({ id: s.users.id, email: s.users.email })));
  const uid = (idx: number) => insertedUsers[idx].id;
  const ur: { userId: string; roleId: string }[] = [];
  userRoleKeys.forEach((keys, i) => keys.forEach((k) => ur.push({ userId: uid(i), roleId: roleId.get(k)! })));
  for (const part of chunk(ur)) await db.insert(s.userRoles).values(part);
  const demo = Object.fromEntries(Object.entries(demoIdx).map(([k, i]) => [k, uid(i)])) as Record<(typeof DEMO_ACCOUNTS)[number]["key"], string>;

  /* ---------------- agencies, agents, developers ---------------- */
  log("• agencies, agents & developers");
  const agencyRows = await db
    .insert(s.agencies)
    .values(
      AGENCIES.map((a, i) => ({
        ownerId: uid(agencyOwnerIdx[i]),
        name: a.name,
        slug: slugify(a.name),
        description: a.description,
        phone: demoPhone(5000 + i),
        whatsapp: demoPhone(5000 + i),
        email: `contact@${slugify(a.name)}.${DEMO_DOMAIN}`,
        cityId: cityIds[CITIES.findIndex((c) => c.name === a.city)],
        address: `${rng.pick(["Office", "Suite", "Plaza Office"])} ${rng.int(2, 40)}, ${CITIES.find((c) => c.name === a.city)!.locs[0].name}, ${a.city}`,
        establishedYear: a.year,
        verificationLevel: i % 4 === 3 ? 1 : 2,
        isSeed: true,
        createdAt: ago(rng.int(200, 900)),
      })),
    )
    .returning();
  const agentRows = await db
    .insert(s.agents)
    .values(
      agentPlans.map((p, i) => ({
        userId: uid(p.userIdx),
        agencyId: agencyRows[p.agencyIdx].id,
        slug: `${slugify(p.name)}-${rid(4)}`,
        displayName: p.name,
        bio: `${p.name.split(" ")[0]} works with ${AGENCIES[p.agencyIdx].name} in ${CITIES[p.cityIdx].name}, helping clients with ${rng.pickN(SPECIALIZATIONS, 2).join(" and ").toLowerCase()}.`,
        experienceYears: rng.int(1, 18),
        phone: demoPhone(6000 + i),
        whatsapp: demoPhone(6000 + i),
        specializations: rng.pickN(SPECIALIZATIONS, rng.int(2, 4)),
        languages: rng.pickN(["Urdu", "English", "Punjabi", "Pashto", "Sindhi", "Saraiki"], 2).includes("Urdu") ? ["Urdu", "English"] : ["Urdu", "English", rng.pick(["Punjabi", "Pashto", "Sindhi", "Saraiki"])],
        verificationLevel: userRows[p.userIdx].verificationLevel ?? 1,
        responseTimeMins: rng.pick([10, 15, 30, 45, 60, 120]),
        isFeatured: i % 5 === 0,
        isSeed: true,
        createdAt: ago(rng.int(100, 800)),
      })),
    )
    .returning();
  await db.insert(s.agencyMembers).values(
    agentPlans.map((p) => ({
      agencyId: agencyRows[p.agencyIdx].id,
      userId: uid(p.userIdx),
      role: agencyOwnerIdx[p.agencyIdx] === p.userIdx ? "admin" : rng.chance(0.15) ? "manager" : "agent",
    })),
  );
  // agent areas
  const agentAreaRows: { agentId: string; locationId: string }[] = [];
  agentPlans.forEach((p, i) => {
    const refs = rng.pickN(locRefs[p.cityIdx], rng.int(2, 3));
    refs.forEach((r) => agentAreaRows.push({ agentId: agentRows[i].id, locationId: locBySlug.get(r.slug)!.id }));
  });
  await db.insert(s.agentAreas).values(agentAreaRows).onConflictDoNothing();

  const developerRows = await db
    .insert(s.developers)
    .values(
      DEVELOPERS.map((d, i) => ({
        ownerId: uid(developerOwnerIdx[i]),
        name: d.name,
        slug: slugify(d.name),
        description: d.description,
        phone: demoPhone(7000 + i),
        email: `sales@${slugify(d.name)}.${DEMO_DOMAIN}`,
        cityId: cityIds[CITIES.findIndex((c) => c.name === d.city)],
        establishedYear: d.year,
        verificationLevel: 2,
        isSeed: true,
      })),
    )
    .returning();
  const devBySlug = new Map(developerRows.map((d) => [d.name, d]));

  /* ---------------- projects ---------------- */
  log("• projects");
  const projectIds: string[] = [];
  for (const p of PROJECTS) {
    const ci = CITIES.findIndex((c) => c.name === p.city);
    const li = CITIES[ci].locs.findIndex((l) => l.name === p.location);
    const loc = CITIES[ci].locs[li];
    const ref = locRefs[ci][li];
    const prices = p.units.map((u) => u.price);
    const cover = (IMG[p.image] as string[])[0];
    const [proj] = await db
      .insert(s.projects)
      .values({
        developerId: devBySlug.get(p.developer)!.id,
        name: p.name,
        slug: slugify(`${p.name} ${p.city}`),
        tagline: p.tagline,
        description: p.description,
        cityId: cityIds[ci],
        locationId: locBySlug.get(ref.slug)!.id,
        address: `${p.location}, ${p.city}`,
        lat: loc.lat + (rng.next() - 0.5) * 0.01,
        lng: loc.lng + (rng.next() - 0.5) * 0.01,
        status: p.status,
        constructionProgress: p.progress,
        launchDate: p.launch,
        expectedCompletion: p.completion,
        minPrice: Math.min(...prices),
        maxPrice: Math.round(Math.max(...p.units.map((u) => u.price * 1.08)) / 100_000) * 100_000,
        totalUnits: p.units.reduce((t, u) => t + u.total, 0),
        availableUnits: p.units.reduce((t, u) => t + u.available, 0),
        amenities: p.amenities,
        coverImage: cover,
        masterPlanUrl: "/floor-plans/sample-master-plan.svg",
        brochureUrl: null,
        approvalStatus: "Approval documents submitted to Bismillah for review",
        isFeatured: !!p.featured,
        viewsCount: rng.int(400, 6000),
        isSeed: true,
        createdAt: ago(rng.int(60, 500)),
      })
      .returning();
    projectIds.push(proj.id);
    const gallery = [cover, ...rng.pickN([...IMG.living, ...IMG.kitchen, ...IMG.bathroom].filter((x) => x !== cover), 4)];
    if (p.image === "aerial" || p.image === "farmhouse") gallery.splice(1, 4, ...rng.pickN([...IMG.land, ...IMG.aerial, ...IMG.farmhouse], 3));
    await db.insert(s.projectMedia).values([
      ...gallery.map((url, i) => ({ projectId: proj.id, kind: "image" as const, url, sortOrder: i, isSeed: true })),
      { projectId: proj.id, kind: "master_plan" as const, url: "/floor-plans/sample-master-plan.svg", caption: "Indicative master plan", sortOrder: 50, isSeed: true },
    ]);
    const units = await db
      .insert(s.projectUnits)
      .values(
        p.units.map((u) => ({
          projectId: proj.id,
          type: u.type,
          name: u.name,
          areaSqft: u.sqft,
          beds: u.beds ?? null,
          baths: u.baths ?? null,
          priceFrom: u.price,
          priceTo: Math.round((u.price * 1.08) / 100_000) * 100_000,
          totalUnits: u.total,
          availableUnits: u.available,
          floorPlanUrl: u.beds ? "/floor-plans/sample-floor-plan.svg" : null,
          isSeed: true,
        })),
      )
      .returning();
    void units;
    await db.insert(s.projectPaymentPlans).values(
      p.plans.map((pl) => ({
        projectId: proj.id,
        name: pl.name,
        downPaymentPct: pl.down,
        durationMonths: pl.months,
        frequency: pl.frequency,
        possessionPct: pl.possession,
        balloonPct: pl.balloon ?? 0,
        notes: pl.notes ?? null,
        isSeed: true,
      })),
    );
  }

  /* ---------------- listings ---------------- */
  log("• listings");
  const agentsByCity = CITIES.map((_, ci) => agentPlans.map((p, i) => ({ p, row: agentRows[i] })).filter((x) => x.p.cityIdx === ci));
  let refCounter = 1_000_100;
  const propertyRows: (typeof s.properties.$inferInsert)[] = [];
  const listingRows: (typeof s.propertyListings.$inferInsert & { _features: string[]; _images: { url: string; kind: "image" | "floor_plan" }[]; _history: { old: number | null; next: number; at: Date }[]; _hashGroup?: number })[] = [];
  const monthlyGrowth = [0.009, 0.008, 0.007, 0.008, 0.006, 0.007, 0.006, 0.006];

  for (const [ci, city] of CITIES.entries()) {
    const weights = city.locs.map((l) => l.weight ?? 1);
    const totalW = weights.reduce((a, b) => a + b, 0);
    for (let n = 0; n < city.listings; n++) {
      let r = rng.next() * totalW;
      let li = 0;
      for (; li < weights.length - 1; li++) {
        r -= weights[li];
        if (r <= 0) break;
      }
      const loc = city.locs[li];
      const ref = locRefs[ci][li];
      const type = rng.weighted(loc.mix) as PropertyType;
      const block = ref.blocks.length && rng.chance(0.85) ? rng.pick(ref.blocks) : undefined;
      const g = generateListing(rng, city, loc, type, block?.name, now);

      // lifecycle
      const status = rng.weighted({ active: 76, sold: 7, rented: 4, expired: 6, pending_review: 3, paused: 2, draft: 1, rejected: 1 }) as LStatus;
      const closed = ["sold", "rented", "expired"].includes(status);
      const daysAgo = closed ? rng.int(90, 730) : status === "active" ? Math.floor(Math.pow(rng.next(), 1.6) * 200) : rng.int(0, 20);
      const monthsAgo = daysAgo / 30;
      const priceNow = g.price;
      const historicPrice = Math.round((priceNow / Math.pow(1 + (monthlyGrowth[ci] ?? 0.006), monthsAgo)) / 10_000) * 10_000;
      let price = closed ? historicPrice : priceNow;
      let finalStatus: LStatus = status;
      if (status === "sold" && g.purpose === "rent") finalStatus = "rented";
      if (status === "rented" && g.purpose === "sale") finalStatus = "sold";

      const history: { old: number | null; next: number; at: Date }[] = [];
      const publishedAt = ["draft", "pending_review"].includes(finalStatus) ? null : ago(daysAgo);
      let previousPrice: number | null = null;
      let priceReducedAt: Date | null = null;
      if (publishedAt) history.push({ old: null, next: price, at: publishedAt });
      if (finalStatus === "active" && daysAgo > 10 && rng.chance(0.12)) {
        previousPrice = Math.round((price * rng.float(1.03, 1.1)) / 50_000) * 50_000;
        priceReducedAt = ago(rng.int(1, Math.min(daysAgo - 1, 30)));
        history[0].next = previousPrice;
        history.push({ old: previousPrice, next: price, at: priceReducedAt });
      }

      // owner / agent
      const byAgent = rng.chance(0.75) && agentsByCity[ci].length;
      const agentPick = byAgent ? rng.pick(agentsByCity[ci]) : null;
      const sellerUser = byAgent ? null : rng.pick(sellerIdxByCity[ci]);
      const postedBy = agentPick ? uid(agentPick.p.userIdx) : uid(sellerUser!);
      const contactName = agentPick ? agentPick.p.name : userRows[sellerUser!].name;
      const contactPhone = agentPick ? agentPick.row.phone! : userRows[sellerUser!].phone!;
      const verificationLevel = finalStatus === "active" ? Number(rng.weighted({ 0: 14, 1: 34, 2: 20, 3: 10, 4: 16, 5: 6 })) : rng.int(0, 2);
      const featured = finalStatus === "active" && rng.chance(0.09);
      const ageFactor = Math.max(0.15, Math.min(3, daysAgo / 40));
      const views = Math.round(rng.int(30, 450) * ageFactor * (featured ? 2.2 : 1));
      const propIdx = propertyRows.length;
      propertyRows.push({
        ownerId: postedBy,
        type,
        category: propertyTypeInfo(type)!.category,
        cityId: cityIds[ci],
        areaId: ref.areaId,
        societyId: ref.societyId,
        blockId: block?.id ?? null,
        locationId: locBySlug.get(block?.slug ?? ref.slug)!.id,
        address: g.address,
        lat: g.lat,
        lng: g.lng,
        areaValue: g.areaValue,
        areaUnit: g.areaUnit,
        areaSqft: g.areaSqft,
        beds: g.beds,
        baths: g.baths,
        parkingSpaces: g.parking,
        floors: g.floors,
        floorNumber: g.floorNumber,
        yearBuilt: g.yearBuilt,
        furnishing: g.furnishing,
        condition: g.condition,
        isSeed: true,
        createdAt: publishedAt ?? ago(daysAgo),
      });
      const searchText = [g.title, PROPERTY_TYPE_LABELS[type], g.purpose === "sale" ? "sale buy" : "rent", block?.name, loc.name, city.name, city.province, g.highlights.join(" "), g.description.slice(0, 600)].filter(Boolean).join(" ");
      listingRows.push({
        propertyId: String(propIdx),
        slug: `${slugify(g.title).slice(0, 70)}-${rid(5)}`,
        referenceCode: `PX-${refCounter++}`,
        purpose: g.purpose,
        status: finalStatus as LStatus,
        title: g.title,
        description: g.description,
        highlights: g.highlights,
        price,
        previousPrice,
        priceReducedAt,
        pricePerSqft: Math.round((price / g.areaSqft) * 100) / 100,
        rentPeriod: g.rentPeriod,
        installmentAvailable: !!g.installment,
        advanceAmount: g.installment?.advance ?? null,
        monthlyInstallment: g.installment?.monthly ?? null,
        installmentsRemaining: g.installment?.remaining ?? null,
        videoUrl: rng.chance(0.08) ? "https://www.youtube.com/embed/ScMzIvxBSi4" : null,
        tourUrl: null,
        contactName,
        contactPhone,
        contactWhatsapp: contactPhone,
        contactEmail: null,
        postedById: postedBy,
        agentId: agentPick?.row.id ?? null,
        agencyId: agentPick ? agencyRows[agentPick.p.agencyIdx].id : null,
        isPremium: featured && rng.chance(0.5),
        featuredUntil: featured ? ahead(rng.int(3, 28)) : null,
        verificationLevel,
        verifiedAt: verificationLevel >= 2 ? ago(rng.int(1, 120)) : null,
        qualityScore: Math.min(100, 40 + g.images.length * 6 + (g.description.length > 400 ? 15 : 5) + (g.highlights.length ? 10 : 0)),
        rejectionReason: finalStatus === "rejected" ? "Photos do not match the property description. Please upload actual photos of the property." : null,
        viewsCount: views,
        savesCount: Math.round(views * rng.float(0.01, 0.06)),
        leadsCount: Math.round(views * rng.float(0.005, 0.02)),
        publishedAt,
        expiresAt: publishedAt ? new Date(publishedAt.getTime() + 90 * DAY) : null,
        closedAt: closed ? ago(Math.max(1, daysAgo - rng.int(10, 80))) : null,
        searchText,
        isSeed: true,
        createdAt: publishedAt ?? ago(daysAgo),
        updatedAt: priceReducedAt ?? publishedAt ?? ago(daysAgo),
        _features: g.features,
        _images: g.images,
        _history: history,
      });
    }
  }

  // Give demo accounts concrete inventory for dashboard testing.
  const lahoreActive = listingRows.map((l, i) => ({ l, i })).filter(({ l, i }) => propertyRows[i].cityId === cityIds[0]);
  const demoAgentId = agentRows[agentPlans.findIndex((p) => p.userIdx === demoIdx.agent)].id;
  const crescentId = agencyRows[0].id;
  lahoreActive.slice(0, 28).forEach(({ l, i }) => {
    l.postedById = demo.agent;
    l.agentId = demoAgentId;
    l.agencyId = crescentId;
    l.contactName = "Usman Tariq";
    l.contactPhone = agentRows.find((a) => a.id === demoAgentId)!.phone!;
    l.contactWhatsapp = l.contactPhone;
    propertyRows[i].ownerId = demo.agent;
  });
  const sellerStatuses = ["active", "active", "pending_review", "paused", "sold", "draft", "expired", "rejected", "sold", "paused", "expired", "draft"];
  lahoreActive.slice(28, 40).forEach(({ l, i }, k) => {
    l.postedById = demo.seller;
    l.agentId = null;
    l.agencyId = null;
    l.contactName = "Nadia Hussain";
    l.contactPhone = userRows[demoIdx.seller].phone!;
    l.contactWhatsapp = l.contactPhone;
    l.status = sellerStatuses[k] as LStatus;
    if (l.status === "draft" || l.status === "pending_review") l.publishedAt = null;
    if (l.status === "rejected") l.rejectionReason = "The listed price appears to be per marla rather than the total price. Please correct the price and resubmit.";
    propertyRows[i].ownerId = demo.seller;
  });
  lahoreActive
    .filter(({ l }) => l.purpose === "rent")
    .slice(0, 6)
    .forEach(({ l, i }) => {
      l.postedById = demo.landlord;
      l.agentId = null;
      l.agencyId = null;
      l.contactName = "Tariq Mehmood";
      l.contactPhone = userRows[demoIdx.landlord].phone!;
      l.contactWhatsapp = l.contactPhone;
      propertyRows[i].ownerId = demo.landlord;
    });

  // Intentionally suspicious demo listings so the fraud scanner has something to find:
  // re-post of an active listing at an implausibly low price with the same photos.
  const victimIdx = lahoreActive.find(({ l }) => l.purpose === "sale" && l.status === "active" && (l.price ?? 0) > 20_000_000)!;
  for (let k = 0; k < 2; k++) {
    const src = victimIdx.l;
    const p = { ...propertyRows[victimIdx.i], ownerId: uid(buyerIdx[k]) };
    propertyRows.push(p);
    listingRows.push({
      ...src,
      propertyId: String(propertyRows.length - 1),
      slug: `${src.slug}-${rid(4)}`,
      referenceCode: `PX-${refCounter++}`,
      title: k === 0 ? `URGENT SALE ${src.title}` : `${src.title} — owner abroad, below market`,
      price: Math.round(src.price! * (k === 0 ? 0.42 : 0.5)),
      pricePerSqft: null,
      previousPrice: null,
      priceReducedAt: null,
      postedById: uid(buyerIdx[k]),
      agentId: null,
      agencyId: null,
      contactName: userRows[buyerIdx[k]].name,
      contactPhone: demoPhone(99001),
      contactWhatsapp: demoPhone(99001),
      verificationLevel: 0,
      featuredUntil: null,
      isPremium: false,
      viewsCount: rng.int(20, 90),
      publishedAt: ago(k + 1),
      _hashGroup: victimIdx.i,
      description: `${src.description}\n\nOwner is abroad. Send advance payment via easypaisa to reserve. Price is final, booking today only.`,
      _history: [{ old: null, next: Math.round(src.price! * (k === 0 ? 0.42 : 0.5)), at: ago(k + 1) }],
    });
  }

  const insertedProps: { id: string }[] = [];
  for (const part of chunk(propertyRows, 50)) insertedProps.push(...(await db.insert(s.properties).values(part).returning({ id: s.properties.id })));
  const listingInsert = listingRows.map(({ _features, _images, _history, ...l }) => ({ ...l, propertyId: insertedProps[Number(l.propertyId)].id }));
  const insertedListings: { id: string; propertyId: string; status: string; purpose: string; price: number; postedById: string | null; agentId: string | null; publishedAt: Date | null }[] = [];
  for (const part of chunk(listingInsert, 50))
    insertedListings.push(
      ...(await db
        .insert(s.propertyListings)
        .values(part)
        .returning({ id: s.propertyListings.id, propertyId: s.propertyListings.propertyId, status: s.propertyListings.status, purpose: s.propertyListings.purpose, price: s.propertyListings.price, postedById: s.propertyListings.postedById, agentId: s.propertyListings.agentId, publishedAt: s.propertyListings.publishedAt })),
    );

  const pf: { propertyId: string; featureId: string }[] = [];
  const media: (typeof s.propertyMedia.$inferInsert)[] = [];
  const hist: (typeof s.propertyPriceHistory.$inferInsert)[] = [];
  listingRows.forEach((l, i) => {
    const pid = insertedProps[Number(l.propertyId)].id;
    l._features.forEach((f) => featureId.get(f) && pf.push({ propertyId: pid, featureId: featureId.get(f)! }));
    l._images.forEach((m, k) => media.push({ propertyId: pid, kind: m.kind, url: m.url, sortOrder: k, caption: m.kind === "floor_plan" ? "Floor plan (indicative)" : null, sha256: `demo-${l._hashGroup ?? i}-${k}`, isSeed: true }));
    l._history.forEach((h) => hist.push({ listingId: insertedListings[i].id, oldPrice: h.old, newPrice: h.next, changedAt: h.at, changedById: l.postedById }));
  });
  for (const part of chunk(pf, 150)) await db.insert(s.propertyFeatures).values(part).onConflictDoNothing();
  for (const part of chunk(media, 150)) await db.insert(s.propertyMedia).values(part);
  for (const part of chunk(hist, 150)) await db.insert(s.propertyPriceHistory).values(part);
  log(`  ${insertedListings.length} listings`);

  const active = insertedListings.filter((l) => l.status === "active");
  const agentListings = insertedListings.filter((l) => l.postedById === demo.agent && l.status === "active");
  const sellerListings = insertedListings.filter((l) => l.postedById === demo.seller);
  const landlordListings = insertedListings.filter((l) => l.postedById === demo.landlord);

  /* ---------------- leads, chats, visits ---------------- */
  log("• leads, conversations, appointments");
  const leadRows: (typeof s.leads.$inferInsert)[] = [];
  const makeLead = (listing: (typeof insertedListings)[number], recipient: string, i: number) => {
    const buyer = i % 7 === 0 ? demoIdx.buyer : rng.pick(buyerIdx);
    const src = rng.weighted({ form: 5, whatsapp: 2, call: 2, offer: 1, ai_assistant: 1 }) as LSource;
    leadRows.push({
      listingId: listing.id,
      agentId: listing.agentId,
      agencyId: listing.agentId ? crescentId : null,
      recipientId: recipient,
      userId: uid(buyer),
      name: userRows[buyer].name,
      phone: userRows[buyer].phone!,
      email: userRows[buyer].email,
      message: rng.pick([
        "Is this still available? I'd like to visit this weekend.",
        "Please share the exact location and whether the price is negotiable.",
        "Can you send more pictures of the kitchen and bathrooms?",
        "Is there any possibility of installments?",
        "What are the monthly maintenance charges?",
        "Interested. Please call me after 6 pm.",
      ]),
      source: src,
      status: rng.weighted({ new: 4, contacted: 3, qualified: 2, negotiation: 1.5, won: 0.7, lost: 1 }) as "new",
      offerAmount: src === "offer" ? Math.round((listing.price * rng.float(0.88, 0.96)) / 50_000) * 50_000 : null,
      aiScore: rng.int(35, 92),
      isSaved: rng.chance(0.2),
      isSeed: true,
      createdAt: ago(rng.int(0, 60)),
    });
  };
  agentListings.forEach((l, i) => Array.from({ length: rng.int(0, 3) }).forEach((_, k) => makeLead(l, demo.agent, i + k)));
  sellerListings.filter((l) => l.status === "active").forEach((l, i) => Array.from({ length: rng.int(1, 3) }).forEach((_, k) => makeLead(l, demo.seller, i + k)));
  // leads for other agents too (agency dashboard)
  insertedListings
    .filter((l) => l.agentId && l.status === "active" && l.postedById !== demo.agent)
    .slice(0, 120)
    .forEach((l, i) => rng.chance(0.4) && makeLead(l, l.postedById!, i));
  for (const part of chunk(leadRows)) await db.insert(s.leads).values(part);

  // project leads for developer
  await db.insert(s.leads).values(
    Array.from({ length: 14 }, (_, i) => {
      const b = rng.pick(buyerIdx);
      const pi = rng.int(0, 2);
      return {
        projectId: projectIds[pi],
        developerId: developerRows[0].id,
        recipientId: demo.developer,
        userId: uid(b),
        name: userRows[b].name,
        phone: userRows[b].phone!,
        email: userRows[b].email,
        message: rng.pick(["Please send the payment plan for a 2 bed apartment.", "Requesting brochure and floor plans.", "Is there a discount on full payment?", "When is possession expected?"]),
        source: rng.pick(["payment_plan", "brochure", "form"] as const),
        status: rng.pick(["new", "contacted", "qualified"] as const),
        isSeed: true,
        createdAt: ago(rng.int(0, 45)),
      };
    }),
  );

  const convo = async (a: string, b: string, kind: string, listingId: string | null, projectId: string | null, lines: [0 | 1, string][]) => {
    const key = [a, b].sort().join(":") + ":" + (listingId ?? projectId ?? "direct");
    const start = ago(rng.int(2, 15));
    const [c] = await db
      .insert(s.conversations)
      .values({ kind, listingId, projectId, participantKey: key, lastMessageAt: new Date(start.getTime() + lines.length * 3_600_000), lastMessagePreview: lines[lines.length - 1][1].slice(0, 140), isSeed: true, createdAt: start })
      .returning();
    await db.insert(s.conversationParticipants).values([
      { conversationId: c.id, userId: a, lastReadAt: new Date(start.getTime() + lines.length * 3_600_000) },
      { conversationId: c.id, userId: b, lastReadAt: start },
    ]);
    await db.insert(s.messages).values(
      lines.map(([who, body], i) => ({
        conversationId: c.id,
        senderId: who === 0 ? a : b,
        body,
        kind: (i === 0 && listingId ? "property" : "text") as "text",
        listingId: i === 0 ? listingId : null,
        isSeed: true,
        createdAt: new Date(start.getTime() + i * 3_600_000),
      })),
    );
  };
  if (agentListings[0])
    await convo(demo.buyer, demo.agent, "buyer_agent", agentListings[0].id, null, [
      [0, "Assalam o Alaikum, is this property still available?"],
      [1, "Walaikum Assalam. Yes, it is available. Would you like to schedule a visit?"],
      [0, "Yes please. Is Saturday afternoon possible? Also, is the price negotiable?"],
      [1, "Saturday at 4 pm works. There is some room for negotiation for a serious buyer after the visit."],
      [0, "Great, I'll send a visit request through the app."],
    ]);
  if (sellerListings[0])
    await convo(demo.buyer, demo.seller, "buyer_seller", sellerListings[0].id, null, [
      [0, "Hi, could you share whether gas is connected at the property?"],
      [1, "Yes, Sui gas and electricity are both connected and all bills are paid."],
    ]);
  if (landlordListings[0])
    await convo(demo.tenant, demo.landlord, "tenant_landlord", landlordListings[0].id, null, [
      [0, "Hello, the kitchen tap has been leaking since yesterday."],
      [1, "Thanks for letting me know. I've logged a maintenance request and a plumber will come tomorrow morning."],
      [0, "Thank you!"],
    ]);
  await convo(demo.investor, demo.developer, "developer_buyer", null, projectIds[0], [
    [0, "I'm interested in a 2 bed apartment at Aurelia Residences. What is the current availability on higher floors?"],
    [1, "Thank you for your interest. We have 2 bed units available from the 9th floor upwards. I have shared the payment plan on your email."],
  ]);

  const apptRows: (typeof s.appointments.$inferInsert)[] = [];
  const apptStatuses = ["requested", "requested", "confirmed", "confirmed", "completed", "cancelled", "no_show", "completed"] as const;
  agentListings.slice(0, 8).forEach((l, i) => {
    const st = apptStatuses[i];
    const when = ["completed", "no_show", "cancelled"].includes(st) ? ago(rng.int(2, 20)) : ahead(rng.int(1, 10));
    when.setHours(rng.pick([11, 12, 15, 16, 17]), 0, 0, 0);
    const b = i % 3 === 0 ? demoIdx.buyer : rng.pick(buyerIdx);
    apptRows.push({ listingId: l.id, requesterId: uid(b), hostId: demo.agent, scheduledAt: when, visitors: rng.int(1, 4), phone: userRows[b].phone, message: "I'd like to see the property with my family.", status: st, isSeed: true, createdAt: ago(rng.int(1, 25)) });
  });
  sellerListings
    .filter((l) => l.status === "active")
    .slice(0, 3)
    .forEach((l, i) => {
      const when = ahead(i + 2);
      when.setHours(16, 30, 0, 0);
      apptRows.push({ listingId: l.id, requesterId: demo.buyer, hostId: demo.seller, scheduledAt: when, visitors: 2, phone: userRows[demoIdx.buyer].phone, message: "Visiting with my wife.", status: i === 0 ? "confirmed" : "requested", isSeed: true });
    });
  if (apptRows.length) await db.insert(s.appointments).values(apptRows);

  /* ---------------- saved, alerts, notifications ---------------- */
  log("• saved items & notifications");
  const reduced = await db
    .select({ id: s.propertyListings.id, price: s.propertyListings.price, previousPrice: s.propertyListings.previousPrice })
    .from(s.propertyListings)
    .where(sql`${s.propertyListings.status} = 'active' and ${s.propertyListings.previousPrice} is not null`)
    .limit(3);
  const savedPicks = [...reduced, ...rng.pickN(active, 6).map((l) => ({ id: l.id, price: l.price, previousPrice: null as number | null }))];
  await db
    .insert(s.savedProperties)
    .values(savedPicks.map((l, i) => ({ userId: demo.buyer, listingId: l.id, priceAtSave: l.previousPrice ?? l.price, createdAt: ago(i + 3) })))
    .onConflictDoNothing();
  await db.insert(s.savedSearches).values([
    { userId: demo.buyer, name: "DHA Lahore 10 Marla houses under 6 Crore", query: { purpose: "sale", types: ["house"], city: "lahore", location: "dha-lahore", priceMax: 60_000_000, areaMin: 10, areaMax: 10, areaUnit: "marla" }, frequency: "instant", lastCheckedAt: ago(1) },
    { userId: demo.buyer, name: "Apartments for rent in Islamabad", query: { purpose: "rent", types: ["apartment", "flat"], city: "islamabad" }, frequency: "daily", lastCheckedAt: ago(2) },
    { userId: demo.investor, name: "Plots with installments in Lahore", query: { purpose: "sale", types: ["residential_plot", "plot_file"], city: "lahore", installments: true }, frequency: "weekly", lastCheckedAt: ago(3) },
  ]);
  const notif = (userId: string, type: string, title: string, body: string, link: string, daysAgo: number, read = false) => ({ userId, type, title, body, link, isSeed: true, createdAt: ago(daysAgo), readAt: read ? ago(daysAgo) : null });
  await db.insert(s.notifications).values([
    notif(demo.buyer, "price_reduced", "Price reduced on a saved property", "A property you saved has a lower price. Take a look.", "/saved", 1),
    notif(demo.buyer, "visit_update", "Visit confirmed", "Your visit request was confirmed by the agent.", "/dashboard/appointments", 2),
    notif(demo.buyer, "new_match", "New properties match your saved search", "New listings match “DHA Lahore 10 Marla houses under 6 Crore”.", "/alerts", 3, true),
    notif(demo.agent, "new_lead", "New lead", "You have new enquiries on your listings.", "/dashboard/leads", 0),
    notif(demo.agent, "visit_update", "New visit request", "A buyer requested a visit for Saturday.", "/dashboard/appointments", 1),
    notif(demo.agent, "subscription", "Your Agent Pro plan renews soon", "Your subscription renews in 6 days.", "/dashboard/billing", 2, true),
    notif(demo.seller, "listing_status", "Listing rejected", "One of your listings needs changes before it can go live.", "/dashboard/listings", 1),
    notif(demo.seller, "new_lead", "New lead", "A buyer is interested in your property.", "/dashboard/leads", 2),
    notif(demo.developer, "new_lead", "New project leads", "You received new payment plan requests.", "/dashboard/leads", 0),
    notif(demo.landlord, "rent", "Rent overdue", "Rent for one of your units is overdue.", "/dashboard/rentals", 1),
    notif(demo.tenant, "rent", "Rent due soon", "Your rent is due on the 5th.", "/dashboard/tenant", 0),
  ]);

  /* ---------------- billing & ads ---------------- */
  log("• subscriptions, payments & ads");
  const subs = [
    { user: demo.agent, plan: "agent_pro", agency: null },
    { user: demo.agency, plan: "agency", agency: crescentId },
    { user: demo.developer, plan: "developer", agency: null },
  ];
  let inv = 10_001;
  for (const sub of subs) {
    const plan = planRows.find((p) => p.key === sub.plan)!;
    await db.insert(s.subscriptions).values({
      userId: sub.user,
      agencyId: sub.agency,
      planId: planId.get(sub.plan)!,
      status: "active",
      billingCycle: "monthly",
      currentPeriodStart: ago(24),
      currentPeriodEnd: ahead(6),
      featuredCreditsUsed: rng.int(0, 3),
      isSeed: true,
    });
    for (let m = 3; m >= 0; m--) {
      await db.insert(s.payments).values({
        userId: sub.user,
        invoiceNumber: `PX-INV-${inv++}`,
        purpose: "subscription",
        referenceId: plan.id,
        description: `${plan.name} plan — monthly`,
        amount: plan.priceMonthly,
        provider: "sandbox",
        providerRef: `SBX-${rid(10).toUpperCase()}`,
        status: "succeeded",
        paidAt: ago(24 + m * 30),
        fulfilledAt: ago(24 + m * 30),
        isSeed: true,
        createdAt: ago(24 + m * 30),
      });
    }
  }
  if (agentListings[1])
    await db.insert(s.payments).values({ userId: demo.agent, invoiceNumber: `PX-INV-${inv++}`, purpose: "featured_listing", referenceId: agentListings[1].id, description: "Featured listing — 15 days", amount: 2_500, provider: "sandbox", providerRef: `SBX-${rid(10).toUpperCase()}`, status: "succeeded", paidAt: ago(5), fulfilledAt: ago(5), isSeed: true });
  await db.update(s.propertyListings).set({ featuredUntil: ahead(10), isPremium: true }).where(sql`${s.propertyListings.id} = ${agentListings[1]?.id ?? null}`);

  const dhaLahore = locBySlug.get("dha-lahore")!;
  await db.insert(s.advertisements).values([
    { advertiserId: demo.developer, campaignName: "Aurelia Residences launch", format: "homepage_banner", targetType: "project", targetId: projectIds[0], title: "Aurelia Residences — Gulberg, Lahore", body: "1–3 bed apartments on a 3-year installment plan.", imageUrl: IMG.apartmentBuilding[0], linkUrl: `/project/${slugify("Aurelia Residences Lahore")}`, budget: 250_000, spent: 61_250, costPerMille: 350, impressions: 175_000, clicks: 2_310, status: "active", startAt: ago(20), endAt: ahead(40), isSeed: true },
    { advertiserId: demo.developer, campaignName: "Zenith One promotion", format: "project_promotion", targetType: "project", targetId: projectIds[3], title: "Zenith One — E-11 Islamabad", body: "Margalla-facing apartments from studio to 2 bed.", imageUrl: IMG.apartmentBuilding[1], linkUrl: `/project/${slugify("Zenith One Islamabad")}`, budget: 120_000, spent: 30_400, costPerMille: 300, impressions: 101_000, clicks: 1_120, status: "active", startAt: ago(15), endAt: ahead(30), isSeed: true },
    { advertiserId: demo.agency, campaignName: "DHA Lahore area sponsorship", format: "area_sponsorship", targetType: "agency", targetId: crescentId, title: "Crescent Estate Advisors — DHA Lahore specialists", body: "Verified listings across DHA phases.", linkUrl: `/agencies/${agencyRows[0].slug}`, locationId: dhaLahore.id, budget: 80_000, spent: 22_000, costPerMille: 250, impressions: 88_000, clicks: 940, status: "active", startAt: ago(10), endAt: ahead(20), isSeed: true },
    { advertiserId: demo.agent, campaignName: "Top of search — Lahore houses", format: "top_search", targetType: "listing", targetId: agentListings[2]?.id ?? null, title: "Featured in search", budget: 30_000, spent: 8_500, costPerMille: 200, impressions: 42_500, clicks: 610, status: "active", startAt: ago(7), endAt: ahead(14), isSeed: true },
    { advertiserId: demo.builder, campaignName: "Brickline turnkey construction", format: "homepage_banner", targetType: "brand", title: "Build your home with Brickline", body: "Grey structure and turnkey packages.", linkUrl: "/tools/construction-cost", budget: 60_000, spent: 0, costPerMille: 300, status: "pending", startAt: ahead(2), endAt: ahead(32), isSeed: true },
  ]);

  /* ---------------- trust ---------------- */
  log("• verification, reports & reviews");
  const pendingListing = sellerListings.find((l) => l.status === "active");
  const verifRows: (typeof s.verificationRequests.$inferInsert)[] = [];
  if (pendingListing) verifRows.push({ subjectType: "listing", subjectId: pendingListing.id, requestedLevel: 4, status: "pending", submittedById: demo.seller, notes: "Registry and society transfer letter attached.", isSeed: true, createdAt: ago(2) });
  verifRows.push({ subjectType: "user", subjectId: demo.seller, requestedLevel: 2, status: "pending", submittedById: demo.seller, notes: "CNIC front and back attached.", isSeed: true, createdAt: ago(2) });
  agentRows.slice(5, 8).forEach((a, i) => verifRows.push({ subjectType: "agent", subjectId: a.id, requestedLevel: 2, status: i === 2 ? "approved" : "pending", submittedById: a.userId, reviewerId: i === 2 ? demo.moderator : null, reviewedAt: i === 2 ? ago(30) : null, expiresAt: i === 2 ? ahead(335) : null, isSeed: true, createdAt: ago(i + 1) }));
  verifRows.push({ subjectType: "agent", subjectId: demoAgentId, requestedLevel: 2, status: "approved", submittedById: demo.agent, reviewerId: demo.moderator, reviewedAt: ago(90), expiresAt: ahead(275), isSeed: true, createdAt: ago(92) });
  await db.insert(s.verificationRequests).values(verifRows);

  const suspicious = insertedListings.slice(-2);
  await db.insert(s.reports).values([
    { reporterId: demo.buyer, targetType: "listing", targetId: suspicious[0].id, reason: "fraud", details: "The seller asked for an advance via mobile wallet before any visit. Price is far below the area.", status: "open", isSeed: true, createdAt: ago(1) },
    { reporterId: uid(buyerIdx[5]), targetType: "listing", targetId: suspicious[1].id, reason: "duplicate", details: "Same photos as another listing in DHA.", status: "open", isSeed: true, createdAt: ago(0) },
    { reporterId: uid(buyerIdx[6]), targetType: "listing", targetId: rng.pick(active).id, reason: "not_available", details: "Agent said this was already sold.", status: "open", isSeed: true, createdAt: ago(3) },
  ]);

  // Reviews: seeded only as PENDING moderation items (no fabricated published testimonials).
  await db.insert(s.reviews).values(
    [0, 1, 2, 3].map((i) => ({
      authorId: uid(buyerIdx[i + 10]),
      targetType: i < 2 ? "agent" : i === 2 ? "agency" : "developer",
      targetId: i < 2 ? agentRows[i].id : i === 2 ? agencyRows[1].id : developerRows[1].id,
      rating: [5, 4, 2, 4][i],
      title: ["Responsive and clear", "Helpful with documents", "Slow to respond", "Clear payment plan"][i],
      body: [
        "[Demo review for moderation testing] Arranged two viewings on short notice and explained the transfer process clearly.",
        "[Demo review for moderation testing] Helped us check the society transfer documents before we paid token money.",
        "[Demo review for moderation testing] Took several days to reply to messages and one listing was already sold.",
        "[Demo review for moderation testing] The sales team shared the full schedule including possession charges upfront.",
      ][i],
      status: "pending" as const,
      isSeed: true,
      createdAt: ago(i + 1),
    })),
  );

  /* ---------------- content ---------------- */
  log("• content & community");
  await db.insert(s.blogPosts).values(
    BLOG_POSTS.map((p, i) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      body: p.body,
      category: p.category,
      tags: p.tags,
      coverImage: (IMG[p.image as keyof typeof IMG] as string[])[i % (IMG[p.image as keyof typeof IMG] as string[]).length],
      authorId: demo.admin,
      status: "published" as const,
      publishedAt: ago(5 + i * 9),
      seoTitle: p.title,
      seoDescription: p.excerpt,
      readingMinutes: Math.max(2, Math.round(p.body.split(/\s+/).length / 200)),
      isSeed: true,
    })),
  );
  for (const [slug, g] of Object.entries(AREA_GUIDES)) {
    const loc = locBySlug.get(slug);
    if (!loc) continue;
    await db.insert(s.areaGuides).values({ locationId: loc.id, title: g.title, summary: g.summary, body: g.body, pros: g.pros, cons: g.cons, authorId: demo.admin, isSeed: true });
  }

  const threads: { title: string; body: string; category: string; loc?: string; replies: string[] }[] = [
    { title: "Is it better to buy a plot or a ready house in DHA Lahore right now?", body: "Planning to move within 2 years. Budget is around 5 crore. Should I buy a plot and build or buy a ready house?", category: "investment", loc: "dha-lahore", replies: ["Building gives you control over quality but expect 14–18 months with approvals. Factor in rising construction costs — use the construction calculator to compare.", "If you need to move in 2 years, a ready house removes construction risk. Check the year built and get the structure inspected."] },
    { title: "Tenant registration process in Islamabad?", body: "First time renting out my flat in E-11. How does tenant registration work?", category: "renting", loc: "e-11-islamabad", replies: ["You can register through the Islamabad police website or at the local police station with copies of both CNICs and the rent agreement.", "Keep a copy of the registration slip with your rent agreement."] },
    { title: "Which documents should I check for a Bahria Town Karachi villa?", body: "Buying a 125 sq yd villa in Bahria Town Karachi. Which documents should I ask for?", category: "legal", loc: "bahria-town-karachi", replies: ["Ask for the allotment letter, payment receipts, the society's NDC and verify ownership directly with the society office.", "Make sure all installments and possession charges are cleared before transfer."] },
    { title: "Grey structure rates in Faisalabad", body: "What should I budget per sq ft for grey structure in Faisalabad for a 10 marla double storey?", category: "construction", loc: "faisalabad", replies: ["Rates move with steel and cement prices. Get at least three contractor quotes and compare line items, not just the per-sq-ft figure."] },
    { title: "Apartments vs houses for rental income in Karachi", body: "Looking for rental yield rather than appreciation. Apartments in Gulshan or a portion in North Nazimabad?", category: "investment", loc: "karachi", replies: ["Apartments are usually easier to rent and maintain. Compare net yield after maintenance charges.", "Check the building's maintenance record and water supply before buying."] },
    { title: "Best areas in Peshawar for young families?", body: "Moving to Peshawar for work. Looking for a safe family area with good schools.", category: "local", loc: "peshawar", replies: ["Hayatabad is planned with parks and schools in most phases.", "University Town is central and close to institutions, but prices are higher."] },
  ];
  for (const [i, t] of threads.entries()) {
    const author = uid(buyerIdx[i + 2]);
    const [th] = await db
      .insert(s.forumThreads)
      .values({ authorId: author, title: t.title, slug: `${slugify(t.title)}-${rid(4)}`, body: t.body, category: t.category, locationId: t.loc ? locBySlug.get(t.loc)?.id ?? null : null, viewsCount: rng.int(40, 900), repliesCount: t.replies.length, lastActivityAt: ago(i), isSeed: true, createdAt: ago(i + 6) })
      .returning();
    await db.insert(s.forumPosts).values(t.replies.map((body, k) => ({ threadId: th.id, authorId: k === 0 && i < 3 ? demo.agent : uid(buyerIdx[(i + k + 12) % buyerIdx.length]), body, upvotes: rng.int(0, 25), isSeed: true, createdAt: ago(i + 5 - k) })));
  }
  await db.insert(s.follows).values([
    { userId: demo.buyer, targetType: "location", targetId: dhaLahore.id },
    { userId: demo.buyer, targetType: "agent", targetId: demoAgentId },
    { userId: demo.investor, targetType: "project", targetId: projectIds[0] },
  ]);

  /* ---------------- rentals / property management ---------------- */
  log("• rentals");
  const [mp1] = await db.insert(s.managedProperties).values({ ownerId: demo.landlord, name: "Johar Town House", address: "Block J, Johar Town, Lahore", cityName: "Lahore", isSeed: true }).returning();
  const [mp2] = await db.insert(s.managedProperties).values({ ownerId: demo.landlord, name: "Gulberg Apartment 7B", address: "Gulberg III, Lahore", cityName: "Lahore", isSeed: true }).returning();
  const [mp3] = await db.insert(s.managedProperties).values({ ownerId: demo.manager, managerId: demo.manager, name: "Bahria Heights Residency", address: "Sector C, Bahria Town Lahore", cityName: "Lahore", notes: "Managed on behalf of an overseas owner", isSeed: true }).returning();
  const units = await db
    .insert(s.rentalUnits)
    .values([
      { managedPropertyId: mp1.id, label: "Ground Floor", beds: 3, baths: 3, areaSqft: 1_800, marketRent: 95_000, occupancy: "occupied", isSeed: true },
      { managedPropertyId: mp1.id, label: "Upper Floor", beds: 2, baths: 2, areaSqft: 1_400, marketRent: 70_000, occupancy: "occupied", isSeed: true },
      { managedPropertyId: mp2.id, label: "Apartment 7B", beds: 2, baths: 2, areaSqft: 1_250, marketRent: 120_000, occupancy: "vacant", isSeed: true },
      ...Array.from({ length: 6 }, (_, i) => ({ managedPropertyId: mp3.id, label: `Flat ${101 + i}`, beds: rng.int(1, 3), baths: rng.int(1, 2), areaSqft: rng.pick([650, 850, 1_100]), marketRent: rng.pick([45_000, 55_000, 65_000]), occupancy: (i === 5 ? "vacant" : "occupied") as "vacant", isSeed: true })),
    ])
    .returning();
  const leaseDefs = [
    { unit: units[0], landlord: demo.landlord, tenantUser: demo.tenant, name: "Hira Saleem", rent: 95_000, start: -200 },
    { unit: units[1], landlord: demo.landlord, tenantUser: null, name: "Waqas Bhatti", rent: 70_000, start: -400 },
    ...units.slice(3, 8).map((u, i) => ({ unit: u, landlord: demo.manager, tenantUser: null, name: personName(), rent: u.marketRent!, start: -rng.int(60, 500) - i })),
  ];
  for (const [i, d] of leaseDefs.entries()) {
    const start = new Date(now.getTime() + d.start * DAY);
    const end = new Date(start.getTime() + 330 * DAY);
    const [lease] = await db
      .insert(s.leases)
      .values({
        unitId: d.unit.id,
        landlordId: d.landlord,
        tenantUserId: d.tenantUser,
        tenantName: d.name,
        tenantPhone: demoPhone(8000 + i),
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        monthlyRent: d.rent,
        securityDeposit: d.rent * 2,
        dueDay: 5,
        status: end < now ? "ended" : "active",
        terms: "11-month agreement, rent due by the 5th of each month, 10% annual increase on renewal.",
        isSeed: true,
      })
      .returning();
    const payments: (typeof s.rentPayments.$inferInsert)[] = [];
    for (let m = 5; m >= 0; m--) {
      const due = new Date(now.getFullYear(), now.getMonth() - m, 5);
      if (due < start) continue;
      const period = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
      const isCurrent = m === 0;
      const overdue = i === 1 && m === 1;
      payments.push({
        leaseId: lease.id,
        period,
        amountDue: d.rent,
        amountPaid: isCurrent || overdue ? 0 : d.rent,
        dueDate: due.toISOString().slice(0, 10),
        paidAt: isCurrent || overdue ? null : new Date(due.getTime() - rng.int(0, 3) * DAY),
        method: isCurrent || overdue ? null : rng.pick(["Bank transfer", "Raast", "Cheque"]),
        status: overdue ? "overdue" : isCurrent ? (due < now ? "overdue" : "due") : "paid",
        isSeed: true,
      });
    }
    if (payments.length) await db.insert(s.rentPayments).values(payments);
    if (i === 0)
      await db.insert(s.maintenanceRequests).values([
        { unitId: d.unit.id, leaseId: lease.id, requestedById: demo.tenant, title: "Kitchen tap leaking", description: "The kitchen mixer tap leaks continuously.", category: "plumbing", priority: "normal", status: "in_progress", isSeed: true, createdAt: ago(1) },
        { unitId: d.unit.id, leaseId: lease.id, requestedById: demo.tenant, title: "AC not cooling in master bedroom", description: "Split AC needs gas refill / service.", category: "electrical", priority: "high", status: "resolved", cost: 6_500, resolvedAt: ago(20), isSeed: true, createdAt: ago(25) },
      ]);
  }
  await db.insert(s.maintenanceRequests).values({ unitId: units[4].id, requestedById: demo.manager, title: "Stairwell lights not working", description: "Two lights on the 1st floor stairwell need replacement.", category: "electrical", priority: "low", status: "open", isSeed: true });
  await db.insert(s.propertyExpenses).values([
    { managedPropertyId: mp1.id, category: "repairs", description: "Plumbing repairs", amount: 8_500, incurredOn: ago(40).toISOString().slice(0, 10), isSeed: true },
    { managedPropertyId: mp1.id, category: "tax", description: "Property tax (annual)", amount: 32_000, incurredOn: ago(120).toISOString().slice(0, 10), isSeed: true },
    { managedPropertyId: mp2.id, category: "utilities", description: "Building maintenance charges", amount: 12_000, incurredOn: ago(10).toISOString().slice(0, 10), isSeed: true },
    { managedPropertyId: mp3.id, category: "salaries", description: "Caretaker and guard salaries", amount: 70_000, incurredOn: ago(5).toISOString().slice(0, 10), isSeed: true },
    { managedPropertyId: mp3.id, category: "repairs", description: "Water pump replacement", amount: 45_000, incurredOn: ago(35).toISOString().slice(0, 10), isSeed: true },
  ]);
  await db.insert(s.propertyStaff).values([
    { managerId: demo.manager, name: "Muhammad Akram", role: "caretaker", phone: demoPhone(9100), monthlySalary: 35_000, isSeed: true },
    { managerId: demo.manager, name: "Gul Khan", role: "guard", phone: demoPhone(9101), monthlySalary: 35_000, isSeed: true },
    { managerId: demo.manager, name: "Rafiq Ahmed", role: "electrician", phone: demoPhone(9102), isSeed: true },
  ]);

  await db.insert(s.constructionCompanies).values({ ownerId: demo.builder, name: "Brickline Construction", slug: "brickline-construction", description: "Grey structure and turnkey residential construction in Lahore.", cityId: cityIds[0], services: ["Grey structure", "Turnkey construction", "Renovation"], verificationLevel: 1, isSeed: true });

  // denormalised counters
  await db.execute(sql`
    update locations l set active_listings = coalesce(x.n, 0)
    from (
      select loc.id, count(pl.id) as n from locations loc
      join properties p on (
        (loc.kind = 'city' and p.city_id = loc.ref_id) or
        (loc.kind = 'area' and p.area_id = loc.ref_id) or
        (loc.kind = 'society' and p.society_id = loc.ref_id) or
        (loc.kind = 'block' and p.block_id = loc.ref_id))
      join property_listings pl on pl.property_id = p.id and pl.status = 'active'
      group by loc.id) x
    where x.id = l.id`);

  log("✔ demo data loaded");
  return { demo, listingCount: insertedListings.length };
}
