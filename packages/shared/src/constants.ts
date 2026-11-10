/** Core domain constants shared by the database, API and UI layers. */
import { isUAE } from "./country";

export const PURPOSES = ["sale", "rent"] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PURPOSE_LABELS: Record<Purpose, string> = { sale: "For Sale", rent: "For Rent" };

export const PROPERTY_CATEGORIES = ["residential", "plot", "commercial", "agricultural"] as const;
export type PropertyCategory = (typeof PROPERTY_CATEGORIES)[number];

export const PROPERTY_TYPES = [
  { key: "house", label: "House", category: "residential", hasRooms: true },
  { key: "flat", label: "Flat", category: "residential", hasRooms: true },
  { key: "apartment", label: "Apartment", category: "residential", hasRooms: true },
  { key: "upper_portion", label: "Upper Portion", category: "residential", hasRooms: true },
  { key: "lower_portion", label: "Lower Portion", category: "residential", hasRooms: true },
  { key: "room", label: "Room", category: "residential", hasRooms: true },
  { key: "farmhouse", label: "Farmhouse", category: "residential", hasRooms: true },
  { key: "villa", label: "Villa", category: "residential", hasRooms: true },
  { key: "penthouse", label: "Penthouse", category: "residential", hasRooms: true },
  { key: "townhouse", label: "Townhouse", category: "residential", hasRooms: true },
  { key: "hotel_apartment", label: "Hotel Apartment", category: "residential", hasRooms: true },
  { key: "residential_plot", label: "Residential Plot", category: "plot", hasRooms: false },
  { key: "commercial_plot", label: "Commercial Plot", category: "plot", hasRooms: false },
  { key: "plot_file", label: "Plot File", category: "plot", hasRooms: false },
  { key: "agricultural_land", label: "Agricultural Land", category: "agricultural", hasRooms: false },
  { key: "office", label: "Office", category: "commercial", hasRooms: false },
  { key: "shop", label: "Shop", category: "commercial", hasRooms: false },
  { key: "warehouse", label: "Warehouse", category: "commercial", hasRooms: false },
  { key: "factory", label: "Factory", category: "commercial", hasRooms: false },
  { key: "building", label: "Building", category: "commercial", hasRooms: false },
  { key: "other", label: "Other", category: "commercial", hasRooms: false },
] as const satisfies readonly { key: string; label: string; category: PropertyCategory; hasRooms: boolean }[];

export type PropertyType = (typeof PROPERTY_TYPES)[number]["key"];
export const PROPERTY_TYPE_KEYS = PROPERTY_TYPES.map((t) => t.key) as unknown as readonly [PropertyType, ...PropertyType[]];
export const PROPERTY_TYPE_LABELS = Object.fromEntries(PROPERTY_TYPES.map((t) => [t.key, t.label])) as Record<PropertyType, string>;
/** types that only make sense in one market (all stay valid in the database) */
const UAE_ONLY_TYPES: PropertyType[] = ["townhouse", "hotel_apartment"];
const PK_ONLY_TYPES: PropertyType[] = ["flat", "upper_portion", "lower_portion", "plot_file", "farmhouse", "agricultural_land", "factory"];
/** property types offered in forms and filters on this deployment */
export const LISTABLE_TYPES = PROPERTY_TYPES.filter((t) => !(isUAE ? PK_ONLY_TYPES : UAE_ONLY_TYPES).includes(t.key));
export function propertyTypeInfo(key: string) {
  return PROPERTY_TYPES.find((t) => t.key === key);
}
/** Grouped type filters used by "Plot" / "Commercial" / "Home" shortcuts. */
export const TYPE_GROUPS: Record<string, PropertyType[]> = {
  homes: ["house", "flat", "apartment", "upper_portion", "lower_portion", "room", "farmhouse", "villa", "penthouse", "townhouse", "hotel_apartment"],
  plots: ["residential_plot", "commercial_plot", "plot_file", "agricultural_land"],
  commercial: ["office", "shop", "warehouse", "factory", "building", "commercial_plot", "other"],
};

/** URL-friendly aliases used in SEO paths such as /buy/house/lahore */
export const TYPE_SLUGS: Record<string, PropertyType[] | "all"> = {
  property: "all",
  properties: "all",
  homes: TYPE_GROUPS.homes,
  house: ["house"],
  houses: ["house"],
  flat: ["flat", "apartment"],
  flats: ["flat", "apartment"],
  apartment: ["apartment", "flat"],
  apartments: ["apartment", "flat"],
  "upper-portion": ["upper_portion"],
  "lower-portion": ["lower_portion"],
  room: ["room"],
  farmhouse: ["farmhouse"],
  farmhouses: ["farmhouse"],
  villa: ["villa"],
  villas: ["villa"],
  penthouse: ["penthouse"],
  penthouses: ["penthouse"],
  townhouse: ["townhouse"],
  townhouses: ["townhouse"],
  "hotel-apartment": ["hotel_apartment"],
  "hotel-apartments": ["hotel_apartment"],
  plot: TYPE_GROUPS.plots,
  plots: TYPE_GROUPS.plots,
  "residential-plot": ["residential_plot"],
  "commercial-plot": ["commercial_plot"],
  "agricultural-land": ["agricultural_land"],
  office: ["office"],
  shop: ["shop"],
  warehouse: ["warehouse"],
  factory: ["factory"],
  building: ["building"],
  commercial: TYPE_GROUPS.commercial,
};

export const LISTING_STATUSES = ["draft", "pending_review", "active", "paused", "sold", "rented", "expired", "rejected"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  active: "Active",
  paused: "Paused",
  sold: "Sold",
  rented: "Rented",
  expired: "Expired",
  rejected: "Rejected",
};

export const FURNISHING = ["furnished", "semi_furnished", "unfurnished"] as const;
export type Furnishing = (typeof FURNISHING)[number];
export const FURNISHING_LABELS: Record<Furnishing, string> = {
  furnished: "Furnished",
  semi_furnished: "Semi Furnished",
  unfurnished: "Unfurnished",
};

export const CONDITIONS = ["brand_new", "good", "old", "under_construction"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABELS: Record<Condition, string> = {
  brand_new: "Brand New",
  good: "Good Condition",
  old: "Old",
  under_construction: "Under Construction",
};

/** Feature / amenity catalogue. `filter: true` features appear as search filters. */
export const FEATURES = [
  { key: "corner", label: "Corner", group: "location", filter: true },
  { key: "park_facing", label: "Park Facing", group: "location", filter: true },
  { key: "main_boulevard", label: "Main Boulevard", group: "location", filter: true },
  { key: "possession", label: "Possession", group: "status", filter: true },
  { key: "installments", label: "Installments Available", group: "status", filter: true },
  { key: "ready_to_move", label: "Ready to Move", group: "status", filter: true },
  { key: "basement", label: "Basement", group: "rooms", filter: true },
  { key: "servant_quarter", label: "Servant Quarter", group: "rooms", filter: true },
  { key: "drawing_room", label: "Drawing Room", group: "rooms", filter: false },
  { key: "dining_room", label: "Dining Room", group: "rooms", filter: false },
  { key: "study_room", label: "Study Room", group: "rooms", filter: false },
  { key: "store_room", label: "Store Room", group: "rooms", filter: false },
  { key: "lawn", label: "Lawn / Garden", group: "rooms", filter: false },
  { key: "terrace", label: "Terrace", group: "rooms", filter: false },
  { key: "garage", label: "Garage", group: "parking", filter: true },
  { key: "parking", label: "Parking", group: "parking", filter: true },
  { key: "electricity", label: "Electricity", group: "utilities", filter: true },
  { key: "gas", label: "Sui Gas", group: "utilities", filter: true },
  { key: "water", label: "Water Supply", group: "utilities", filter: true },
  { key: "sewerage", label: "Sewerage", group: "utilities", filter: false },
  { key: "security", label: "Security Staff", group: "community", filter: true },
  { key: "gated_community", label: "Gated Community", group: "community", filter: true },
  { key: "swimming_pool", label: "Swimming Pool", group: "community", filter: true },
  { key: "gym", label: "Gym", group: "community", filter: true },
  { key: "elevator", label: "Elevator", group: "building", filter: true },
  { key: "backup_generator", label: "Backup Generator", group: "building", filter: true },
  { key: "solar", label: "Solar Panels", group: "building", filter: true },
  { key: "cctv", label: "CCTV", group: "building", filter: true },
  { key: "mosque_nearby", label: "Mosque Nearby", group: "nearby", filter: false },
  { key: "school_nearby", label: "School Nearby", group: "nearby", filter: false },
  { key: "hospital_nearby", label: "Hospital Nearby", group: "nearby", filter: false },
  { key: "market_nearby", label: "Market Nearby", group: "nearby", filter: false },
  { key: "central_ac", label: "Central Air Conditioning", group: "building", filter: false },
  { key: "double_glazed", label: "Double Glazed Windows", group: "building", filter: false },
  { key: "internet", label: "Broadband Internet", group: "utilities", filter: false },
  { key: "maintenance_staff", label: "Maintenance Staff", group: "community", filter: false },
] as const;
export type FeatureKey = (typeof FEATURES)[number]["key"];
export const FEATURE_LABELS = Object.fromEntries(FEATURES.map((f) => [f.key, f.label])) as Record<FeatureKey, string>;
export const FEATURE_GROUP_LABELS: Record<string, string> = {
  location: "Location",
  status: "Status & Payment",
  rooms: "Rooms & Spaces",
  parking: "Parking",
  utilities: "Utilities",
  community: "Community",
  building: "Building & Tech",
  nearby: "Nearby",
};

export const SORT_OPTIONS = [
  { key: "recommended", label: "Recommended" },
  { key: "newest", label: "Newest" },
  { key: "price_asc", label: "Price: Low to High" },
  { key: "price_desc", label: "Price: High to Low" },
  { key: "most_viewed", label: "Most Viewed" },
  { key: "most_saved", label: "Most Saved" },
  { key: "updated", label: "Recently Updated" },
] as const;
export type SortKey = (typeof SORT_OPTIONS)[number]["key"];

export const VERIFICATION_LEVELS = [
  { level: 0, key: "unverified", label: "Unverified", description: "No verification performed." },
  { level: 1, key: "phone", label: "Phone Verified", description: "Contact phone number confirmed by one-time code." },
  { level: 2, key: "identity", label: "Identity Verified", description: `Owner/agent ${isUAE ? "Emirates ID" : "CNIC"} reviewed by Bismillah staff.` },
  { level: 3, key: "documents", label: "Documents Submitted", description: "Ownership documents submitted and awaiting final check." },
  { level: 4, key: "property", label: "Property Verified", description: "Ownership documents checked and location confirmed." },
  { level: 5, key: "premium", label: "Premium Verified", description: "Physically inspected by a Bismillah verification officer." },
] as const;
export function verificationInfo(level: number) {
  return VERIFICATION_LEVELS[Math.max(0, Math.min(5, level))];
}

export const LEAD_STATUSES = ["new", "contacted", "qualified", "negotiation", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_SOURCES = ["form", "call", "whatsapp", "chat", "visit", "offer", "payment_plan", "brochure", "ai_assistant"] as const;

export const APPOINTMENT_STATUSES = ["requested", "confirmed", "completed", "cancelled", "no_show", "rejected"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const PROJECT_STATUSES = ["pre_launch", "under_construction", "near_completion", "ready", "completed"] as const;
export const PROJECT_STATUS_LABELS: Record<(typeof PROJECT_STATUSES)[number], string> = {
  pre_launch: "Pre-Launch",
  under_construction: "Under Construction",
  near_completion: "Near Completion",
  ready: "Ready for Possession",
  completed: "Completed",
};
export const UNIT_TYPES = ["apartment", "villa", "plot", "shop", "office", "penthouse"] as const;

export const REPORT_REASONS = [
  { key: "fraud", label: "Fraud or scam" },
  { key: "incorrect_info", label: "Incorrect information" },
  { key: "duplicate", label: "Duplicate listing" },
  { key: "not_available", label: "Property no longer available" },
  { key: "fake_agent", label: "Fake agent / impersonation" },
  { key: "spam", label: "Spam" },
  { key: "offensive", label: "Offensive content" },
  { key: "other", label: "Other" },
] as const;

export const BLOG_CATEGORIES = [
  { key: "news", label: "Property News" },
  { key: "area_guide", label: "Area Guides" },
  { key: "investment", label: "Investment Guides" },
  { key: "buying", label: "Buying Guides" },
  { key: "selling", label: "Selling Guides" },
  { key: "rental", label: "Rental Guides" },
  { key: "construction", label: "Construction Guides" },
] as const;

export const FORUM_CATEGORIES = [
  { key: "general", label: "General" },
  { key: "investment", label: "Investment" },
  { key: "local", label: "Local Discussions" },
  { key: "legal", label: "Legal & Documentation" },
  { key: "construction", label: "Construction" },
  { key: "renting", label: "Renting" },
] as const;

export const NOTIFICATION_TYPES = [
  { key: "new_lead", label: "New lead" },
  { key: "new_message", label: "New message" },
  { key: "property_saved", label: "Someone saved your property" },
  { key: "price_reduced", label: "Price reduced on a saved property" },
  { key: "new_match", label: "New property matching a saved search" },
  { key: "visit_update", label: "Visit requests and confirmations" },
  { key: "listing_status", label: "Listing approved / rejected" },
  { key: "subscription", label: "Subscription reminders" },
  { key: "payment", label: "Payments and receipts" },
  { key: "rent", label: "Rent reminders" },
  { key: "verification", label: "Verification updates" },
  { key: "system", label: "Account & security" },
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]["key"];
export const NOTIFICATION_CHANNELS = ["in_app", "email", "sms", "whatsapp", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const PAYMENT_PURPOSES = ["subscription", "featured_listing", "advertising", "booking_fee", "project_booking", "token_deposit", "escrow_deposit"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const AD_FORMATS = [
  { key: "featured_listing", label: "Featured Listing" },
  { key: "top_search", label: "Top of Search Results" },
  { key: "homepage_banner", label: "Homepage Banner" },
  { key: "project_promotion", label: "Project Promotion" },
  { key: "area_sponsorship", label: "Area Sponsorship" },
  { key: "agent_promotion", label: "Agent Promotion" },
] as const;
export type AdFormat = (typeof AD_FORMATS)[number]["key"];

/** price of featuring a listing for 7 / 15 / 30 days, in the site currency */
export const FEATURED_PRICE: Record<7 | 15 | 30, number> = isUAE ? { 7: 99, 15: 169, 30: 299 } : { 7: 1500, 15: 2500, 30: 4500 };
/** @deprecated use FEATURED_PRICE */
export const FEATURED_PRICE_PKR = FEATURED_PRICE;
