import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, boolean, timestamp, index, uniqueIndex, doublePrecision, bigint, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt, isSeed, tsvector, numericNumber } from "./_helpers";
import { users } from "./identity";
import type { ListingDetails } from "@propertyx/shared";
import { cities, areas, societies, blocks, locations } from "./locations";
import { purposeEnum, propertyTypeEnum, propertyCategoryEnum, listingStatusEnum, furnishingEnum, conditionEnum, areaUnitEnum, mediaKindEnum } from "./enums";

/** The physical asset. A property can have several listings over time (sale, then rent). */
export const properties = pgTable(
  "properties",
  {
    id: id(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    type: propertyTypeEnum("type").notNull(),
    category: propertyCategoryEnum("category").notNull(),
    cityId: uuid("city_id").notNull().references(() => cities.id),
    areaId: uuid("area_id").references(() => areas.id),
    societyId: uuid("society_id").references(() => societies.id),
    blockId: uuid("block_id").references(() => blocks.id),
    locationId: uuid("location_id").references(() => locations.id),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    areaValue: numericNumber("area_value", { precision: 12, scale: 2 }).notNull(),
    areaUnit: areaUnitEnum("area_unit").notNull(),
    areaSqft: numericNumber("area_sqft", { precision: 14, scale: 2 }).notNull(),
    beds: integer("beds"),
    baths: integer("baths"),
    parkingSpaces: integer("parking_spaces"),
    floors: integer("floors"),
    floorNumber: integer("floor_number"),
    yearBuilt: integer("year_built"),
    furnishing: furnishingEnum("furnishing"),
    condition: conditionEnum("condition"),
    plotNumber: text("plot_number"),
    streetNumber: text("street_number"),
    blockName: text("block_name"),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("properties_city_type_idx").on(t.cityId, t.type),
    index("properties_location_idx").on(t.locationId),
    index("properties_society_idx").on(t.societyId),
    index("properties_area_idx").on(t.areaId),
    index("properties_beds_idx").on(t.beds),
    index("properties_sqft_idx").on(t.areaSqft),
    index("properties_geo_idx").on(t.lat, t.lng),
    index("properties_owner_idx").on(t.ownerId),
    index("properties_plot_cadastral_idx").on(t.societyId, t.blockName, t.plotNumber),
  ],
);

export const features = pgTable("features", {
  id: id(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  group: text("group").notNull(),
  isFilter: boolean("is_filter").notNull().default(false),
});

export const propertyFeatures = pgTable(
  "property_features",
  {
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    featureId: uuid("feature_id").notNull().references(() => features.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.featureId] }), index("property_features_feature_idx").on(t.featureId)],
);

export const propertyListings = pgTable(
  "property_listings",
  {
    id: id(),
    propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    referenceCode: text("reference_code").notNull(),
    purpose: purposeEnum("purpose").notNull(),
    status: listingStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    highlights: jsonb("highlights").$type<string[]>().default([]),
    /** market-specific extras (UAE: permit/BRN/ORN, off-plan, handover, service charge, cheques) */
    details: jsonb("details").$type<ListingDetails>().notNull().default({}),
    price: bigint("price", { mode: "number" }).notNull(),
    previousPrice: bigint("previous_price", { mode: "number" }),
    priceReducedAt: timestamp("price_reduced_at", { withTimezone: true }),
    pricePerSqft: numericNumber("price_per_sqft", { precision: 14, scale: 2 }),
    rentPeriod: text("rent_period"),
    installmentAvailable: boolean("installment_available").notNull().default(false),
    advanceAmount: bigint("advance_amount", { mode: "number" }),
    monthlyInstallment: bigint("monthly_installment", { mode: "number" }),
    installmentsRemaining: integer("installments_remaining"),
    videoUrl: text("video_url"),
    tourUrl: text("tour_url"),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactWhatsapp: text("contact_whatsapp"),
    contactEmail: text("contact_email"),
    postedById: uuid("posted_by_id").references(() => users.id, { onDelete: "set null" }),
    agentId: uuid("agent_id"),
    agencyId: uuid("agency_id"),
    projectId: uuid("project_id"),
    isPremium: boolean("is_premium").notNull().default(false),
    featuredUntil: timestamp("featured_until", { withTimezone: true }),
    verificationLevel: integer("verification_level").notNull().default(0),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    qualityScore: integer("quality_score").notNull().default(0),
    fraudScore: integer("fraud_score").notNull().default(0),
    rejectionReason: text("rejection_reason"),
    viewsCount: integer("views_count").notNull().default(0),
    savesCount: integer("saves_count").notNull().default(0),
    leadsCount: integer("leads_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** denormalised text (title + description + location names + type) for full-text search */
    searchText: text("search_text").notNull().default(""),
    searchVector: tsvector("search_vector").generatedAlwaysAs(sql`to_tsvector('simple', coalesce(search_text, ''))`),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("listings_slug_uq").on(t.slug),
    uniqueIndex("listings_ref_uq").on(t.referenceCode),
    index("listings_status_purpose_price_idx").on(t.status, t.purpose, t.price),
    index("listings_property_idx").on(t.propertyId),
    index("listings_published_idx").on(t.publishedAt),
    index("listings_agent_idx").on(t.agentId),
    index("listings_agency_idx").on(t.agencyId),
    index("listings_poster_idx").on(t.postedById),
    index("listings_project_idx").on(t.projectId),
    index("listings_featured_idx").on(t.featuredUntil),
    index("listings_search_idx").using("gin", t.searchVector),
    index("listings_contact_phone_idx").on(t.contactPhone),
    index("listings_description_trgm").using("gin", t.description.op("gin_trgm_ops")),
  ],
);

export const propertyMedia = pgTable(
  "property_media",
  {
    id: id(),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    kind: mediaKindEnum("kind").notNull().default("image"),
    url: text("url").notNull(),
    storageKey: text("storage_key"),
    caption: text("caption"),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    /** SHA-256 of file bytes - exact duplicate detection across listings */
    sha256: text("sha256"),
    /** 64-bit average hash (hex) - near-duplicate image detection */
    perceptualHash: text("perceptual_hash"),
    sortOrder: integer("sort_order").notNull().default(0),
    isSeed: isSeed(),
    createdAt: createdAt(),
  },
  (t) => [index("media_property_idx").on(t.propertyId, t.sortOrder), index("media_sha_idx").on(t.sha256), index("media_phash_idx").on(t.perceptualHash)],
);

export const propertyPriceHistory = pgTable(
  "property_price_history",
  {
    id: id(),
    listingId: uuid("listing_id").notNull().references(() => propertyListings.id, { onDelete: "cascade" }),
    oldPrice: bigint("old_price", { mode: "number" }),
    newPrice: bigint("new_price", { mode: "number" }).notNull(),
    changedById: uuid("changed_by_id").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_history_listing_idx").on(t.listingId, t.changedAt)],
);

/** Funnel / engagement events for analytics. */
export const listingEvents = pgTable(
  "listing_events",
  {
    id: id(),
    listingId: uuid("listing_id").references(() => propertyListings.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    anonId: text("anon_id"),
    type: text("type").notNull(), // view | save | call_click | whatsapp_click | message | lead | visit_request | share | brochure
    createdAt: createdAt(),
  },
  (t) => [index("listing_events_listing_idx").on(t.listingId, t.type, t.createdAt), index("listing_events_project_idx").on(t.projectId, t.type)],
);

export const savedProperties = pgTable(
  "saved_properties",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").notNull().references(() => propertyListings.id, { onDelete: "cascade" }),
    priceAtSave: bigint("price_at_save", { mode: "number" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] }), index("saved_listing_idx").on(t.listingId)],
);

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: jsonb("query").$type<Record<string, unknown>>().notNull(),
    frequency: text("frequency").notNull().default("instant"),
    isActive: boolean("is_active").notNull().default(true),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).defaultNow(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    matchCount: integer("match_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("saved_searches_user_idx").on(t.userId)],
);
