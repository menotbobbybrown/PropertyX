import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@propertyx/database";
import * as s from "@propertyx/database";
import { hashPassword, assignRole, audit } from "@propertyx/auth";
import { notify } from "@propertyx/notifications";
import { createSearchEngine } from "@propertyx/search";
import { slugify, shortId, AGENCY_MEMBER_ROLES, PROJECT_STATUSES, UNIT_TYPES, pkPhone } from "@propertyx/shared";
import { z } from "zod";
import { badRequest, conflict, forbidden, notFound, paymentRequired, requireActor, requirePerm, type Actor } from "./errors";
import { getActivePlan, hasCapability } from "./billing";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Agents                                                               */
/* ------------------------------------------------------------------ */

export async function listAgents(db: Database, opts: { city?: string; q?: string; specialization?: string; verified?: boolean; page?: number } = {}) {
  const page = opts.page ?? 1;
  const rows = await db.execute<Row>(sql`
    select a.id, a.slug, a.display_name, a.photo_url, a.experience_years, a.specializations, a.verification_level, a.rating_avg, a.reviews_count, a.is_featured, a.response_time_mins,
      ag.name as agency_name, ag.slug as agency_slug, c.name as city_name,
      (select count(*)::int from property_listings l where l.agent_id = a.id and l.status = 'active') as active_listings,
      (select count(*)::int from property_listings l where l.agent_id = a.id and l.status = 'sold') as sold,
      (select count(*)::int from property_listings l where l.agent_id = a.id and l.status = 'rented') as rented,
      count(*) over() as total
    from agents a left join agencies ag on ag.id = a.agency_id left join cities c on c.id = ag.city_id
    join users u on u.id = a.user_id and u.status = 'active'
    where true
      ${opts.city ? sql`and c.slug = ${opts.city}` : sql``}
      ${opts.q ? sql`and (a.display_name ilike ${"%" + opts.q + "%"} or ag.name ilike ${"%" + opts.q + "%"})` : sql``}
      ${opts.specialization ? sql`and a.specializations ? ${opts.specialization}` : sql``}
      ${opts.verified ? sql`and a.verification_level >= 2` : sql``}
    order by a.is_featured desc, a.verification_level desc, active_listings desc, a.display_name
    limit 24 offset ${(page - 1) * 24}`);
  return {
    total: Number(rows[0]?.total ?? 0),
    items: rows.map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.display_name as string,
      photo: (r.photo_url as string) ?? null,
      experienceYears: r.experience_years != null ? Number(r.experience_years) : null,
      specializations: (r.specializations as string[]) ?? [],
      verificationLevel: Number(r.verification_level),
      rating: Number(r.rating_avg),
      reviews: Number(r.reviews_count),
      featured: !!r.is_featured,
      responseTimeMins: r.response_time_mins != null ? Number(r.response_time_mins) : null,
      agencyName: (r.agency_name as string) ?? null,
      agencySlug: (r.agency_slug as string) ?? null,
      cityName: (r.city_name as string) ?? null,
      activeListings: Number(r.active_listings),
      sold: Number(r.sold),
      rented: Number(r.rented),
    })),
  };
}

export async function getAgentProfile(db: Database, slug: string) {
  const [a] = await db.select().from(s.agents).where(eq(s.agents.slug, slug));
  if (!a) return null;
  const [user] = await db.select({ status: s.users.status, createdAt: s.users.createdAt }).from(s.users).where(eq(s.users.id, a.userId));
  if (user?.status !== "active") return null;
  const [agency] = a.agencyId ? await db.select().from(s.agencies).where(eq(s.agencies.id, a.agencyId)) : [];
  const areas = await db.select({ name: s.locations.name, slug: s.locations.slug, fullName: s.locations.fullName }).from(s.agentAreas).innerJoin(s.locations, eq(s.locations.id, s.agentAreas.locationId)).where(eq(s.agentAreas.agentId, a.id));
  const [stats] = await db.execute<Row>(sql`select count(*) filter (where status='active')::int as active, count(*) filter (where status='sold')::int as sold, count(*) filter (where status='rented')::int as rented from property_listings where agent_id = ${a.id}`);
  const listings = await createSearchEngine(db).search({ agent: a.id, pageSize: 12, sort: "newest" });
  return { agent: a, agency: agency ?? null, areas, stats: { active: Number(stats.active), sold: Number(stats.sold), rented: Number(stats.rented) }, listings: listings.items, memberSince: user.createdAt };
}

export async function getMyAgentProfile(db: Database, actor: Actor) {
  const [a] = await db.select().from(s.agents).where(eq(s.agents.userId, actor.id));
  return a ?? null;
}

const agentProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(2000).optional().default(""),
  experienceYears: z.coerce.number().int().min(0).max(60).optional().nullable(),
  phone: pkPhone,
  whatsapp: z.union([z.literal(""), pkPhone]).optional(),
  specializations: z.array(z.string().max(40)).max(8).default([]),
  languages: z.array(z.string().max(20)).max(6).default([]),
  areaSlugs: z.array(z.string()).max(10).default([]),
  associationName: z.string().trim().max(100).optional().nullable(),
  associationNumber: z.string().trim().max(60).optional().nullable(),
  fbrNtn: z.string().trim().max(30).optional().nullable(),
  officeAddress: z.string().trim().max(250).optional().nullable(),
  officePhone: z.string().trim().max(40).optional().nullable(),
});

export async function upsertAgentProfile(db: Database, actor: Actor | null, raw: unknown) {
  requireActor(actor);
  if (!actor.roles.includes("agent") && !actor.roles.includes("agency")) throw forbidden("Switch to an agent account to create an agent profile");
  const parsed = agentProfileSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Check your profile details", parsed.error.flatten());
  const d = parsed.data;
  const existing = await getMyAgentProfile(db, actor);
  const values = {
    displayName: d.displayName,
    bio: d.bio,
    experienceYears: d.experienceYears ?? null,
    phone: d.phone,
    whatsapp: d.whatsapp || d.phone,
    specializations: d.specializations,
    languages: d.languages,
    associationName: d.associationName ?? null,
    associationNumber: d.associationNumber ?? null,
    fbrNtn: d.fbrNtn ?? null,
    officeAddress: d.officeAddress ?? null,
    officePhone: d.officePhone ?? null,
  };
  let id: string;
  if (existing) {
    await db.update(s.agents).set(values).where(eq(s.agents.id, existing.id));
    id = existing.id;
  } else {
    const [member] = await db.select({ agencyId: s.agencyMembers.agencyId }).from(s.agencyMembers).where(eq(s.agencyMembers.userId, actor.id));
    const [a] = await db.insert(s.agents).values({ ...values, userId: actor.id, agencyId: member?.agencyId ?? null, slug: `${slugify(d.displayName)}-${shortId(4)}` }).returning();
    id = a.id;
  }
  await db.delete(s.agentAreas).where(eq(s.agentAreas.agentId, id));
  if (d.areaSlugs.length) {
    const locs = await db.select({ id: s.locations.id }).from(s.locations).where(sql`${s.locations.slug} in (${sql.join(d.areaSlugs.map((x) => sql`${x}`), sql`, `)})`);
    if (locs.length) await db.insert(s.agentAreas).values(locs.map((l) => ({ agentId: id, locationId: l.id })));
  }
  return id;
}

/* ------------------------------------------------------------------ */
/* Agencies                                                             */
/* ------------------------------------------------------------------ */

export async function listAgencies(db: Database, opts: { city?: string; q?: string } = {}) {
  const rows = await db.execute<Row>(sql`
    select ag.id, ag.slug, ag.name, ag.logo_url, ag.description, ag.verification_level, ag.rating_avg, ag.reviews_count, ag.established_year, c.name as city_name,
      (select count(*)::int from agents a where a.agency_id = ag.id) as agents,
      (select count(*)::int from property_listings l where l.agency_id = ag.id and l.status = 'active') as listings
    from agencies ag left join cities c on c.id = ag.city_id
    where ag.status = 'active' ${opts.city ? sql`and c.slug = ${opts.city}` : sql``} ${opts.q ? sql`and ag.name ilike ${"%" + opts.q + "%"}` : sql``}
    order by ag.verification_level desc, listings desc limit 60`);
  return rows.map((r) => ({ id: r.id as string, slug: r.slug as string, name: r.name as string, logo: (r.logo_url as string) ?? null, description: (r.description as string) ?? "", verificationLevel: Number(r.verification_level), rating: Number(r.rating_avg), reviews: Number(r.reviews_count), established: r.established_year ? Number(r.established_year) : null, cityName: (r.city_name as string) ?? null, agents: Number(r.agents), listings: Number(r.listings) }));
}

export async function getAgencyProfile(db: Database, slug: string) {
  const [agency] = await db.select().from(s.agencies).where(eq(s.agencies.slug, slug));
  if (!agency || agency.status !== "active") return null;
  const [city] = agency.cityId ? await db.select().from(s.cities).where(eq(s.cities.id, agency.cityId)) : [];
  const agents = await db.select().from(s.agents).where(eq(s.agents.agencyId, agency.id)).orderBy(desc(s.agents.verificationLevel));
  const listings = await createSearchEngine(db).search({ agency: agency.id, pageSize: 12 });
  return { agency, city: city ?? null, agents, listings: listings.items, totalListings: listings.total };
}

export async function myAgency(db: Database, actor: Actor) {
  const [m] = await db.select({ m: s.agencyMembers, a: s.agencies }).from(s.agencyMembers).innerJoin(s.agencies, eq(s.agencies.id, s.agencyMembers.agencyId)).where(eq(s.agencyMembers.userId, actor.id));
  return m ? { agency: m.a, role: m.m.role } : null;
}

export async function createAgency(db: Database, actor: Actor | null, input: { name: string; cityId?: string; phone?: string; description?: string }) {
  requireActor(actor);
  if (!actor.roles.includes("agency")) throw forbidden("Only agency accounts can create an agency");
  if (await myAgency(db, actor)) throw conflict("You already belong to an agency");
  if (!input.name?.trim() || input.name.length > 120) throw badRequest("Enter the agency name");
  const [a] = await db.insert(s.agencies).values({ ownerId: actor.id, name: input.name.trim(), slug: `${slugify(input.name)}-${shortId(3)}`, cityId: input.cityId ?? null, phone: input.phone ?? null, description: input.description ?? null }).returning();
  await db.insert(s.agencyMembers).values({ agencyId: a.id, userId: actor.id, role: "admin" });
  return a;
}

export async function updateAgency(db: Database, actor: Actor | null, patch: { name?: string; description?: string; phone?: string; whatsapp?: string; email?: string; website?: string; address?: string; establishedYear?: number }) {
  requirePerm(actor, "agency.manage");
  const mine = await myAgency(db, actor);
  if (!mine || mine.role !== "admin") throw forbidden("Only agency admins can edit the agency");
  await db.update(s.agencies).set({ ...patch }).where(eq(s.agencies.id, mine.agency.id));
}

export async function agencyTeam(db: Database, actor: Actor) {
  const mine = await myAgency(db, actor);
  if (!mine) throw notFound("Agency");
  const rows = await db.execute<Row>(sql`
    select m.user_id, m.role, m.status, u.name, u.email, u.phone, u.last_login_at, a.id as agent_id, a.slug as agent_slug,
      (select count(*)::int from property_listings l where l.posted_by_id = m.user_id and l.status = 'active') as listings,
      (select count(*)::int from leads ld where ld.recipient_id = m.user_id and ld.created_at > now() - interval '30 days') as leads_30d,
      (select count(*)::int from leads ld where ld.recipient_id = m.user_id and ld.status = 'won') as won
    from agency_members m join users u on u.id = m.user_id left join agents a on a.user_id = m.user_id
    where m.agency_id = ${mine.agency.id} order by m.role, u.name`);
  const plan = await getActivePlan(db, mine.agency.ownerId ?? actor.id);
  return { agency: mine.agency, myRole: mine.role, seats: plan.agentSeats, plan: plan.name, members: rows };
}

const memberSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: pkPhone,
  role: z.enum(AGENCY_MEMBER_ROLES),
  temporaryPassword: z.string().min(8).max(64),
});

/** Agency admins create employee accounts directly (spec: "Agency admin can create employee accounts"). */
export async function addAgencyMember(db: Database, actor: Actor | null, raw: unknown) {
  requirePerm(actor, "agency.members.manage");
  const mine = await myAgency(db, actor);
  if (!mine || mine.role !== "admin") throw forbidden("Only agency admins can add team members");
  const parsed = memberSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Check the team member details", parsed.error.flatten());
  const d = parsed.data;
  const plan = await getActivePlan(db, actor.id);
  if (!hasCapability(plan, "team")) throw paymentRequired("Team management needs the Agency plan");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.agencyMembers).where(eq(s.agencyMembers.agencyId, mine.agency.id));
  if (n >= plan.agentSeats) throw paymentRequired(`Your plan includes ${plan.agentSeats} seats. Upgrade to add more.`);
  const [exists] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, d.email));
  if (exists) throw conflict("An account with this email already exists. Ask them to leave their current agency first.");
  const [u] = await db.insert(s.users).values({ email: d.email, name: d.name, phone: d.phone, passwordHash: await hashPassword(d.temporaryPassword), primaryRole: "agent" }).returning();
  await assignRole(db, u.id, "agent", actor.id);
  await db.insert(s.agencyMembers).values({ agencyId: mine.agency.id, userId: u.id, role: d.role, invitedById: actor.id });
  if (d.role === "agent" || d.role === "manager") await db.insert(s.agents).values({ userId: u.id, agencyId: mine.agency.id, slug: `${slugify(d.name)}-${shortId(4)}`, displayName: d.name, phone: d.phone, whatsapp: d.phone });
  await notify(db, { userId: u.id, type: "system", title: `Welcome to ${mine.agency.name}`, body: "Your agency created this account. Please change your temporary password in Account → Security.", link: "/account" });
  await audit(db, { actorId: actor.id, action: "agency.member.add", entityType: "agency", entityId: mine.agency.id, metadata: { userId: u.id, role: d.role } });
  return u.id;
}

export async function updateAgencyMember(db: Database, actor: Actor | null, userId: string, patch: { role?: string; status?: "active" | "disabled" }) {
  requirePerm(actor, "agency.members.manage");
  const mine = await myAgency(db, actor);
  if (!mine || mine.role !== "admin") throw forbidden();
  if (userId === actor.id) throw badRequest("You can't change your own role");
  if (patch.role && !AGENCY_MEMBER_ROLES.includes(patch.role as never)) throw badRequest("Unknown role");
  await db.update(s.agencyMembers).set({ ...(patch.role ? { role: patch.role } : {}), ...(patch.status ? { status: patch.status } : {}) }).where(and(eq(s.agencyMembers.agencyId, mine.agency.id), eq(s.agencyMembers.userId, userId)));
  if (patch.status === "disabled") await db.update(s.propertyListings).set({ status: "paused" }).where(and(eq(s.propertyListings.postedById, userId), eq(s.propertyListings.status, "active")));
}

/* ------------------------------------------------------------------ */
/* Developers & projects                                                */
/* ------------------------------------------------------------------ */

export async function listDevelopers(db: Database) {
  const rows = await db.execute<Row>(sql`
    select d.*, c.name as city_name, (select count(*)::int from projects p where p.developer_id = d.id and p.publish_status = 'published') as projects
    from developers d left join cities c on c.id = d.city_id order by d.verification_level desc, projects desc`);
  return rows;
}

export async function getDeveloperProfile(db: Database, slug: string) {
  const [d] = await db.select().from(s.developers).where(eq(s.developers.slug, slug));
  if (!d) return null;
  const projects = await listProjects(db, { developerId: d.id });
  return { developer: d, projects };
}

export async function listProjects(db: Database, opts: { city?: string; status?: string; developerId?: string; q?: string; unitType?: string; includeUnpublished?: boolean } = {}) {
  const rows = await db.execute<Row>(sql`
    select p.id, p.slug, p.name, p.tagline, p.status, p.construction_progress, p.min_price, p.max_price, p.cover_image, p.is_featured, p.expected_completion,
      p.total_units, p.available_units, p.publish_status, c.name as city_name, c.slug as city_slug, l.name as location_name, d.name as developer_name, d.slug as developer_slug, d.verification_level,
      (select json_agg(distinct u.type) from project_units u where u.project_id = p.id) as unit_types,
      (select min(pp.down_payment_pct) from project_payment_plans pp where pp.project_id = p.id) as min_down
    from projects p join cities c on c.id = p.city_id join developers d on d.id = p.developer_id left join locations l on l.id = p.location_id
    where ${opts.includeUnpublished ? sql`true` : sql`p.publish_status = 'published'`}
      ${opts.city ? sql`and c.slug = ${opts.city}` : sql``}
      ${opts.status ? sql`and p.status = ${opts.status}` : sql``}
      ${opts.developerId ? sql`and p.developer_id = ${opts.developerId}` : sql``}
      ${opts.q ? sql`and (p.name ilike ${"%" + opts.q + "%"} or d.name ilike ${"%" + opts.q + "%"})` : sql``}
      ${opts.unitType ? sql`and exists (select 1 from project_units u where u.project_id = p.id and u.type = ${opts.unitType})` : sql``}
    order by p.is_featured desc, p.created_at desc`);
  return rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    tagline: (r.tagline as string) ?? "",
    status: r.status as string,
    progress: Number(r.construction_progress),
    minPrice: r.min_price != null ? Number(r.min_price) : null,
    maxPrice: r.max_price != null ? Number(r.max_price) : null,
    cover: (r.cover_image as string) ?? null,
    featured: !!r.is_featured,
    completion: (r.expected_completion as string) ?? null,
    totalUnits: r.total_units != null ? Number(r.total_units) : null,
    availableUnits: r.available_units != null ? Number(r.available_units) : null,
    publishStatus: r.publish_status as string,
    cityName: r.city_name as string,
    citySlug: r.city_slug as string,
    locationName: (r.location_name as string) ?? null,
    developerName: r.developer_name as string,
    developerSlug: r.developer_slug as string,
    developerVerified: Number(r.verification_level) >= 2,
    unitTypes: (r.unit_types as string[]) ?? [],
    minDownPct: r.min_down != null ? Number(r.min_down) : null,
  }));
}

export async function getProject(db: Database, slug: string, viewer?: Actor | null) {
  const [p] = await db.select().from(s.projects).where(eq(s.projects.slug, slug));
  if (!p) return null;
  const [developer] = await db.select().from(s.developers).where(eq(s.developers.id, p.developerId));
  if (p.publishStatus !== "published" && developer.ownerId !== viewer?.id && !viewer?.isStaff) return null;
  const [city] = await db.select().from(s.cities).where(eq(s.cities.id, p.cityId));
  const [location] = p.locationId ? await db.select().from(s.locations).where(eq(s.locations.id, p.locationId)) : [];
  const media = await db.select().from(s.projectMedia).where(eq(s.projectMedia.projectId, p.id)).orderBy(s.projectMedia.sortOrder);
  const units = await db.select().from(s.projectUnits).where(eq(s.projectUnits.projectId, p.id)).orderBy(s.projectUnits.priceFrom);
  const plans = await db.select().from(s.projectPaymentPlans).where(eq(s.projectPaymentPlans.projectId, p.id));
  return { project: p, developer, city, location: location ?? null, gallery: media.filter((m) => m.kind === "image"), masterPlans: media.filter((m) => m.kind === "master_plan"), videos: media.filter((m) => m.kind === "video"), units, plans, isOwner: developer.ownerId === viewer?.id };
}

export async function myDeveloper(db: Database, actor: Actor) {
  const [d] = await db.select().from(s.developers).where(eq(s.developers.ownerId, actor.id));
  return d ?? null;
}

export async function createDeveloperProfile(db: Database, actor: Actor | null, input: { name: string; description?: string; cityId?: string; website?: string; phone?: string }) {
  requirePerm(actor, "project.create");
  if (await myDeveloper(db, actor)) throw conflict("You already have a developer profile");
  if (!input.name?.trim()) throw badRequest("Enter the company name");
  const [d] = await db.insert(s.developers).values({ ownerId: actor.id, name: input.name.trim(), slug: `${slugify(input.name)}-${shortId(3)}`, description: input.description ?? null, cityId: input.cityId ?? null, website: input.website ?? null, phone: input.phone ?? null }).returning();
  return d;
}

export async function updateDeveloperProfile(db: Database, actor: Actor | null, patch: { name?: string; description?: string; website?: string; phone?: string; email?: string; establishedYear?: number | null; cityId?: string | null }) {
  requirePerm(actor, "project.create");
  const dev = await myDeveloper(db, actor);
  if (!dev) throw notFound("Developer profile");
  if (patch.name != null && !patch.name.trim()) throw badRequest("Enter the company name");
  if (patch.website && !/^https?:\/\//.test(patch.website)) throw badRequest("Website must start with http:// or https://");
  await db
    .update(s.developers)
    .set({
      ...(patch.name ? { name: patch.name.trim().slice(0, 120) } : {}),
      ...(patch.description != null ? { description: patch.description.slice(0, 4000) } : {}),
      ...(patch.website != null ? { website: patch.website || null } : {}),
      ...(patch.phone != null ? { phone: patch.phone || null } : {}),
      ...(patch.email != null ? { email: patch.email || null } : {}),
      ...(patch.establishedYear !== undefined ? { establishedYear: patch.establishedYear } : {}),
      ...(patch.cityId !== undefined ? { cityId: patch.cityId } : {}),
    })
    .where(eq(s.developers.id, dev.id));
}

const projectSchema = z.object({
  name: z.string().trim().min(3).max(120),
  tagline: z.string().trim().max(160).optional().default(""),
  description: z.string().trim().min(40).max(8000),
  cityId: z.string().uuid(),
  locationSlug: z.string().optional().nullable(),
  address: z.string().max(200).optional().default(""),
  lat: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
  status: z.enum(PROJECT_STATUSES),
  constructionProgress: z.coerce.number().int().min(0).max(100).default(0),
  launchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expectedCompletion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  amenities: z.array(z.string().max(60)).max(40).default([]),
  coverImage: z.string().max(500).optional().nullable(),
  gallery: z.array(z.string().max(500)).max(30).default([]),
  videoUrl: z.string().max(500).optional().nullable(),
  brochureUrl: z.string().max(500).optional().nullable(),
  units: z
    .array(
      z.object({
        type: z.enum(UNIT_TYPES),
        name: z.string().trim().min(2).max(80),
        areaSqft: z.coerce.number().positive(),
        beds: z.coerce.number().int().min(0).max(10).optional().nullable(),
        baths: z.coerce.number().int().min(0).max(10).optional().nullable(),
        priceFrom: z.coerce.number().int().positive(),
        priceTo: z.coerce.number().int().positive().optional().nullable(),
        totalUnits: z.coerce.number().int().min(0),
        availableUnits: z.coerce.number().int().min(0),
      }),
    )
    .min(1, "Add at least one unit type"),
  plans: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        downPaymentPct: z.coerce.number().min(0).max(100),
        durationMonths: z.coerce.number().int().min(1).max(120),
        frequency: z.enum(["monthly", "quarterly"]),
        possessionPct: z.coerce.number().min(0).max(100).default(0),
        balloonPct: z.coerce.number().min(0).max(100).default(0),
        notes: z.string().max(300).optional().nullable(),
      }),
    )
    .default([]),
});

export async function saveProject(db: Database, actor: Actor | null, raw: unknown, projectId?: string) {
  requirePerm(actor, "project.create");
  const dev = await myDeveloper(db, actor);
  if (!dev) throw badRequest("Create your developer profile first");
  const plan = await getActivePlan(db, actor.id);
  if (!hasCapability(plan, "projects") && !actor.isStaff) throw paymentRequired("Publishing projects needs the Developer plan");
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Please fix the project details", parsed.error.flatten());
  const d = parsed.data;
  for (const u of d.units) if (u.availableUnits > u.totalUnits) throw badRequest(`${u.name}: available units exceed total`);
  for (const p of d.plans) if (p.downPaymentPct + p.possessionPct + p.balloonPct > 100) throw badRequest(`${p.name}: percentages exceed 100%`);
  const [loc] = d.locationSlug ? await db.select().from(s.locations).where(eq(s.locations.slug, d.locationSlug)) : [];
  const [city] = await db.select().from(s.cities).where(eq(s.cities.id, d.cityId));
  if (!city) throw badRequest("Unknown city");
  const values = {
    developerId: dev.id,
    name: d.name,
    tagline: d.tagline,
    description: d.description,
    cityId: d.cityId,
    locationId: loc?.id ?? null,
    address: d.address,
    lat: d.lat ?? loc?.lat ?? city.lat,
    lng: d.lng ?? loc?.lng ?? city.lng,
    status: d.status,
    constructionProgress: d.constructionProgress,
    launchDate: d.launchDate ?? null,
    expectedCompletion: d.expectedCompletion ?? null,
    minPrice: Math.min(...d.units.map((u) => u.priceFrom)),
    maxPrice: Math.max(...d.units.map((u) => u.priceTo ?? u.priceFrom)),
    totalUnits: d.units.reduce((t, u) => t + u.totalUnits, 0),
    availableUnits: d.units.reduce((t, u) => t + u.availableUnits, 0),
    amenities: d.amenities,
    coverImage: d.coverImage ?? d.gallery[0] ?? null,
    videoUrl: d.videoUrl ?? null,
    brochureUrl: d.brochureUrl ?? null,
  };
  let id = projectId;
  if (id) {
    const [existing] = await db.select().from(s.projects).where(eq(s.projects.id, id));
    if (!existing || (existing.developerId !== dev.id && !actor.isStaff)) throw forbidden();
    await db.update(s.projects).set(values).where(eq(s.projects.id, id));
    await db.delete(s.projectUnits).where(eq(s.projectUnits.projectId, id));
    await db.delete(s.projectPaymentPlans).where(eq(s.projectPaymentPlans.projectId, id));
    await db.delete(s.projectMedia).where(and(eq(s.projectMedia.projectId, id), eq(s.projectMedia.kind, "image")));
  } else {
    const [p] = await db.insert(s.projects).values({ ...values, slug: `${slugify(`${d.name} ${city.name}`)}-${shortId(3)}`, publishStatus: "pending" }).returning();
    id = p.id;
  }
  await db.insert(s.projectUnits).values(d.units.map((u) => ({ ...u, projectId: id!, beds: u.beds ?? null, baths: u.baths ?? null, priceTo: u.priceTo ?? null })));
  if (d.plans.length) await db.insert(s.projectPaymentPlans).values(d.plans.map((p) => ({ ...p, projectId: id!, notes: p.notes ?? null })));
  if (d.gallery.length) await db.insert(s.projectMedia).values(d.gallery.map((url, i) => ({ projectId: id!, url, kind: "image" as const, sortOrder: i })));
  await audit(db, { actorId: actor.id, action: projectId ? "project.update" : "project.create", entityType: "project", entityId: id });
  return id!;
}

export async function moderateProject(db: Database, actor: Actor | null, id: string, publishStatus: "published" | "rejected" | "draft", featured?: boolean) {
  requirePerm(actor, "project.manage.any");
  await db.update(s.projects).set({ publishStatus, ...(featured != null ? { isFeatured: featured } : {}) }).where(eq(s.projects.id, id));
  await audit(db, { actorId: actor.id, action: `project.${publishStatus}`, entityType: "project", entityId: id });
}

export async function updateUnitAvailability(db: Database, actor: Actor | null, unitId: string, available: number) {
  requirePerm(actor, "project.create");
  const [u] = await db.select({ u: s.projectUnits, ownerId: s.developers.ownerId, projectId: s.projects.id }).from(s.projectUnits).innerJoin(s.projects, eq(s.projects.id, s.projectUnits.projectId)).innerJoin(s.developers, eq(s.developers.id, s.projects.developerId)).where(eq(s.projectUnits.id, unitId));
  if (!u) throw notFound("Unit");
  if (u.ownerId !== actor.id && !actor.isStaff) throw forbidden();
  if (available < 0 || available > u.u.totalUnits) throw badRequest("Invalid availability");
  await db.update(s.projectUnits).set({ availableUnits: available }).where(eq(s.projectUnits.id, unitId));
  await db.execute(sql`update projects set available_units = (select coalesce(sum(available_units),0) from project_units where project_id = ${u.projectId}) where id = ${u.projectId}`);
}
