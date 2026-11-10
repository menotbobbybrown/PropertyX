import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@propertyx/database";
import * as s from "@propertyx/database";
import { z } from "zod";
import { pkPhone, PROPERTY_TYPE_KEYS, PURPOSES, AREA_UNITS } from "@propertyx/shared";
import { badRequest, forbidden, notFound, tooMany, requireActor, type Actor } from "./errors";
import { notify } from "@propertyx/notifications";
import { rateLimit } from "@propertyx/auth";

export const requirementInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: pkPhone,
  email: z.string().trim().email().optional().or(z.literal("")),
  cityName: z.string().trim().min(2).max(60),
  locationName: z.string().trim().min(2).max(120),
  propertyType: z.enum(PROPERTY_TYPE_KEYS),
  purpose: z.enum(PURPOSES).default("sale"),
  minBudget: z.coerce.number().int().positive().optional().nullable(),
  maxBudget: z.coerce.number().int().positive(),
  areaValue: z.coerce.number().positive().optional().nullable(),
  areaUnit: z.enum(AREA_UNITS).optional().nullable(),
  description: z.string().trim().min(10).max(2000),
});

export const pitchInputSchema = z.object({
  listingId: z.string().uuid().optional().nullable(),
  pitchText: z.string().trim().min(10).max(1000),
  offeredPrice: z.coerce.number().int().positive().optional().nullable(),
});

export async function listPropertyRequirements(
  db: Database,
  opts: {
    city?: string;
    propertyType?: string;
    purpose?: "sale" | "rent";
    status?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = Math.max(0, opts.offset ?? 0);
  const status = opts.status ?? "active";

  const conditions = [eq(s.propertyRequirements.status, status)];
  if (opts.city) {
    conditions.push(sql`lower(${s.propertyRequirements.cityName}) = lower(${opts.city})`);
  }
  if (opts.propertyType) {
    conditions.push(eq(s.propertyRequirements.propertyType, opts.propertyType as any));
  }
  if (opts.purpose) {
    conditions.push(eq(s.propertyRequirements.purpose, opts.purpose));
  }

  const items = await db
    .select()
    .from(s.propertyRequirements)
    .where(and(...conditions))
    .orderBy(desc(s.propertyRequirements.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(s.propertyRequirements)
    .where(and(...conditions));

  return { items, total: count };
}

export async function createPropertyRequirement(
  db: Database,
  actor: Actor | null,
  raw: unknown,
  meta: { ip?: string | null } = {},
) {
  const parsed = requirementInputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Please check your requirement details", parsed.error.flatten());
  const input = parsed.data;

  const rl = await rateLimit(db, `wanted:${actor?.id ?? meta.ip ?? "anon"}`, 5, 3600);
  if (!rl.ok) throw tooMany("You've posted several requirements recently. Please try again later.");

  const [city] = await db
    .select({ id: s.cities.id })
    .from(s.cities)
    .where(sql`lower(name) = lower(${input.cityName})`)
    .limit(1);

  const [req] = await db
    .insert(s.propertyRequirements)
    .values({
      userId: actor?.id ?? null,
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      cityId: city?.id ?? null,
      cityName: input.cityName,
      locationName: input.locationName,
      propertyType: input.propertyType,
      purpose: input.purpose,
      minBudget: input.minBudget ?? null,
      maxBudget: input.maxBudget,
      areaValue: input.areaValue ?? null,
      areaUnit: input.areaUnit ?? null,
      description: input.description,
      status: "active",
      isDirectBuyer: true,
      pitchesCount: 0,
    })
    .returning();

  return req;
}

export async function pitchPropertyRequirement(
  db: Database,
  actor: Actor,
  requirementId: string,
  raw: unknown,
) {
  requireActor(actor);

  // Invariant: Only verified agents or level 2+ accounts can pitch!
  // Roadside unverified brokers cannot spam buyers.
  const [agent] = await db.select().from(s.agents).where(eq(s.agents.userId, actor.id));
  const isVerified = (agent?.verificationLevel ?? 0) >= 2 || (actor.verificationLevel ?? 0) >= 2;
  if (!isVerified) {
    throw forbidden("Only Verified Agents (Association accredited or CNIC verified) can pitch on the Buyer Board to prevent ghost inventory.");
  }

  const parsed = pitchInputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Please check pitch details", parsed.error.flatten());
  const input = parsed.data;

  const [req] = await db
    .select()
    .from(s.propertyRequirements)
    .where(eq(s.propertyRequirements.id, requirementId));
  if (!req) throw notFound("Requirement");
  if (req.status !== "active") throw badRequest("This requirement is no longer active");

  // Validate listing if supplied
  if (input.listingId) {
    const [l] = await db.select().from(s.propertyListings).where(eq(s.propertyListings.id, input.listingId));
    if (!l) throw notFound("Listing");
  }

  const [pitch] = await db
    .insert(s.requirementPitches)
    .values({
      requirementId: req.id,
      agentId: agent?.id ?? null,
      userId: actor.id,
      listingId: input.listingId ?? null,
      pitchText: input.pitchText,
      offeredPrice: input.offeredPrice ?? null,
    })
    .returning();

  await db
    .update(s.propertyRequirements)
    .set({
      pitchesCount: sql`${s.propertyRequirements.pitchesCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(s.propertyRequirements.id, req.id));

  // Notify requirement creator if registered user
  if (req.userId) {
    await notify(db, {
      userId: req.userId,
      type: "new_lead",
      title: "New verified pitch on your requirement",
      body: `${agent?.displayName ?? actor.name} pitched a matching property in ${req.locationName}.`,
      link: `/wanted`,
    }).catch(() => null);
  }

  return pitch;
}

export async function listRequirementPitches(db: Database, requirementId: string) {
  return db
    .select({
      pitch: s.requirementPitches,
      agent: s.agents,
    })
    .from(s.requirementPitches)
    .leftJoin(s.agents, eq(s.agents.id, s.requirementPitches.agentId))
    .where(eq(s.requirementPitches.requirementId, requirementId))
    .orderBy(desc(s.requirementPitches.createdAt));
}
