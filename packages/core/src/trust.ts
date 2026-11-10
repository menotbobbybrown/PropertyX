import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@propertyx/database";
import * as s from "@propertyx/database";
import { notify } from "@propertyx/notifications";
import { audit, rateLimit } from "@propertyx/auth";
import { extractDocument } from "@propertyx/ai";
import { reviewInputSchema, reportInputSchema } from "@propertyx/shared";
import { badRequest, conflict, forbidden, notFound, requireActor, requirePerm, tooMany, type Actor } from "./errors";
import { storePrivate, getFile } from "./storage";

/* ------------------------------------------------------------------ */
/* Reviews                                                              */
/* ------------------------------------------------------------------ */

async function reviewTargetOwner(db: Database, type: string, id: string): Promise<string | null> {
  if (type === "agent") return (await db.select({ u: s.agents.userId }).from(s.agents).where(eq(s.agents.id, id)))[0]?.u ?? null;
  if (type === "agency") return (await db.select({ u: s.agencies.ownerId }).from(s.agencies).where(eq(s.agencies.id, id)))[0]?.u ?? null;
  if (type === "developer") return (await db.select({ u: s.developers.ownerId }).from(s.developers).where(eq(s.developers.id, id)))[0]?.u ?? null;
  if (type === "project") return (await db.select({ u: s.developers.ownerId }).from(s.projects).innerJoin(s.developers, eq(s.developers.id, s.projects.developerId)).where(eq(s.projects.id, id)))[0]?.u ?? null;
  return null;
}

/** Did the reviewer actually interact with the target (lead, visit or conversation)? */
async function hasInteraction(db: Database, userId: string, type: string, id: string) {
  const cond =
    type === "agent"
      ? sql`ld.agent_id = ${id}`
      : type === "agency"
        ? sql`ld.agency_id = ${id}`
        : type === "developer"
          ? sql`ld.developer_id = ${id}`
          : sql`ld.project_id = ${id}`;
  const rows = await db.execute(sql`select 1 from leads ld where ld.user_id = ${userId} and ${cond} limit 1`);
  return rows.length > 0;
}

export async function createReview(db: Database, actor: Actor | null, raw: unknown) {
  requirePerm(actor, "review.create");
  const parsed = reviewInputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Please complete the review", parsed.error.flatten());
  const input = parsed.data;
  const owner = await reviewTargetOwner(db, input.targetType, input.targetId);
  if (owner === undefined) throw notFound();
  if (owner === actor.id) throw badRequest("You can't review yourself");
  if (!actor.phoneVerified) throw forbidden("Verify your phone number before writing reviews");
  const verified = await hasInteraction(db, actor.id, input.targetType, input.targetId);
  try {
    const [r] = await db.insert(s.reviews).values({ ...input, authorId: actor.id, isVerifiedInteraction: verified, status: "pending" }).returning();
    return r;
  } catch {
    throw conflict("You have already reviewed this");
  }
}

export async function respondToReview(db: Database, actor: Actor | null, reviewId: string, body: string) {
  requirePerm(actor, "review.respond");
  const [r] = await db.select().from(s.reviews).where(eq(s.reviews.id, reviewId));
  if (!r) throw notFound("Review");
  if ((await reviewTargetOwner(db, r.targetType, r.targetId)) !== actor.id) throw forbidden();
  if (!body.trim() || body.length > 2000) throw badRequest("Response must be 1–2000 characters");
  await db.update(s.reviews).set({ responseBody: body.trim(), responseAt: new Date(), responderId: actor.id }).where(eq(s.reviews.id, reviewId));
}

export async function moderateReview(db: Database, actor: Actor | null, reviewId: string, status: "published" | "rejected", note?: string) {
  requirePerm(actor, "review.moderate");
  const [r] = await db.update(s.reviews).set({ status, moderatedById: actor.id, moderationNote: note ?? null }).where(eq(s.reviews.id, reviewId)).returning();
  if (!r) throw notFound("Review");
  await recomputeRating(db, r.targetType, r.targetId);
  await audit(db, { actorId: actor.id, action: `review.${status}`, entityType: "review", entityId: reviewId });
  if (status === "published") {
    const owner = await reviewTargetOwner(db, r.targetType, r.targetId);
    if (owner) await notify(db, { userId: owner, type: "system", title: "New review published", body: `You received a ${r.rating}-star review: “${r.title}”`, link: "/dashboard/reviews" });
  }
}

async function recomputeRating(db: Database, type: string, id: string) {
  const [agg] = await db.select({ avg: sql<number>`coalesce(avg(rating),0)`, n: sql<number>`count(*)::int` }).from(s.reviews).where(and(eq(s.reviews.targetType, type), eq(s.reviews.targetId, id), eq(s.reviews.status, "published")));
  const vals = { ratingAvg: Math.round(Number(agg.avg) * 100) / 100, reviewsCount: agg.n };
  if (type === "agent") await db.update(s.agents).set(vals).where(eq(s.agents.id, id));
  if (type === "agency") await db.update(s.agencies).set(vals).where(eq(s.agencies.id, id));
  if (type === "developer") await db.update(s.developers).set(vals).where(eq(s.developers.id, id));
  if (type === "project") await db.update(s.projects).set(vals).where(eq(s.projects.id, id));
}

export async function listReviews(db: Database, type: string, id: string) {
  return db
    .select({ r: s.reviews, authorName: s.users.name })
    .from(s.reviews)
    .innerJoin(s.users, eq(s.users.id, s.reviews.authorId))
    .where(and(eq(s.reviews.targetType, type), eq(s.reviews.targetId, id), eq(s.reviews.status, "published")))
    .orderBy(desc(s.reviews.createdAt))
    .limit(50);
}

export async function reviewsForOwner(db: Database, actor: Actor) {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select r.*, u.name as author_name from reviews r join users u on u.id = r.author_id
    where r.status = 'published' and (
      (r.target_type = 'agent' and r.target_id in (select id from agents where user_id = ${actor.id})) or
      (r.target_type = 'agency' and r.target_id in (select id from agencies where owner_id = ${actor.id})) or
      (r.target_type = 'developer' and r.target_id in (select id from developers where owner_id = ${actor.id})) or
      (r.target_type = 'project' and r.target_id in (select p.id from projects p join developers d on d.id = p.developer_id where d.owner_id = ${actor.id})))
    order by r.created_at desc`);
  return rows;
}

/* ------------------------------------------------------------------ */
/* Reports                                                              */
/* ------------------------------------------------------------------ */

export async function createReport(db: Database, actor: Actor | null, raw: unknown, meta: { ip?: string | null } = {}) {
  const parsed = reportInputSchema.safeParse(raw);
  if (!parsed.success) throw badRequest("Please choose a reason", parsed.error.flatten());
  const rl = await rateLimit(db, `report:${actor?.id ?? meta.ip ?? "anon"}`, 10, 3600);
  if (!rl.ok) throw tooMany();
  const [r] = await db.insert(s.reports).values({ ...parsed.data, reporterId: actor?.id ?? null }).returning();
  // escalate: 3+ open reports on the same listing pulls it back into review
  if (parsed.data.targetType === "listing") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.reports).where(and(eq(s.reports.targetType, "listing"), eq(s.reports.targetId, parsed.data.targetId), eq(s.reports.status, "open")));
    if (n >= 3) await db.update(s.propertyListings).set({ status: "pending_review" }).where(and(eq(s.propertyListings.id, parsed.data.targetId), eq(s.propertyListings.status, "active")));
    if (parsed.data.reason === "fraud")
      await db.insert(s.fraudFlags).values({ targetType: "listing", targetId: parsed.data.targetId, rule: "user_report_fraud", severity: n >= 2 ? "high" : "medium", score: 20, summary: `Reported as fraud by a user${parsed.data.details ? `: “${parsed.data.details.slice(0, 120)}”` : ""}`, details: { reportId: r.id } });
  }
  return r;
}

export async function listReports(db: Database, actor: Actor | null, status = "open") {
  requirePerm(actor, "report.manage");
  return db.execute<Record<string, unknown>>(sql`
    select r.*, u.name as reporter_name,
      case r.target_type
        when 'listing' then (select title from property_listings where id = r.target_id)
        when 'agent' then (select display_name from agents where id = r.target_id)
        when 'agency' then (select name from agencies where id = r.target_id)
        when 'user' then (select name from users where id = r.target_id)
        when 'project' then (select name from projects where id = r.target_id)
        when 'review' then (select title from reviews where id = r.target_id)
        else null end as target_label,
      case r.target_type when 'listing' then (select slug from property_listings where id = r.target_id) else null end as target_slug
    from reports r left join users u on u.id = r.reporter_id
    where ${status === "all" ? sql`true` : sql`r.status = ${status}`} order by r.created_at desc limit 200`);
}

export async function resolveReport(db: Database, actor: Actor | null, id: string, status: "investigating" | "resolved" | "dismissed", note?: string, action?: "remove_listing" | "suspend_user" | "hide_review") {
  requirePerm(actor, "report.manage");
  const [r] = await db.update(s.reports).set({ status, resolvedById: actor.id, resolutionNote: note ?? null, resolvedAt: status === "investigating" ? null : new Date() }).where(eq(s.reports.id, id)).returning();
  if (!r) throw notFound("Report");
  if (action === "remove_listing" && r.targetType === "listing") {
    requirePerm(actor, "listing.moderate");
    await db.update(s.propertyListings).set({ status: "rejected", rejectionReason: `Removed after a user report: ${note ?? r.reason}` }).where(eq(s.propertyListings.id, r.targetId));
  }
  if (action === "hide_review" && r.targetType === "review") {
    requirePerm(actor, "review.moderate");
    await db.update(s.reviews).set({ status: "rejected" }).where(eq(s.reviews.id, r.targetId));
  }
  if (action === "suspend_user") {
    requirePerm(actor, "user.suspend");
    const userId = r.targetType === "user" ? r.targetId : r.targetType === "agent" ? (await db.select({ u: s.agents.userId }).from(s.agents).where(eq(s.agents.id, r.targetId)))[0]?.u : null;
    if (userId) await db.update(s.users).set({ status: "suspended", suspendedReason: note ?? "Trust & Safety action" }).where(eq(s.users.id, userId));
  }
  await audit(db, { actorId: actor.id, action: `report.${status}`, entityType: "report", entityId: id, metadata: { action, note } });
  if (r.reporterId && status !== "investigating") await notify(db, { userId: r.reporterId, type: "system", title: "Update on your report", body: status === "resolved" ? "Thanks — we reviewed your report and took action." : "Thanks — we reviewed your report and found no violation.", link: "/account" });
  return r;
}

/* ------------------------------------------------------------------ */
/* Verification + private documents                                     */
/* ------------------------------------------------------------------ */

const LEVEL_DOCS: Record<number, string[]> = {
  2: ["cnic_front", "cnic_back"],
  3: ["ownership"],
  4: ["ownership"],
  5: ["ownership"],
};

async function assertSubjectOwner(db: Database, actor: Actor, subjectType: string, subjectId: string) {
  if (subjectType === "user" && subjectId === actor.id) return;
  if (subjectType === "listing") {
    const [l] = await db.select({ u: s.propertyListings.postedById }).from(s.propertyListings).where(eq(s.propertyListings.id, subjectId));
    if (l?.u === actor.id) return;
  }
  if (subjectType === "agent") {
    const [a] = await db.select({ u: s.agents.userId }).from(s.agents).where(eq(s.agents.id, subjectId));
    if (a?.u === actor.id) return;
  }
  if (subjectType === "agency") {
    const [a] = await db.select({ u: s.agencies.ownerId }).from(s.agencies).where(eq(s.agencies.id, subjectId));
    if (a?.u === actor.id) return;
  }
  if (subjectType === "developer" || subjectType === "project") {
    const devId = subjectType === "developer" ? subjectId : (await db.select({ d: s.projects.developerId }).from(s.projects).where(eq(s.projects.id, subjectId)))[0]?.d;
    const [d] = devId ? await db.select({ u: s.developers.ownerId }).from(s.developers).where(eq(s.developers.id, devId)) : [];
    if (d?.u === actor.id) return;
  }
  throw forbidden();
}

export async function uploadDocument(db: Database, actor: Actor | null, buf: Buffer, meta: { kind: string; originalName: string; relatedType?: string; relatedId?: string }) {
  requireActor(actor);
  const allowedKinds = ["cnic_front", "cnic_back", "ownership", "allotment", "noc", "contract", "rental_agreement", "developer_license", "utility_bill", "other"];
  if (!allowedKinds.includes(meta.kind)) throw badRequest("Unknown document type");
  const f = await storePrivate(buf, `documents/${actor.id}`);
  const [doc] = await db
    .insert(s.documents)
    .values({ ownerId: actor.id, kind: meta.kind, storageKey: f.key, originalName: meta.originalName.slice(0, 200), mime: f.mime, sizeBytes: f.sizeBytes, sha256: f.sha256, relatedType: meta.relatedType ?? null, relatedId: meta.relatedId ?? null })
    .returning({ id: s.documents.id, kind: s.documents.kind, originalName: s.documents.originalName, mime: s.documents.mime, sizeBytes: s.documents.sizeBytes, createdAt: s.documents.createdAt });
  // same document file used by a different account is a strong fraud signal
  const reused = await db.select({ owner: s.documents.ownerId }).from(s.documents).where(and(eq(s.documents.sha256, f.sha256), sql`${s.documents.ownerId} <> ${actor.id}`)).limit(1);
  if (reused.length) await db.insert(s.fraudFlags).values({ targetType: "document", targetId: doc.id, rule: "reused_document", severity: "critical", score: 60, summary: "The same document file was uploaded by another account", details: { otherOwner: reused[0].owner } });
  // advisory AI extraction (never auto-approves)
  if (f.mime === "application/pdf" || f.mime.startsWith("image/")) {
    const extracted = await extractDocument({ mediaType: f.mime as "application/pdf", base64: buf.toString("base64") });
    if (extracted) await db.update(s.documents).set({ extracted }).where(eq(s.documents.id, doc.id));
  }
  return doc;
}

export async function submitVerification(db: Database, actor: Actor | null, input: { subjectType: string; subjectId: string; level: number; documentIds: string[]; notes?: string }) {
  requirePerm(actor, "verification.request");
  if (input.level < 2 || input.level > 5) throw badRequest("Choose verification level 2–5 (phone verification is done in Account → Security)");
  if (["listing"].includes(input.subjectType) && input.level < 3) throw badRequest("Listings start at level 3 (documents submitted)");
  if (["user", "agent", "agency"].includes(input.subjectType) && input.level > 2) throw badRequest("Profiles can be verified up to level 2");
  await assertSubjectOwner(db, actor, input.subjectType, input.subjectId);
  const docs = input.documentIds.length ? await db.select().from(s.documents).where(and(inArray(s.documents.id, input.documentIds), eq(s.documents.ownerId, actor.id))) : [];
  const required = LEVEL_DOCS[input.level] ?? [];
  const missing = required.filter((k) => !docs.some((d) => d.kind === k || (k === "ownership" && ["allotment", "noc"].includes(d.kind))));
  if (missing.length) throw badRequest(`Please upload: ${missing.map((m) => m.replace("_", " ")).join(", ")}`);
  const [pending] = await db.select().from(s.verificationRequests).where(and(eq(s.verificationRequests.subjectType, input.subjectType), eq(s.verificationRequests.subjectId, input.subjectId), eq(s.verificationRequests.status, "pending")));
  if (pending) throw conflict("A verification request is already pending for this item");
  const [req] = await db.insert(s.verificationRequests).values({ subjectType: input.subjectType, subjectId: input.subjectId, requestedLevel: input.level, submittedById: actor.id, notes: input.notes ?? null }).returning();
  if (docs.length) await db.update(s.documents).set({ verificationRequestId: req.id }).where(inArray(s.documents.id, docs.map((d) => d.id)));
  // Hardened security invariant: Listing verification level is only promoted upon review approval, never on raw document submission.
  return req;
}

export async function myVerification(db: Database, actor: Actor) {
  const requests = await db.select().from(s.verificationRequests).where(eq(s.verificationRequests.submittedById, actor.id)).orderBy(desc(s.verificationRequests.createdAt));
  const docs = await db.select({ id: s.documents.id, kind: s.documents.kind, originalName: s.documents.originalName, createdAt: s.documents.createdAt, verificationRequestId: s.documents.verificationRequestId, mime: s.documents.mime }).from(s.documents).where(eq(s.documents.ownerId, actor.id)).orderBy(desc(s.documents.createdAt));
  return { requests, docs };
}

export async function verificationQueue(db: Database, actor: Actor | null, status = "pending") {
  requirePerm(actor, "verification.review");
  const rows = await db.execute<Record<string, unknown>>(sql`
    select v.*, u.name as submitter_name, u.email as submitter_email,
      case v.subject_type
        when 'listing' then (select title from property_listings where id = v.subject_id)
        when 'agent' then (select display_name from agents where id = v.subject_id)
        when 'agency' then (select name from agencies where id = v.subject_id)
        when 'developer' then (select name from developers where id = v.subject_id)
        when 'project' then (select name from projects where id = v.subject_id)
        when 'user' then (select name from users where id = v.subject_id) end as subject_label,
      (select json_agg(json_build_object('id', d.id, 'kind', d.kind, 'name', d.original_name, 'mime', d.mime, 'extracted', d.extracted)) from documents d where d.verification_request_id = v.id) as documents
    from verification_requests v join users u on u.id = v.submitted_by_id
    where ${status === "all" ? sql`true` : sql`v.status = ${status}`} order by v.created_at asc limit 200`);
  return rows;
}

export async function reviewVerification(db: Database, actor: Actor | null, id: string, decision: "approved" | "rejected", notes?: string, grantedLevel?: number) {
  requirePerm(actor, "verification.review");
  const [v] = await db.select().from(s.verificationRequests).where(eq(s.verificationRequests.id, id));
  if (!v) throw notFound("Verification request");
  if (v.status !== "pending") throw badRequest("Already reviewed");
  if (decision === "rejected" && !notes?.trim()) throw badRequest("Tell the applicant what was wrong");
  const level = Math.min(v.requestedLevel, grantedLevel ?? v.requestedLevel);
  const expiresAt = new Date(Date.now() + 365 * 86400_000);
  await db.update(s.verificationRequests).set({ status: decision, reviewerId: actor.id, reviewedAt: new Date(), reviewerNotes: notes ?? null, expiresAt: decision === "approved" ? expiresAt : null }).where(eq(s.verificationRequests.id, id));
  if (decision === "approved") {
    const now = new Date();
    if (v.subjectType === "listing") await db.update(s.propertyListings).set({ verificationLevel: level, verifiedAt: now }).where(eq(s.propertyListings.id, v.subjectId));
    if (v.subjectType === "user") await db.update(s.users).set({ verificationLevel: sql`greatest(${s.users.verificationLevel}, ${level})`, identityVerifiedAt: now }).where(eq(s.users.id, v.subjectId));
    if (v.subjectType === "agent") {
      await db.update(s.agents).set({ verificationLevel: level }).where(eq(s.agents.id, v.subjectId));
      const [a] = await db.select({ u: s.agents.userId }).from(s.agents).where(eq(s.agents.id, v.subjectId));
      if (a) await db.update(s.users).set({ verificationLevel: sql`greatest(${s.users.verificationLevel}, ${level})`, identityVerifiedAt: now }).where(eq(s.users.id, a.u));
    }
    if (v.subjectType === "agency") await db.update(s.agencies).set({ verificationLevel: level }).where(eq(s.agencies.id, v.subjectId));
    if (v.subjectType === "developer") await db.update(s.developers).set({ verificationLevel: level }).where(eq(s.developers.id, v.subjectId));
  } else if (v.subjectType === "listing") {
    await db.update(s.propertyListings).set({ verificationLevel: sql`least(${s.propertyListings.verificationLevel}, 2)` }).where(eq(s.propertyListings.id, v.subjectId));
  }
  await audit(db, { actorId: actor.id, action: `verification.${decision}`, entityType: v.subjectType, entityId: v.subjectId, metadata: { level, notes } });
  await notify(db, { userId: v.submittedById, type: "verification", title: decision === "approved" ? "Verification approved" : "Verification not approved", body: decision === "approved" ? `Your ${v.subjectType} is now verified (level ${level}).` : `Reason: ${notes}`, link: "/dashboard/verification" });
}

/** Authorised download of a private document. Owner or verification staff only. */
export async function readDocument(db: Database, actor: Actor | null, id: string) {
  requireActor(actor);
  const [d] = await db.select().from(s.documents).where(eq(s.documents.id, id));
  if (!d) throw notFound("Document");
  const leaseParty = d.relatedType === "lease" && d.relatedId ? (await db.select().from(s.leases).where(eq(s.leases.id, d.relatedId)))[0] : null;
  const allowed = d.ownerId === actor.id || actor.permissions.includes("document.read.any") || (leaseParty && (leaseParty.landlordId === actor.id || leaseParty.tenantUserId === actor.id));
  if (!allowed) throw forbidden();
  if (d.ownerId !== actor.id) await audit(db, { actorId: actor.id, action: "document.read", entityType: "document", entityId: id });
  return { doc: d, data: await getFile("private", d.storageKey) };
}

export async function expireVerifications(db: Database) {
  const expired = await db.update(s.verificationRequests).set({ status: "expired" }).where(and(eq(s.verificationRequests.status, "approved"), sql`${s.verificationRequests.expiresAt} < now()`)).returning();
  for (const v of expired) {
    if (v.subjectType === "listing") await db.update(s.propertyListings).set({ verificationLevel: 2 }).where(and(eq(s.propertyListings.id, v.subjectId), sql`${s.propertyListings.verificationLevel} > 2`));
    await notify(db, { userId: v.submittedById, type: "verification", title: "Verification expired", body: "Please renew your verification to keep your badge.", link: "/dashboard/verification" });
  }
  return expired.length;
}
