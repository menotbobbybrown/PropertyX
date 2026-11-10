import { and, eq, inArray, sql, desc } from "drizzle-orm";
import type { Database } from "@propertyx/database";
import * as s from "@propertyx/database";
import { createSearchEngine, type ListingCard } from "@propertyx/search";
import { notify } from "@propertyx/notifications";
import { audit } from "@propertyx/auth";
import {
  listingInputSchema,
  propertyTypeInfo,
  toSqft,
  slugify,
  shortId,
  PROPERTY_TYPE_LABELS,
  formatPriceWords,
  type ListingInput,
  type ListingStatus,
  type SearchQuery,
} from "@propertyx/shared";
import { badRequest, forbidden, notFound, paymentRequired, requireActor, requirePerm, type Actor } from "./errors";
import { storeImage } from "./storage";
import { getActivePlan } from "./billing";
import { scanListing } from "./fraud";
import { getSetting } from "./settings";

export const engine = (db: Database) => createSearchEngine(db);

/* ------------------------------------------------------------------ */
/* Detail                                                               */
/* ------------------------------------------------------------------ */

export async function getListingDetail(db: Database, slugOrId: string, viewer?: Actor | null) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const [row] = await db
    .select({ l: s.propertyListings, p: s.properties })
    .from(s.propertyListings)
    .innerJoin(s.properties, eq(s.properties.id, s.propertyListings.propertyId))
    .where(isUuid ? eq(s.propertyListings.id, slugOrId) : eq(s.propertyListings.slug, slugOrId))
    .limit(1);
  if (!row) return null;
  const { l, p } = row;
  const isOwner = !!viewer && (viewer.id === l.postedById || viewer.id === p.ownerId);
  const canModerate = !!viewer?.permissions.includes("listing.moderate");
  const publicStatuses: ListingStatus[] = ["active", "sold", "rented", "expired"];
  if (!publicStatuses.includes(l.status) && !isOwner && !canModerate) return null;

  const [city] = await db.select().from(s.cities).where(eq(s.cities.id, p.cityId));
  const [province] = await db.select().from(s.provinces).where(eq(s.provinces.id, city.provinceId));
  const locRows = await db
    .select({ id: s.locations.id, kind: s.locations.kind, name: s.locations.name, slug: s.locations.slug, refId: s.locations.refId })
    .from(s.locations)
    .where(inArray(s.locations.refId, [p.areaId, p.societyId, p.blockId].filter(Boolean) as string[]));
  const area = locRows.find((x) => x.refId === (p.societyId ?? p.areaId));
  const block = locRows.find((x) => x.refId === p.blockId);
  const featureRows = await db.select({ key: s.features.key, label: s.features.label, group: s.features.group }).from(s.propertyFeatures).innerJoin(s.features, eq(s.features.id, s.propertyFeatures.featureId)).where(eq(s.propertyFeatures.propertyId, p.id));
  const media = await db.select().from(s.propertyMedia).where(eq(s.propertyMedia.propertyId, p.id)).orderBy(s.propertyMedia.sortOrder);
  const history = await db.select().from(s.propertyPriceHistory).where(eq(s.propertyPriceHistory.listingId, l.id)).orderBy(s.propertyPriceHistory.changedAt);

  let agent: (typeof s.agents.$inferSelect & { agencyName: string | null; agencySlug: string | null; agencyLogo: string | null; agencyVerification: number | null }) | null = null;
  if (l.agentId) {
    const [a] = await db
      .select({ a: s.agents, agencyName: s.agencies.name, agencySlug: s.agencies.slug, agencyLogo: s.agencies.logoUrl, agencyVerification: s.agencies.verificationLevel })
      .from(s.agents)
      .leftJoin(s.agencies, eq(s.agencies.id, s.agents.agencyId))
      .where(eq(s.agents.id, l.agentId));
    if (a) agent = { ...a.a, agencyName: a.agencyName, agencySlug: a.agencySlug, agencyLogo: a.agencyLogo, agencyVerification: a.agencyVerification };
  }
  const [poster] = l.postedById ? await db.select({ id: s.users.id, name: s.users.name, verificationLevel: s.users.verificationLevel, createdAt: s.users.createdAt, phoneVerifiedAt: s.users.phoneVerifiedAt }).from(s.users).where(eq(s.users.id, l.postedById)) : [];
  let isSaved = false;
  if (viewer) {
    const [sv] = await db.select().from(s.savedProperties).where(and(eq(s.savedProperties.userId, viewer.id), eq(s.savedProperties.listingId, l.id)));
    isSaved = !!sv;
  }
  let project: { name: string; slug: string } | null = null;
  if (l.projectId) {
    const [pr] = await db.select({ name: s.projects.name, slug: s.projects.slug }).from(s.projects).where(eq(s.projects.id, l.projectId));
    project = pr ?? null;
  }
  return {
    listing: l,
    property: p,
    city,
    province,
    area: area ?? null,
    block: block ?? null,
    features: featureRows,
    images: media.filter((m) => m.kind === "image"),
    floorPlans: media.filter((m) => m.kind === "floor_plan"),
    videos: media.filter((m) => m.kind === "video"),
    priceHistory: history,
    agent,
    poster: poster ?? null,
    project,
    isOwner,
    canModerate,
    isSaved,
    isFeatured: !!l.featuredUntil && l.featuredUntil > new Date(),
  };
}
export type ListingDetail = NonNullable<Awaited<ReturnType<typeof getListingDetail>>>;

export async function similarListings(db: Database, d: ListingDetail, limit = 6): Promise<ListingCard[]> {
  const q: SearchQuery = {
    purpose: d.listing.purpose,
    types: [d.property.type],
    city: d.city.slug,
    priceMin: Math.round(d.listing.price * 0.7),
    priceMax: Math.round(d.listing.price * 1.3),
    excludeId: d.listing.id,
    pageSize: limit,
  };
  const r = await engine(db).search(d.area ? { ...q, location: d.area.slug } : q);
  if (r.items.length >= 3 || !d.area) return r.items;
  return (await engine(db).search(q)).items;
}

/* ------------------------------------------------------------------ */
/* Engagement                                                           */
/* ------------------------------------------------------------------ */

const EVENT_TYPES = ["view", "save", "call_click", "whatsapp_click", "message", "lead", "visit_request", "share", "brochure", "phone_reveal"] as const;
export type ListingEventType = (typeof EVENT_TYPES)[number];

export async function recordListingEvent(db: Database, e: { listingId?: string; projectId?: string; type: ListingEventType; userId?: string | null; anonId?: string | null }) {
  if (!EVENT_TYPES.includes(e.type)) throw badRequest("Unknown event");
  if (e.type === "view") {
    // one view per visitor per listing per 6 hours
    const who = e.userId ? sql`user_id = ${e.userId}` : e.anonId ? sql`anon_id = ${e.anonId}` : null;
    if (who) {
      const target = e.listingId ? sql`listing_id = ${e.listingId}` : sql`project_id = ${e.projectId}`;
      const recent = await db.execute(sql`select 1 from listing_events where ${target} and type = 'view' and ${who} and created_at > now() - interval '6 hours' limit 1`);
      if (recent.length) return false;
    }
  }
  await db.insert(s.listingEvents).values({ listingId: e.listingId ?? null, projectId: e.projectId ?? null, type: e.type, userId: e.userId ?? null, anonId: e.anonId ?? null });
  if (e.listingId && e.type === "view") await db.update(s.propertyListings).set({ viewsCount: sql`${s.propertyListings.viewsCount} + 1` }).where(eq(s.propertyListings.id, e.listingId));
  if (e.projectId && e.type === "view") await db.update(s.projects).set({ viewsCount: sql`${s.projects.viewsCount} + 1` }).where(eq(s.projects.id, e.projectId));
  if (e.userId && e.listingId && e.type === "view") await db.insert(s.userEvents).values({ userId: e.userId, type: "view", listingId: e.listingId });
  return true;
}

export async function toggleSaved(db: Database, actor: Actor | null, listingId: string, save?: boolean) {
  requireActor(actor);
  const [l] = await db.select({ id: s.propertyListings.id, price: s.propertyListings.price, postedById: s.propertyListings.postedById, title: s.propertyListings.title, slug: s.propertyListings.slug }).from(s.propertyListings).where(eq(s.propertyListings.id, listingId));
  if (!l) throw notFound("Listing");
  const [existing] = await db.select().from(s.savedProperties).where(and(eq(s.savedProperties.userId, actor.id), eq(s.savedProperties.listingId, listingId)));
  const want = save ?? !existing;
  if (want && !existing) {
    await db.insert(s.savedProperties).values({ userId: actor.id, listingId, priceAtSave: l.price });
    await db.update(s.propertyListings).set({ savesCount: sql`${s.propertyListings.savesCount} + 1` }).where(eq(s.propertyListings.id, listingId));
    await db.insert(s.listingEvents).values({ listingId, type: "save", userId: actor.id });
    await db.insert(s.userEvents).values({ userId: actor.id, type: "save", listingId });
    if (l.postedById && l.postedById !== actor.id)
      await notify(db, { userId: l.postedById, type: "property_saved", title: "Your property was saved", body: `Someone saved “${l.title}”.`, link: `/dashboard/listings/${listingId}` });
  } else if (!want && existing) {
    await db.delete(s.savedProperties).where(and(eq(s.savedProperties.userId, actor.id), eq(s.savedProperties.listingId, listingId)));
    await db.update(s.propertyListings).set({ savesCount: sql`greatest(${s.propertyListings.savesCount} - 1, 0)` }).where(eq(s.propertyListings.id, listingId));
  }
  return { saved: want };
}

export async function listSaved(db: Database, actor: Actor) {
  const rows = await db.select().from(s.savedProperties).where(eq(s.savedProperties.userId, actor.id)).orderBy(desc(s.savedProperties.createdAt));
  const cards = await engine(db).cardsByIds(
    rows.map((r) => r.listingId),
    { anyStatus: true },
  );
  const byId = new Map(rows.map((r) => [r.listingId, r]));
  return cards.map((c) => ({ ...c, priceAtSave: byId.get(c.id)?.priceAtSave ?? null, savedAt: byId.get(c.id)?.createdAt ?? null }));
}

/* ------------------------------------------------------------------ */
/* Media                                                                */
/* ------------------------------------------------------------------ */

export async function uploadListingMedia(db: Database, actor: Actor | null, buf: Buffer, kind: "image" | "floor_plan" = "image") {
  requirePerm(actor, "listing.create");
  const img = await storeImage(buf, "listings");
  const [m] = await db
    .insert(s.propertyMedia)
    .values({ uploadedById: actor.id, kind, url: img.url!, storageKey: img.key, width: img.width, height: img.height, sizeBytes: img.sizeBytes, sha256: img.sha256, perceptualHash: img.perceptualHash })
    .returning();
  return { id: m.id, url: m.url, kind: m.kind, width: m.width, height: m.height };
}

/* ------------------------------------------------------------------ */
/* Create / update                                                      */
/* ------------------------------------------------------------------ */

async function resolveLocation(db: Database, input: ListingInput) {
  const [city] = await db.select().from(s.cities).where(eq(s.cities.id, input.cityId));
  if (!city) throw badRequest("Unknown city");
  let areaName: string | null = null;
  let societyName: string | null = null;
  let blockName: string | null = null;
  let lat = city.lat;
  let lng = city.lng;
  if (input.areaId) {
    const [a] = await db.select().from(s.areas).where(eq(s.areas.id, input.areaId));
    if (!a || a.cityId !== city.id) throw badRequest("Area does not belong to the selected city");
    areaName = a.name;
    lat = a.lat;
    lng = a.lng;
  }
  if (input.societyId) {
    const [so] = await db.select().from(s.societies).where(eq(s.societies.id, input.societyId));
    if (!so || so.cityId !== city.id) throw badRequest("Society does not belong to the selected city");
    societyName = so.name;
    lat = so.lat;
    lng = so.lng;
  }
  if (input.blockId) {
    const [b] = await db.select().from(s.blocks).where(eq(s.blocks.id, input.blockId));
    if (!b || b.cityId !== city.id || (input.societyId && b.societyId !== input.societyId) || (input.areaId && !input.societyId && b.areaId !== input.areaId)) throw badRequest("Block does not belong to the selected area");
    blockName = b.name;
    if (b.lat && b.lng) {
      lat = b.lat;
      lng = b.lng;
    }
  }
  const mostSpecific = input.blockId ?? input.societyId ?? input.areaId ?? city.id;
  const [loc] = await db.select({ id: s.locations.id }).from(s.locations).where(eq(s.locations.refId, mostSpecific));
  return { city, areaName, societyName, blockName, locationId: loc?.id ?? null, fallbackLat: lat, fallbackLng: lng };
}

function qualityScore(input: ListingInput, imageCount: number) {
  let q = 20;
  q += Math.min(30, imageCount * 5);
  q += input.description.length >= 400 ? 15 : input.description.length >= 200 ? 8 : 0;
  q += Math.min(10, input.features.length * 1.5);
  q += input.lat != null ? 8 : 0;
  q += input.highlights.length ? 5 : 0;
  q += input.videoUrl ? 6 : 0;
  q += input.yearBuilt ? 3 : 0;
  q += input.media.some((m) => m.kind === "floor_plan") ? 3 : 0;
  return Math.min(100, Math.round(q));
}

async function attachMedia(db: Database, actor: Actor, propertyId: string, media: ListingInput["media"]) {
  const ids = media.map((m) => m.id);
  if (!ids.length) {
    await db.delete(s.propertyMedia).where(eq(s.propertyMedia.propertyId, propertyId));
    return 0;
  }
  const owned = await db
    .select({ id: s.propertyMedia.id })
    .from(s.propertyMedia)
    .where(and(inArray(s.propertyMedia.id, ids), sql`(${s.propertyMedia.uploadedById} = ${actor.id} or ${s.propertyMedia.propertyId} = ${propertyId})`));
  const ownedSet = new Set(owned.map((o) => o.id));
  let i = 0;
  for (const m of media) {
    if (!ownedSet.has(m.id)) continue;
    await db.update(s.propertyMedia).set({ propertyId, sortOrder: i++, kind: m.kind, caption: m.caption ?? null }).where(eq(s.propertyMedia.id, m.id));
  }
  // detach media removed in the editor
  if (ownedSet.size) await db.delete(s.propertyMedia).where(and(eq(s.propertyMedia.propertyId, propertyId), sql`${s.propertyMedia.id} not in (${sql.join([...ownedSet].map((x) => sql`${x}`), sql`, `)})`));
  return media.filter((m) => m.kind === "image" && ownedSet.has(m.id)).length;
}

async function setFeatures(db: Database, propertyId: string, keys: string[]) {
  await db.delete(s.propertyFeatures).where(eq(s.propertyFeatures.propertyId, propertyId));
  if (!keys.length) return;
  const rows = await db.select({ id: s.features.id }).from(s.features).where(inArray(s.features.key, keys));
  if (rows.length) await db.insert(s.propertyFeatures).values(rows.map((r) => ({ propertyId, featureId: r.id })));
}

async function checkQuota(db: Database, actor: Actor, excludeListingId?: string) {
  if (actor.isStaff) return;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.propertyListings)
    .where(and(eq(s.propertyListings.postedById, actor.id), inArray(s.propertyListings.status, ["active", "pending_review"]), excludeListingId ? sql`${s.propertyListings.id} <> ${excludeListingId}` : sql`true`));

  // Anti-Sybil Guard: Unverified accounts (phone not confirmed) capped at 1 listing
  if (!actor.phoneVerified && n >= 1) {
    throw badRequest("Unverified accounts are limited to 1 listing. Please verify your mobile number with SMS OTP to unlock additional listings.");
  }

  const plan = await getActivePlan(db, actor.id);
  if (n >= plan.listingQuota) throw paymentRequired(`Your ${plan.name} plan allows ${plan.listingQuota} active listings. Upgrade your plan or pause a listing to post more.`);
}

async function agentContext(db: Database, actor: Actor) {
  const [a] = await db.select({ id: s.agents.id, agencyId: s.agents.agencyId }).from(s.agents).where(eq(s.agents.userId, actor.id));
  return a ?? null;
}

/** Trusted posters (identity verified, clean history) skip the manual review queue. */
async function needsReview(db: Database, actor: Actor, fraudScore: number) {
  if (actor.isStaff) return false;
  if (fraudScore >= 40) return true;
  const [u] = await db.select({ level: s.users.verificationLevel }).from(s.users).where(eq(s.users.id, actor.id));
  if ((u?.level ?? 0) < 2) return true;
  const [{ rejected }] = await db.select({ rejected: sql<number>`count(*)::int` }).from(s.propertyListings).where(and(eq(s.propertyListings.postedById, actor.id), eq(s.propertyListings.status, "rejected")));
  return rejected > 2;
}

export async function createListing(db: Database, actor: Actor | null, raw: unknown, opts: { submit: boolean }) {
  requirePerm(actor, "listing.create");
  const parsed = listingInputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Please fix the highlighted fields", parsed.error.flatten());
  const input = parsed.data;
  if (input.purpose === "rent" && ["residential_plot", "commercial_plot", "plot_file"].includes(input.type)) throw badRequest("Plots can only be listed for sale");
  if (opts.submit) await checkQuota(db, actor);
  const loc = await resolveLocation(db, input);
  const info = propertyTypeInfo(input.type)!;
  const areaSqft = toSqft(input.areaValue, input.areaUnit, (await getSetting<number>(db, "marla_sqft")) ?? 225);
  const agent = await agentContext(db, actor);

  const [property] = await db
    .insert(s.properties)
    .values({
      ownerId: actor.id,
      type: input.type,
      category: info.category,
      cityId: loc.city.id,
      areaId: input.areaId ?? null,
      societyId: input.societyId ?? null,
      blockId: input.blockId ?? null,
      locationId: loc.locationId,
      address: input.address || [loc.blockName, loc.societyName ?? loc.areaName, loc.city.name].filter(Boolean).join(", "),
      lat: input.lat ?? loc.fallbackLat,
      lng: input.lng ?? loc.fallbackLng,
      areaValue: input.areaValue,
      areaUnit: input.areaUnit,
      areaSqft: Math.round(areaSqft * 100) / 100,
      beds: info.hasRooms ? input.beds ?? null : null,
      baths: info.hasRooms ? input.baths ?? null : null,
      parkingSpaces: input.parkingSpaces ?? null,
      floors: input.floors ?? null,
      floorNumber: input.floorNumber ?? null,
      yearBuilt: input.yearBuilt ?? null,
      furnishing: info.hasRooms ? input.furnishing ?? null : null,
      condition: input.condition ?? null,
    })
    .returning();
  await setFeatures(db, property.id, [...input.features, ...(input.installmentAvailable ? ["installments"] : [])]);
  const imageCount = await attachMedia(db, actor, property.id, input.media);
  if (opts.submit && imageCount < 1 && !["agricultural_land"].includes(input.type)) throw badRequest("Add at least one photo before submitting");

  const ref = `PX-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 10)}`;
  const searchText = [input.title, PROPERTY_TYPE_LABELS[input.type], input.purpose === "sale" ? "sale buy" : "rent", loc.blockName, loc.societyName, loc.areaName, loc.city.name, input.highlights.join(" "), input.description.slice(0, 600)].filter(Boolean).join(" ");
  const [listing] = await db
    .insert(s.propertyListings)
    .values({
      propertyId: property.id,
      slug: `${slugify(input.title).slice(0, 70)}-${shortId(5)}`,
      referenceCode: ref,
      purpose: input.purpose,
      status: "draft",
      title: input.title,
      description: input.description,
      highlights: input.highlights,
      price: input.price,
      pricePerSqft: Math.round((input.price / areaSqft) * 100) / 100,
      rentPeriod: input.purpose === "rent" ? input.rentPeriod ?? "monthly" : null,
      installmentAvailable: input.installmentAvailable,
      advanceAmount: input.advanceAmount ?? null,
      monthlyInstallment: input.monthlyInstallment ?? null,
      installmentsRemaining: input.installmentsRemaining ?? null,
      videoUrl: normaliseVideoUrl(input.videoUrl),
      tourUrl: input.tourUrl || null,
      details: input.details ?? {},
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactWhatsapp: input.contactWhatsapp ?? input.contactPhone,
      contactEmail: input.contactEmail || null,
      postedById: actor.id,
      agentId: agent?.id ?? null,
      agencyId: agent?.agencyId ?? null,
      qualityScore: qualityScore(input, imageCount),
      searchText,
    })
    .returning();
  await db.insert(s.propertyPriceHistory).values({ listingId: listing.id, oldPrice: null, newPrice: input.price, changedById: actor.id });
  await audit(db, { actorId: actor.id, action: "listing.create", entityType: "listing", entityId: listing.id });
  if (opts.submit) return submitListing(db, actor, listing.id);
  return listing;
}

export function normaliseVideoUrl(url?: string | null) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  if (/^https:\/\//.test(url)) return url;
  return null;
}

async function loadOwned(db: Database, actor: Actor, listingId: string) {
  const [l] = await db.select().from(s.propertyListings).where(eq(s.propertyListings.id, listingId));
  if (!l) throw notFound("Listing");
  const staff = actor.permissions.includes("listing.update.any");
  if (l.postedById !== actor.id && !staff) throw forbidden();
  return l;
}

/** Moves a draft/rejected/expired listing into review (or straight to active for trusted posters). */
export async function submitListing(db: Database, actor: Actor, listingId: string) {
  const l = await loadOwned(db, actor, listingId);
  if (!["draft", "rejected", "expired", "paused"].includes(l.status)) return l;
  await checkQuota(db, actor, l.id);
  const fraud = await scanListing(db, l.id);
  const review = await needsReview(db, actor, fraud.score);
  const expiryDays = (await getSetting<number>(db, "listing_expiry_days")) ?? 90;
  const [updated] = await db
    .update(s.propertyListings)
    .set(
      review
        ? { status: "pending_review", rejectionReason: null }
        : { status: "active", rejectionReason: null, publishedAt: l.publishedAt ?? new Date(), expiresAt: new Date(Date.now() + expiryDays * 86400_000) },
    )
    .where(eq(s.propertyListings.id, l.id))
    .returning();
  if (!review) await onListingPublished(db, updated.id);
  return updated;
}

export async function updateListing(db: Database, actor: Actor | null, listingId: string, raw: unknown) {
  requireActor(actor);
  const l = await loadOwned(db, actor, listingId);
  const parsed = listingInputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Please fix the highlighted fields", parsed.error.flatten());
  const input = parsed.data;
  const loc = await resolveLocation(db, input);
  const info = propertyTypeInfo(input.type)!;
  const areaSqft = toSqft(input.areaValue, input.areaUnit, (await getSetting<number>(db, "marla_sqft")) ?? 225);
  await db
    .update(s.properties)
    .set({
      type: input.type,
      category: info.category,
      cityId: loc.city.id,
      areaId: input.areaId ?? null,
      societyId: input.societyId ?? null,
      blockId: input.blockId ?? null,
      locationId: loc.locationId,
      address: input.address || undefined,
      lat: input.lat ?? loc.fallbackLat,
      lng: input.lng ?? loc.fallbackLng,
      areaValue: input.areaValue,
      areaUnit: input.areaUnit,
      areaSqft: Math.round(areaSqft * 100) / 100,
      beds: info.hasRooms ? input.beds ?? null : null,
      baths: info.hasRooms ? input.baths ?? null : null,
      parkingSpaces: input.parkingSpaces ?? null,
      floors: input.floors ?? null,
      floorNumber: input.floorNumber ?? null,
      yearBuilt: input.yearBuilt ?? null,
      furnishing: info.hasRooms ? input.furnishing ?? null : null,
      condition: input.condition ?? null,
    })
    .where(eq(s.properties.id, l.propertyId));
  await setFeatures(db, l.propertyId, [...input.features, ...(input.installmentAvailable ? ["installments"] : [])]);
  const imageCount = await attachMedia(db, actor, l.propertyId, input.media);
  const searchText = [input.title, PROPERTY_TYPE_LABELS[input.type], input.purpose === "sale" ? "sale buy" : "rent", loc.blockName, loc.societyName, loc.areaName, loc.city.name, input.highlights.join(" "), input.description.slice(0, 600)].filter(Boolean).join(" ");
  await db
    .update(s.propertyListings)
    .set({
      purpose: input.purpose,
      title: input.title,
      description: input.description,
      highlights: input.highlights,
      pricePerSqft: Math.round((input.price / areaSqft) * 100) / 100,
      rentPeriod: input.purpose === "rent" ? input.rentPeriod ?? "monthly" : null,
      installmentAvailable: input.installmentAvailable,
      advanceAmount: input.advanceAmount ?? null,
      monthlyInstallment: input.monthlyInstallment ?? null,
      installmentsRemaining: input.installmentsRemaining ?? null,
      videoUrl: normaliseVideoUrl(input.videoUrl),
      tourUrl: input.tourUrl || null,
      details: input.details ?? {},
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactWhatsapp: input.contactWhatsapp ?? input.contactPhone,
      contactEmail: input.contactEmail || null,
      qualityScore: qualityScore(input, imageCount),
      searchText,
    })
    .where(eq(s.propertyListings.id, l.id));
  if (input.price !== l.price) await changePrice(db, actor, l.id, input.price);
  if (l.status === "active") {
    const fraud = await scanListing(db, l.id);
    if (fraud.score >= 60 && !actor.isStaff) await db.update(s.propertyListings).set({ status: "pending_review" }).where(eq(s.propertyListings.id, l.id));
  }
  await audit(db, { actorId: actor.id, action: "listing.update", entityType: "listing", entityId: l.id });
  const [fresh] = await db.select().from(s.propertyListings).where(eq(s.propertyListings.id, l.id));
  return fresh;
}

/** Records price history and alerts everyone who saved the listing when the price drops. */
export async function changePrice(db: Database, actor: Actor, listingId: string, newPrice: number) {
  const [l] = await db.select().from(s.propertyListings).where(eq(s.propertyListings.id, listingId));
  if (!l || l.price === newPrice) return;
  const [p] = await db.select({ areaSqft: s.properties.areaSqft }).from(s.properties).where(eq(s.properties.id, l.propertyId));
  const reduced = newPrice < l.price;
  await db
    .update(s.propertyListings)
    .set({
      price: newPrice,
      pricePerSqft: p ? Math.round((newPrice / p.areaSqft) * 100) / 100 : null,
      previousPrice: reduced ? l.price : null,
      priceReducedAt: reduced ? new Date() : null,
    })
    .where(eq(s.propertyListings.id, listingId));
  await db.insert(s.propertyPriceHistory).values({ listingId, oldPrice: l.price, newPrice, changedById: actor.id });
  if (reduced && l.status === "active") {
    const savers = await db.select({ userId: s.savedProperties.userId }).from(s.savedProperties).where(eq(s.savedProperties.listingId, listingId));
    for (const sv of savers) {
      if (sv.userId === l.postedById) continue;
      await notify(db, {
        userId: sv.userId,
        type: "price_reduced",
        title: `Price reduced by PKR ${formatPriceWords(l.price - newPrice)}`,
        body: `“${l.title}” is now PKR ${formatPriceWords(newPrice)}.`,
        link: `/property/${l.slug}`,
        data: { listingId, oldPrice: l.price, newPrice },
      });
    }
  }
}

const OWNER_TRANSITIONS: Record<string, ListingStatus[]> = {
  active: ["paused", "sold", "rented"],
  paused: ["active", "sold", "rented"],
  expired: ["active"],
  draft: ["pending_review"],
  rejected: ["pending_review"],
  pending_review: ["draft"],
  sold: [],
  rented: ["active"],
};

export async function setListingStatus(db: Database, actor: Actor | null, listingId: string, status: ListingStatus) {
  requireActor(actor);
  const l = await loadOwned(db, actor, listingId);
  if (status === "active" && ["paused", "expired", "rented"].includes(l.status)) {
    if (l.status === "paused" && l.publishedAt) {
      await checkQuota(db, actor, l.id);
      await db.update(s.propertyListings).set({ status: "active" }).where(eq(s.propertyListings.id, l.id));
      return { ...l, status: "active" as const };
    }
    return submitListing(db, actor, l.id);
  }
  if (status === "pending_review") return submitListing(db, actor, l.id);
  if (!OWNER_TRANSITIONS[l.status]?.includes(status)) throw badRequest(`A ${l.status.replace("_", " ")} listing can't be changed to ${status.replace("_", " ")}`);
  if ((status === "sold" && l.purpose !== "sale") || (status === "rented" && l.purpose !== "rent")) throw badRequest("Status doesn't match the listing purpose");
  const [u] = await db
    .update(s.propertyListings)
    .set({ status, closedAt: ["sold", "rented"].includes(status) ? new Date() : null })
    .where(eq(s.propertyListings.id, l.id))
    .returning();
  await audit(db, { actorId: actor.id, action: `listing.status.${status}`, entityType: "listing", entityId: l.id });
  return u;
}

export async function deleteListing(db: Database, actor: Actor | null, listingId: string) {
  requireActor(actor);
  const l = await loadOwned(db, actor, listingId);
  if (!["draft", "rejected", "expired"].includes(l.status) && !actor.isStaff) throw badRequest("Only draft, rejected or expired listings can be deleted. Mark it sold or pause it instead.");
  await db.delete(s.properties).where(eq(s.properties.id, l.propertyId));
  await audit(db, { actorId: actor.id, action: "listing.delete", entityType: "listing", entityId: l.id });
}

export async function moderateListing(db: Database, actor: Actor | null, listingId: string, decision: "approve" | "reject", reason?: string) {
  requirePerm(actor, "listing.moderate");
  const [l] = await db.select().from(s.propertyListings).where(eq(s.propertyListings.id, listingId));
  if (!l) throw notFound("Listing");
  if (decision === "reject" && !reason?.trim()) throw badRequest("A rejection reason is required so the poster can fix the listing");
  const expiryDays = (await getSetting<number>(db, "listing_expiry_days")) ?? 90;
  await db
    .update(s.propertyListings)
    .set(
      decision === "approve"
        ? { status: "active", rejectionReason: null, publishedAt: l.publishedAt ?? new Date(), expiresAt: new Date(Date.now() + expiryDays * 86400_000) }
        : { status: "rejected", rejectionReason: reason!.trim() },
    )
    .where(eq(s.propertyListings.id, listingId));
  await audit(db, { actorId: actor.id, action: `listing.${decision}`, entityType: "listing", entityId: listingId, metadata: { reason } });
  if (l.postedById)
    await notify(db, {
      userId: l.postedById,
      type: "listing_status",
      title: decision === "approve" ? "Your listing is live" : "Your listing needs changes",
      body: decision === "approve" ? `“${l.title}” was approved and is now visible to buyers.` : `“${l.title}” was not approved: ${reason}`,
      link: decision === "approve" ? `/property/${l.slug}` : `/dashboard/listings/${l.id}/edit`,
    });
  if (decision === "approve") await onListingPublished(db, listingId);
}

/** Fan-out when a listing becomes visible: saved-search alerts. */
export async function onListingPublished(db: Database, listingId: string) {
  const searches = await db.select().from(s.savedSearches).where(and(eq(s.savedSearches.isActive, true), eq(s.savedSearches.frequency, "instant")));
  const e = engine(db);
  const [l] = await db.select({ title: s.propertyListings.title, slug: s.propertyListings.slug, postedById: s.propertyListings.postedById, price: s.propertyListings.price }).from(s.propertyListings).where(eq(s.propertyListings.id, listingId));
  for (const ss of searches) {
    if (ss.userId === l.postedById) continue;
    try {
      if (await e.matchesListing(ss.query as SearchQuery, listingId)) {
        await db.update(s.savedSearches).set({ lastNotifiedAt: new Date(), matchCount: sql`${s.savedSearches.matchCount} + 1` }).where(eq(s.savedSearches.id, ss.id));
        await notify(db, { userId: ss.userId, type: "new_match", title: `New match: ${ss.name}`, body: `${l.title} — PKR ${formatPriceWords(l.price)}`, link: `/property/${l.slug}`, data: { savedSearchId: ss.id, listingId } });
      }
    } catch (err) {
      console.warn("[saved-search] failed to evaluate", ss.id, (err as Error).message);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Dashboard lists                                                      */
/* ------------------------------------------------------------------ */

export async function listMyListings(db: Database, actor: Actor, opts: { status?: string; agencyId?: string; agentUserIds?: string[]; page?: number } = {}) {
  const page = opts.page ?? 1;
  const owner = opts.agentUserIds?.length ? sql`l.posted_by_id in (${sql.join(opts.agentUserIds.map((x) => sql`${x}`), sql`, `)})` : sql`l.posted_by_id = ${actor.id}`;
  const status = opts.status && opts.status !== "all" ? sql`and l.status = ${opts.status}` : sql``;
  const { CARD_COLUMNS, CARD_FROM, mapCard } = await import("@propertyx/search");
  const rows = await db.execute<Record<string, unknown>>(sql`
    select ${CARD_COLUMNS}, l.leads_count, l.rejection_reason, l.expires_at, l.quality_score, l.posted_by_id,
      (select count(*)::int from leads ld where ld.listing_id = l.id and ld.status = 'new') as new_leads
    ${CARD_FROM} where ${owner} ${status} order by l.updated_at desc limit 50 offset ${(page - 1) * 50}`);
  const counts = await db.execute<{ status: string; n: number }>(sql`select l.status, count(*)::int as n from property_listings l where ${owner} group by l.status`);
  return {
    items: rows.map((r) => ({ ...mapCard(r), leadsCount: Number(r.leads_count), newLeads: Number(r.new_leads), rejectionReason: (r.rejection_reason as string) ?? null, expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null, qualityScore: Number(r.quality_score), postedById: r.posted_by_id as string })),
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Record<string, number>,
  };
}

/** Load a listing in the shape expected by the editor (ListingInput + media). */
export async function getListingForEdit(db: Database, actor: Actor, listingId: string) {
  const l = await loadOwned(db, actor, listingId);
  const [p] = await db.select().from(s.properties).where(eq(s.properties.id, l.propertyId));
  const feats = await db.select({ key: s.features.key }).from(s.propertyFeatures).innerJoin(s.features, eq(s.features.id, s.propertyFeatures.featureId)).where(eq(s.propertyFeatures.propertyId, p.id));
  const media = await db.select().from(s.propertyMedia).where(eq(s.propertyMedia.propertyId, p.id)).orderBy(s.propertyMedia.sortOrder);
  return {
    id: l.id,
    status: l.status,
    slug: l.slug,
    rejectionReason: l.rejectionReason,
    input: {
      purpose: l.purpose,
      type: p.type,
      cityId: p.cityId,
      areaId: p.areaId,
      societyId: p.societyId,
      blockId: p.blockId,
      address: p.address ?? "",
      lat: p.lat,
      lng: p.lng,
      price: l.price,
      rentPeriod: l.rentPeriod as "monthly" | null,
      installmentAvailable: l.installmentAvailable,
      advanceAmount: l.advanceAmount,
      monthlyInstallment: l.monthlyInstallment,
      installmentsRemaining: l.installmentsRemaining,
      areaValue: p.areaValue,
      areaUnit: p.areaUnit,
      beds: p.beds,
      baths: p.baths,
      parkingSpaces: p.parkingSpaces,
      floors: p.floors,
      floorNumber: p.floorNumber,
      yearBuilt: p.yearBuilt,
      furnishing: p.furnishing,
      condition: p.condition,
      features: feats.map((f) => f.key).filter((k) => k !== "installments"),
      title: l.title,
      description: l.description,
      highlights: l.highlights ?? [],
      videoUrl: l.videoUrl ?? "",
      tourUrl: l.tourUrl ?? "",
      details: l.details ?? {},
      contactName: l.contactName,
      contactPhone: l.contactPhone,
      contactWhatsapp: l.contactWhatsapp ?? "",
      contactEmail: l.contactEmail ?? "",
      media: media.filter((m) => m.kind !== "video").map((m) => ({ id: m.id, kind: m.kind as "image" | "floor_plan", caption: m.caption ?? undefined, url: m.url })),
    },
  };
}

export async function moderationQueue(db: Database, actor: Actor | null) {
  requirePerm(actor, "listing.moderate");
  const { CARD_COLUMNS, CARD_FROM, mapCard } = await import("@propertyx/search");
  const rows = await db.execute<Record<string, unknown>>(sql`
    select ${CARD_COLUMNS}, l.fraud_score, l.description, u.name as poster_name, u.verification_level as poster_level,
      (select count(*)::int from fraud_flags f where f.target_type = 'listing' and f.target_id = l.id and f.status = 'open') as open_flags
    ${CARD_FROM} left join users u on u.id = l.posted_by_id
    where l.status = 'pending_review' order by l.fraud_score desc, l.created_at asc limit 100`);
  return rows.map((r) => ({ ...mapCard(r), fraudScore: Number(r.fraud_score), description: r.description as string, posterName: r.poster_name as string, posterLevel: Number(r.poster_level), openFlags: Number(r.open_flags) }));
}

