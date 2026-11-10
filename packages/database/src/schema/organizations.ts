import { pgTable, text, uuid, integer, boolean, index, uniqueIndex, doublePrecision, bigint, jsonb, primaryKey, date } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt, isSeed, numericNumber } from "./_helpers";
import { users } from "./identity";
import { cities, locations } from "./locations";
import { projectStatusEnum, unitTypeEnum, mediaKindEnum } from "./enums";

export const agencies = pgTable(
  "agencies",
  {
    id: id(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoUrl: text("logo_url"),
    description: text("description"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    website: text("website"),
    address: text("address"),
    cityId: uuid("city_id").references(() => cities.id),
    establishedYear: integer("established_year"),
    reraNumber: text("registration_number"),
    verificationLevel: integer("verification_level").notNull().default(0),
    status: text("status").notNull().default("active"),
    ratingAvg: numericNumber("rating_avg", { precision: 3, scale: 2 }).notNull().default(0),
    reviewsCount: integer("reviews_count").notNull().default(0),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("agencies_slug_uq").on(t.slug), index("agencies_city_idx").on(t.cityId)],
);

export const agencyMembers = pgTable(
  "agency_members",
  {
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("agent"), // admin | manager | agent | marketing
    status: text("status").notNull().default("active"),
    invitedById: uuid("invited_by_id"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.agencyId, t.userId] }), index("agency_members_user_idx").on(t.userId)],
);

export const agents = pgTable(
  "agents",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    photoUrl: text("photo_url"),
    bio: text("bio"),
    experienceYears: integer("experience_years"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    specializations: jsonb("specializations").$type<string[]>().default([]),
    languages: jsonb("languages").$type<string[]>().default([]),
    verificationLevel: integer("verification_level").notNull().default(0),
    ratingAvg: numericNumber("rating_avg", { precision: 3, scale: 2 }).notNull().default(0),
    reviewsCount: integer("reviews_count").notNull().default(0),
    responseTimeMins: integer("response_time_mins"),
    isFeatured: boolean("is_featured").notNull().default(false),
    associationName: text("association_name"),
    associationNumber: text("association_number"),
    fbrNtn: text("fbr_ntn"),
    officeAddress: text("office_address"),
    officePhone: text("office_phone"),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("agents_slug_uq").on(t.slug), uniqueIndex("agents_user_uq").on(t.userId), index("agents_agency_idx").on(t.agencyId)],
);

export const agentAreas = pgTable(
  "agent_areas",
  {
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.locationId] }), index("agent_areas_location_idx").on(t.locationId)],
);

export const developers = pgTable(
  "developers",
  {
    id: id(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoUrl: text("logo_url"),
    description: text("description"),
    website: text("website"),
    phone: text("phone"),
    email: text("email"),
    cityId: uuid("city_id").references(() => cities.id),
    establishedYear: integer("established_year"),
    verificationLevel: integer("verification_level").notNull().default(0),
    ratingAvg: numericNumber("rating_avg", { precision: 3, scale: 2 }).notNull().default(0),
    reviewsCount: integer("reviews_count").notNull().default(0),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("developers_slug_uq").on(t.slug)],
);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    developerId: uuid("developer_id").notNull().references(() => developers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    tagline: text("tagline"),
    description: text("description").notNull(),
    cityId: uuid("city_id").notNull().references(() => cities.id),
    locationId: uuid("location_id").references(() => locations.id),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    status: projectStatusEnum("status").notNull().default("under_construction"),
    constructionProgress: integer("construction_progress").notNull().default(0),
    launchDate: date("launch_date"),
    expectedCompletion: date("expected_completion"),
    minPrice: bigint("min_price", { mode: "number" }),
    maxPrice: bigint("max_price", { mode: "number" }),
    totalUnits: integer("total_units"),
    availableUnits: integer("available_units"),
    amenities: jsonb("amenities").$type<string[]>().default([]),
    coverImage: text("cover_image"),
    masterPlanUrl: text("master_plan_url"),
    brochureUrl: text("brochure_url"),
    videoUrl: text("video_url"),
    approvalStatus: text("approval_status"),
    isFeatured: boolean("is_featured").notNull().default(false),
    publishStatus: text("publish_status").notNull().default("published"), // draft | pending | published | rejected
    viewsCount: integer("views_count").notNull().default(0),
    ratingAvg: numericNumber("rating_avg", { precision: 3, scale: 2 }).notNull().default(0),
    reviewsCount: integer("reviews_count").notNull().default(0),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("projects_slug_uq").on(t.slug), index("projects_city_idx").on(t.cityId, t.status), index("projects_developer_idx").on(t.developerId)],
);

export const projectMedia = pgTable(
  "project_media",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    kind: mediaKindEnum("kind").notNull().default("image"),
    url: text("url").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    isSeed: isSeed(),
  },
  (t) => [index("project_media_idx").on(t.projectId, t.sortOrder)],
);

export const projectUnits = pgTable(
  "project_units",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    type: unitTypeEnum("type").notNull(),
    name: text("name").notNull(),
    areaSqft: numericNumber("area_sqft", { precision: 12, scale: 2 }).notNull(),
    beds: integer("beds"),
    baths: integer("baths"),
    priceFrom: bigint("price_from", { mode: "number" }).notNull(),
    priceTo: bigint("price_to", { mode: "number" }),
    totalUnits: integer("total_units").notNull().default(0),
    availableUnits: integer("available_units").notNull().default(0),
    floorPlanUrl: text("floor_plan_url"),
    isSeed: isSeed(),
  },
  (t) => [index("project_units_project_idx").on(t.projectId)],
);

export const projectPaymentPlans = pgTable(
  "project_payment_plans",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => projectUnits.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    downPaymentPct: numericNumber("down_payment_pct", { precision: 5, scale: 2 }).notNull(),
    durationMonths: integer("duration_months").notNull(),
    frequency: text("frequency").notNull().default("monthly"), // monthly | quarterly
    possessionPct: numericNumber("possession_pct", { precision: 5, scale: 2 }).notNull().default(0),
    balloonPct: numericNumber("balloon_pct", { precision: 5, scale: 2 }).notNull().default(0),
    notes: text("notes"),
    isSeed: isSeed(),
  },
  (t) => [index("payment_plans_project_idx").on(t.projectId)],
);

export const constructionRates = pgTable("construction_rates", {
  id: id(),
  cityId: uuid("city_id").references(() => cities.id, { onDelete: "cascade" }),
  /** full ConstructionRates JSON (see @propertyx/shared) */
  rates: jsonb("rates").notNull(),
  updatedById: uuid("updated_by_id"),
  updatedAt: updatedAt(),
});

export const constructionCompanies = pgTable("construction_companies", {
  id: id(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  cityId: uuid("city_id").references(() => cities.id),
  phone: text("phone"),
  services: jsonb("services").$type<string[]>().default([]),
  verificationLevel: integer("verification_level").notNull().default(0),
  isSeed: isSeed(),
  createdAt: createdAt(),
});

