import { pgTable, text, uuid, integer, boolean, timestamp, index, bigint, jsonb, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt, isSeed, numericNumber } from "./_helpers";
import { users } from "./identity";
import { cities } from "./locations";
import { propertyListings } from "./properties";
import { projects, agents, agencies, developers } from "./organizations";
import { leadStatusEnum, leadSourceEnum, appointmentStatusEnum, messageKindEnum, reviewStatusEnum, purposeEnum, propertyTypeEnum, areaUnitEnum } from "./enums";

export const leads = pgTable(
  "leads",
  {
    id: id(),
    listingId: uuid("listing_id").references(() => propertyListings.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "set null" }),
    developerId: uuid("developer_id").references(() => developers.id, { onDelete: "set null" }),
    /** user who receives / owns the lead (lister, agent or developer owner) */
    recipientId: uuid("recipient_id").references(() => users.id, { onDelete: "set null" }),
    /** buyer / enquirer (null for guests) */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    message: text("message"),
    source: leadSourceEnum("source").notNull().default("form"),
    status: leadStatusEnum("status").notNull().default("new"),
    offerAmount: bigint("offer_amount", { mode: "number" }),
    aiScore: integer("ai_score"),
    aiSummary: text("ai_summary"),
    notes: text("notes"),
    dealValue: bigint("deal_value", { mode: "number" }),
    isSaved: boolean("is_saved").notNull().default(false),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leads_recipient_idx").on(t.recipientId, t.createdAt),
    index("leads_listing_idx").on(t.listingId),
    index("leads_agency_idx").on(t.agencyId),
    index("leads_project_idx").on(t.projectId),
    index("leads_status_idx").on(t.status),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    listingId: uuid("listing_id").references(() => propertyListings.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** buyer_agent | buyer_seller | tenant_landlord | developer_buyer | support */
    kind: text("kind").notNull().default("buyer_seller"),
    /** sorted participant ids joined with ":" — keeps 1:1 threads per listing unique */
    participantKey: text("participant_key").notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessagePreview: text("last_message_preview"),
    isSeed: isSeed(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("conversations_participants_uq").on(t.participantKey), index("conversations_last_idx").on(t.lastMessageAt)],
);

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    isBlocked: boolean("is_blocked").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("participants_user_idx").on(t.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    kind: messageKindEnum("kind").notNull().default("text"),
    body: text("body").notNull().default(""),
    attachmentUrl: text("attachment_url"),
    attachmentName: text("attachment_name"),
    attachmentMime: text("attachment_mime"),
    attachmentSize: integer("attachment_size"),
    listingId: uuid("listing_id").references(() => propertyListings.id, { onDelete: "set null" }),
    spamScore: integer("spam_score").notNull().default(0),
    isHidden: boolean("is_hidden").notNull().default(false),
    isSeed: isSeed(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt), index("messages_sender_idx").on(t.senderId, t.createdAt)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    listingId: uuid("listing_id").references(() => propertyListings.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    hostId: uuid("host_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMins: integer("duration_mins").notNull().default(45),
    visitors: integer("visitors").notNull().default(1),
    phone: text("phone"),
    message: text("message"),
    status: appointmentStatusEnum("status").notNull().default("requested"),
    responseNote: text("response_note"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("appointments_host_idx").on(t.hostId, t.scheduledAt), index("appointments_requester_idx").on(t.requesterId, t.scheduledAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    data: jsonb("data").$type<Record<string, unknown>>().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    isSeed: isSeed(),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(true),
    sms: boolean("sms").notNull().default(false),
    whatsapp: boolean("whatsapp").notNull().default(false),
    push: boolean("push").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

/** Outbox for external channel deliveries (email/sms/whatsapp/push) processed by the worker. */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: id(),
    notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    to: text("to").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    provider: text("provider"),
    status: text("status").notNull().default("queued"), // queued | sent | failed | skipped
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("deliveries_status_idx").on(t.status, t.createdAt)],
);

export const pushTokens = pgTable("push_tokens", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // ios | android | web
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
});

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(), // agent | agency | developer | project
    targetId: uuid("target_id").notNull(),
    rating: integer("rating").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: reviewStatusEnum("status").notNull().default("pending"),
    /** reviewer had a verified interaction (lead / visit / deal) with the target */
    isVerifiedInteraction: boolean("is_verified_interaction").notNull().default(false),
    responseBody: text("response_body"),
    responseAt: timestamp("response_at", { withTimezone: true }),
    responderId: uuid("responder_id").references(() => users.id, { onDelete: "set null" }),
    moderatedById: uuid("moderated_by_id"),
    moderationNote: text("moderation_note"),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("reviews_target_idx").on(t.targetType, t.targetId, t.status), uniqueIndex("reviews_author_target_uq").on(t.authorId, t.targetType, t.targetId)],
);

export const propertyRequirements = pgTable(
  "property_requirements",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    cityId: uuid("city_id").references(() => cities.id),
    cityName: text("city_name").notNull(),
    locationName: text("location_name").notNull(),
    propertyType: propertyTypeEnum("property_type").notNull(),
    purpose: purposeEnum("purpose").notNull().default("sale"),
    minBudget: bigint("min_budget", { mode: "number" }),
    maxBudget: bigint("max_budget", { mode: "number" }).notNull(),
    areaValue: numericNumber("area_value", { precision: 12, scale: 2 }),
    areaUnit: areaUnitEnum("area_unit"),
    description: text("description").notNull(),
    status: text("status").notNull().default("active"),
    isDirectBuyer: boolean("is_direct_buyer").notNull().default(true),
    pitchesCount: integer("pitches_count").notNull().default(0),
    isSeed: isSeed(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("req_city_idx").on(t.cityName),
    index("req_type_idx").on(t.propertyType),
    index("req_status_idx").on(t.status),
    index("req_created_idx").on(t.createdAt),
  ],
);

export const requirementPitches = pgTable(
  "requirement_pitches",
  {
    id: id(),
    requirementId: uuid("requirement_id").notNull().references(() => propertyRequirements.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").references(() => propertyListings.id, { onDelete: "set null" }),
    pitchText: text("pitch_text").notNull(),
    offeredPrice: bigint("offered_price", { mode: "number" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("pitch_req_idx").on(t.requirementId),
    index("pitch_agent_idx").on(t.agentId),
  ],
);
