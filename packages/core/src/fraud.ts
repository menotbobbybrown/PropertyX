/**
 * Rule-based fraud & quality signals. Each rule produces a flag with a severity and
 * score; the listing's fraud_score is the capped sum of open flag scores. High-risk
 * listings are held for review and staff are alerted. Rules are deliberately
 * explainable so moderators can see exactly why something was flagged.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@propertyx/database";
import * as s from "@propertyx/database";
import { notify } from "@propertyx/notifications";
import { getSetting } from "./settings";
import { hammingHex } from "./storage";
import { requirePerm, notFound, type Actor } from "./errors";
import { audit } from "@propertyx/auth";

type Severity = "low" | "medium" | "high" | "critical";
interface Finding {
  rule: string;
  severity: Severity;
  score: number;
  summary: string;
  details: Record<string, unknown>;
}

export const SCAM_PATTERNS: { re: RegExp; label: string; weight: number }[] = [
  { re: /\b(send|pay|transfer)\b.{0,30}\b(advance|token|booking)\b.{0,40}\b(easypaisa|jazzcash|jazz cash|account|wallet)\b/i, label: "asks for advance via wallet/account", weight: 35 },
  { re: /\b(owner|i am) (is )?(abroad|overseas|out of country)\b/i, label: "owner abroad story", weight: 15 },
  { re: /\b(today only|booking today only|price is final.{0,20}today|hurry|urgent sale)\b/i, label: "urgency pressure", weight: 10 },
  { re: /\b(guaranteed|100%) (profit|return)s?\b/i, label: "guaranteed returns", weight: 20 },
  { re: /\bwithout (visit|seeing)\b/i, label: "discourages visits", weight: 15 },
  { re: /\b(whatsapp me on|contact on whatsapp) \+?\d{10,}/i, label: "off-platform contact in text", weight: 5 },
];

export function scamTextScore(text: string) {
  const hits = SCAM_PATTERNS.filter((p) => p.re.test(text));
  return { score: hits.reduce((t, h) => t + h.weight, 0), labels: hits.map((h) => h.label) };
}

/** Spam score for chat messages (0-100). */
export function messageSpamScore(body: string, recentCount: number) {
  let score = scamTextScore(body).score;
  if (/(https?:\/\/|www\.)\S+/i.test(body) && !/bismillah|propertyx/i.test(body)) score += 20;
  if (/(.)\1{7,}/.test(body)) score += 15;
  if (body.length > 20 && body.replace(/[^A-Z]/g, "").length / body.length > 0.6) score += 10;
  if (recentCount > 20) score += 30;
  else if (recentCount > 10) score += 15;
  return Math.min(100, score);
}

export async function scanListing(db: Database, listingId: string): Promise<{ score: number; findings: Finding[] }> {
  const [row] = await db.select({ l: s.propertyListings, p: s.properties }).from(s.propertyListings).innerJoin(s.properties, eq(s.properties.id, s.propertyListings.propertyId)).where(eq(s.propertyListings.id, listingId));
  if (!row) throw notFound("Listing");
  const { l, p } = row;
  const thresholds = (await getSetting<{ priceDeviationPct: number; maxListingsPerPhonePerDay: number }>(db, "fraud_thresholds")) ?? { priceDeviationPct: 55, maxListingsPerPhonePerDay: 15 };
  const findings: Finding[] = [];

  // 1. duplicate images (exact hash, or near-duplicate perceptual hash) on another poster's listing
  const media = await db.select().from(s.propertyMedia).where(and(eq(s.propertyMedia.propertyId, p.id), eq(s.propertyMedia.kind, "image")));
  const hashes = media.map((m) => m.sha256).filter(Boolean) as string[];
  if (hashes.length) {
    const dupes = await db.execute<{ listing_id: string; title: string; n: number }>(sql`
      select ol.id as listing_id, ol.title, count(*)::int as n from property_media m
      join property_listings ol on ol.property_id = m.property_id
      where m.sha256 in (${sql.join(hashes.map((h) => sql`${h}`), sql`, `)}) and m.property_id <> ${p.id}
        and ol.posted_by_id is distinct from ${l.postedById} and ol.status in ('active','pending_review','paused')
        and coalesce(ol.published_at, ol.created_at) < coalesce(${(l.publishedAt ?? l.createdAt).toISOString()}::timestamptz, now())
      group by ol.id, ol.title limit 5`);
    if (dupes.length)
      findings.push({ rule: "duplicate_images", severity: "high", score: 40, summary: `${dupes[0].n} photo(s) also used on another poster's listing “${dupes[0].title}”`, details: { matches: dupes } });
  }
  const phashes = media.map((m) => m.perceptualHash).filter(Boolean) as string[];
  if (phashes.length && !findings.some((f) => f.rule === "duplicate_images")) {
    const candidates = await db.execute<{ perceptual_hash: string; listing_id: string; title: string }>(sql`
      select m.perceptual_hash, ol.id as listing_id, ol.title from property_media m join property_listings ol on ol.property_id = m.property_id
      where m.perceptual_hash is not null and m.property_id <> ${p.id} and ol.posted_by_id is distinct from ${l.postedById} and ol.status in ('active','pending_review')
        and m.created_at > now() - interval '365 days' limit 5000`);
    const near = candidates.find((c) => phashes.some((h) => hammingHex(h, c.perceptual_hash) <= 4));
    if (near) findings.push({ rule: "similar_images", severity: "medium", score: 25, summary: `Photos closely resemble another poster's listing “${near.title}”`, details: { listingId: near.listing_id } });
  }

  // 2. duplicate listing text by a different poster
  const textDupes = await db.execute<{ id: string; title: string; sim: number }>(sql`
    select ol.id, ol.title, similarity(ol.description, ${l.description}) as sim from property_listings ol join properties op on op.id = ol.property_id
    where ol.id <> ${l.id} and op.city_id = ${p.cityId} and op.type = ${p.type}
      and coalesce(op.society_id, op.area_id) is not distinct from ${p.societyId ?? p.areaId} and op.area_sqft between ${p.areaSqft * 0.9} and ${p.areaSqft * 1.1}
      and ol.posted_by_id is distinct from ${l.postedById} and ol.status in ('active','pending_review')
      and coalesce(ol.published_at, ol.created_at) < coalesce(${(l.publishedAt ?? l.createdAt).toISOString()}::timestamptz, now())
      and ol.description % ${l.description} order by sim desc limit 1`);
  if (textDupes[0] && Number(textDupes[0].sim) > 0.9)
    findings.push({ rule: "duplicate_listing", severity: "medium", score: 25, summary: `Description is ${Math.round(Number(textDupes[0].sim) * 100)}% similar to “${textDupes[0].title}” by another poster`, details: { listingId: textDupes[0].id } });

  // 2.5 duplicate cadastral plot claim (same plot number in the same society & block by a different poster)
  if (p.plotNumber && (p.societyId || p.blockId || p.blockName)) {
    const plotMatches = await db.execute<{ id: string; title: string; plot_number: string }>(sql`
      select ol.id, ol.title, op.plot_number from property_listings ol join properties op on op.id = ol.property_id
      where ol.id <> ${l.id}
        and lower(trim(op.plot_number)) = lower(trim(${p.plotNumber}))
        and coalesce(op.society_id, op.area_id) is not distinct from ${p.societyId ?? p.areaId}
        and coalesce(lower(trim(op.block_name)), '') = coalesce(lower(trim(${p.blockName ?? ''})), '')
        and ol.posted_by_id is distinct from ${l.postedById}
        and ol.status in ('active', 'pending_review')
      limit 3`);
    if (plotMatches[0]) {
      findings.push({
        rule: "duplicate_plot_claim",
        severity: "high",
        score: 45,
        summary: `Plot #${p.plotNumber}${p.blockName ? ` Block ${p.blockName}` : ""} is already claimed by another listing “${plotMatches[0].title}”`,
        details: { matches: plotMatches },
      });
    }
  }

  // 3. suspicious price vs comparable listings (same city, type, purpose, size band)
  const comps = await db.execute<{ median: number; n: number }>(sql`
    select percentile_cont(0.5) within group (order by ol.price / nullif(op.area_sqft,0)) as median, count(*)::int as n
    from property_listings ol join properties op on op.id = ol.property_id
    where ol.status in ('active','sold','rented') and ol.id <> ${l.id} and op.city_id = ${p.cityId} and op.type = ${p.type} and ol.purpose = ${l.purpose}
      and coalesce(op.society_id, op.area_id) is not distinct from ${p.societyId ?? p.areaId}
      and op.area_sqft between ${p.areaSqft * 0.5} and ${p.areaSqft * 2}`);
  const median = Number(comps[0]?.median ?? 0);
  if (comps[0] && Number(comps[0].n) >= 4 && median > 0) {
    const ppsf = l.price / p.areaSqft;
    const deviation = ((median - ppsf) / median) * 100;
    if (deviation >= thresholds.priceDeviationPct)
      findings.push({ rule: "suspicious_price", severity: deviation >= 70 ? "high" : "medium", score: deviation >= 70 ? 35 : 20, summary: `Price per sq ft is ${Math.round(deviation)}% below ${comps[0].n} comparable listings`, details: { pricePerSqft: Math.round(ppsf), median: Math.round(median), comparables: Number(comps[0].n) } });
    if (ppsf > median * 4) findings.push({ rule: "price_outlier_high", severity: "low", score: 5, summary: "Price is far above comparable listings — possible typo (e.g. extra zero)", details: { pricePerSqft: Math.round(ppsf), median: Math.round(median) } });
  }

  // 4. repeated phone across many posters / high velocity
  const phone = await db.execute<{ posters: number; today: number }>(sql`
    select count(distinct posted_by_id)::int as posters, count(*) filter (where created_at > now() - interval '24 hours')::int as today
    from property_listings where contact_phone = ${l.contactPhone}`);
  if (Number(phone[0]?.posters) >= 3)
    findings.push({ rule: "repeated_phone", severity: "medium", score: 20, summary: `Contact number is used by ${phone[0].posters} different accounts`, details: { phone: l.contactPhone } });
  if (Number(phone[0]?.today) > thresholds.maxListingsPerPhonePerDay)
    findings.push({ rule: "spam_velocity", severity: "medium", score: 15, summary: `${phone[0].today} listings posted with this number in 24 hours`, details: {} });

  // 5. scam language
  const text = scamTextScore(`${l.title}\n${l.description}`);
  if (text.score > 0) findings.push({ rule: "misleading_description", severity: text.score >= 30 ? "high" : "low", score: Math.min(40, text.score), summary: `Description contains risky language: ${text.labels.join(", ")}`, details: { patterns: text.labels } });

  // 6. new unverified poster
  if (l.postedById) {
    const [u] = await db.select({ createdAt: s.users.createdAt, level: s.users.verificationLevel, phoneVerifiedAt: s.users.phoneVerifiedAt }).from(s.users).where(eq(s.users.id, l.postedById));
    if (u && !u.phoneVerifiedAt && Date.now() - u.createdAt.getTime() < 7 * 86400_000) findings.push({ rule: "new_unverified_account", severity: "low", score: 10, summary: "Posted by an account created this week without phone verification", details: {} });
  }

  // 7. agent claims: listing attached to an agent whose agency is unverified and phone differs
  if (l.agentId) {
    const [a] = await db.select({ phone: s.agents.phone, level: s.agents.verificationLevel }).from(s.agents).where(eq(s.agents.id, l.agentId));
    const others = await db.execute<{ n: number }>(sql`select count(*)::int as n from agents where phone = ${l.contactPhone} and id <> ${l.agentId}`);
    if (Number(others[0]?.n) > 0 && (a?.level ?? 0) < 2) findings.push({ rule: "fake_agent", severity: "high", score: 30, summary: "Contact number belongs to a different agent profile", details: {} });
  }

  // persist: replace open auto-flags for this listing
  await db.delete(s.fraudFlags).where(and(eq(s.fraudFlags.targetType, "listing"), eq(s.fraudFlags.targetId, l.id), eq(s.fraudFlags.status, "open")));
  const dismissed = await db.select({ rule: s.fraudFlags.rule }).from(s.fraudFlags).where(and(eq(s.fraudFlags.targetType, "listing"), eq(s.fraudFlags.targetId, l.id), eq(s.fraudFlags.status, "dismissed")));
  const dismissedRules = new Set(dismissed.map((d) => d.rule));
  const active = findings.filter((f) => !dismissedRules.has(f.rule));
  if (active.length) await db.insert(s.fraudFlags).values(active.map((f) => ({ targetType: "listing", targetId: l.id, rule: f.rule, severity: f.severity, score: f.score, summary: f.summary, details: f.details })));
  const score = Math.min(100, active.reduce((t, f) => t + f.score, 0));
  await db.update(s.propertyListings).set({ fraudScore: score }).where(eq(s.propertyListings.id, l.id));

  if (active.some((f) => f.severity === "high" || f.severity === "critical")) {
    if (l.status === "active") await db.update(s.propertyListings).set({ status: "pending_review" }).where(eq(s.propertyListings.id, l.id));
    const staff = await db.execute<{ id: string }>(sql`select distinct ur.user_id as id from user_roles ur join roles r on r.id = ur.role_id where r.key in ('moderator','admin','super_admin')`);
    for (const st of staff)
      await notify(db, { userId: st.id, type: "system", title: "Fraud alert", body: `${active[0].summary} — ${l.referenceCode}`, link: `/admin/fraud` });
  }
  return { score, findings: active };
}

export async function scanAllListings(db: Database) {
  const rows = await db.select({ id: s.propertyListings.id }).from(s.propertyListings).where(sql`${s.propertyListings.status} in ('active','pending_review')`);
  let flagged = 0;
  for (const r of rows) if ((await scanListing(db, r.id)).findings.length) flagged++;
  return { scanned: rows.length, flagged };
}

export async function reviewFraudFlag(db: Database, actor: Actor | null, flagId: string, decision: "confirmed" | "dismissed", note?: string) {
  requirePerm(actor, "fraud.manage");
  const [f] = await db.update(s.fraudFlags).set({ status: decision, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note ?? null }).where(eq(s.fraudFlags.id, flagId)).returning();
  if (!f) throw notFound("Flag");
  if (f.targetType === "listing") {
    if (decision === "confirmed") await db.update(s.propertyListings).set({ status: "rejected", rejectionReason: `Removed by Trust & Safety: ${f.summary}` }).where(eq(s.propertyListings.id, f.targetId));
    else {
      const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(score),0)::int` }).from(s.fraudFlags).where(and(eq(s.fraudFlags.targetType, "listing"), eq(s.fraudFlags.targetId, f.targetId), eq(s.fraudFlags.status, "open")));
      await db.update(s.propertyListings).set({ fraudScore: Math.min(100, total) }).where(eq(s.propertyListings.id, f.targetId));
    }
  }
  await audit(db, { actorId: actor.id, action: `fraud.${decision}`, entityType: "fraud_flag", entityId: flagId, metadata: { note } });
  return f;
}
