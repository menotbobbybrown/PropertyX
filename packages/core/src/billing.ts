import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "@propertyx/database";
import * as s from "@propertyx/database";
import { enabledGateways, getGateway, invoiceNumber, type CheckoutAction } from "@propertyx/payments";
import { notify } from "@propertyx/notifications";
import { audit } from "@propertyx/auth";
import { FEATURED_PRICE, formatPKRFull, COUNTRY, type PaymentPurpose } from "@propertyx/shared";
import { badRequest, forbidden, notFound, requireActor, requirePerm, type Actor } from "./errors";

export async function listPlans(db: Database) {
  return db.select().from(s.subscriptionPlans).where(eq(s.subscriptionPlans.isActive, true)).orderBy(s.subscriptionPlans.sortOrder);
}

export type ActivePlan = typeof s.subscriptionPlans.$inferSelect & { subscription: typeof s.subscriptions.$inferSelect | null };

/** Current plan for a user: active subscription → plan, otherwise Free. */
export async function getActivePlan(db: Database, userId: string): Promise<ActivePlan> {
  const [sub] = await db
    .select({ plan: s.subscriptionPlans, sub: s.subscriptions })
    .from(s.subscriptions)
    .innerJoin(s.subscriptionPlans, eq(s.subscriptionPlans.id, s.subscriptions.planId))
    .where(and(eq(s.subscriptions.userId, userId), inArray(s.subscriptions.status, ["active", "trialing"]), gt(s.subscriptions.currentPeriodEnd, new Date())))
    .orderBy(desc(s.subscriptionPlans.sortOrder))
    .limit(1);
  if (sub) return { ...sub.plan, subscription: sub.sub };
  // agency members inherit the agency owner's plan
  const [member] = await db
    .select({ ownerId: s.agencies.ownerId })
    .from(s.agencyMembers)
    .innerJoin(s.agencies, eq(s.agencies.id, s.agencyMembers.agencyId))
    .where(and(eq(s.agencyMembers.userId, userId), eq(s.agencyMembers.status, "active")))
    .limit(1);
  if (member?.ownerId && member.ownerId !== userId) {
    const parent: ActivePlan = await getActivePlan(db, member.ownerId);
    if (parent.key === "agency" || parent.key === "enterprise") return { ...parent, listingQuota: Math.max(25, Math.floor(parent.listingQuota / Math.max(1, parent.agentSeats))) };
  }
  const [free] = await db.select().from(s.subscriptionPlans).where(eq(s.subscriptionPlans.key, "free"));
  return { ...free, subscription: null };
}

export function hasCapability(plan: { capabilities: string[] }, cap: string) {
  return plan.capabilities.includes(cap);
}

export function gatewaysForCheckout() {
  return enabledGateways().map((g) => ({ key: g.key, name: g.name, description: g.description, methods: g.methods }));
}

interface CheckoutRequest {
  purpose: PaymentPurpose;
  referenceId: string;
  gateway: string;
  /** subscription: "monthly" | "yearly"; featured: number of days */
  option?: string;
  amount?: number;
}

/** Creates a pending payment with a server-computed price and returns the gateway action. */
export async function startCheckout(db: Database, actor: Actor | null, req: CheckoutRequest, appUrl: string) {
  requireActor(actor);
  const gateway = getGateway(req.gateway);
  if (!gateway) throw badRequest("This payment method is not available");
  let amount = 0;
  let description = "";
  let returnUrl = "/dashboard/billing";
  const metadata: Record<string, unknown> = { option: req.option };

  if (req.purpose === "subscription") {
    requirePerm(actor, "subscription.purchase");
    const [plan] = await db.select().from(s.subscriptionPlans).where(eq(s.subscriptionPlans.id, req.referenceId));
    if (!plan || !plan.isActive || plan.isContactSales || plan.priceMonthly === 0) throw badRequest("This plan can't be purchased online");
    const yearly = req.option === "yearly";
    amount = yearly ? plan.priceYearly : plan.priceMonthly;
    description = `${plan.name} plan — ${yearly ? "yearly" : "monthly"}`;
  } else if (req.purpose === "featured_listing") {
    const [l] = await db.select().from(s.propertyListings).where(eq(s.propertyListings.id, req.referenceId));
    if (!l) throw notFound("Listing");
    if (l.postedById !== actor.id) throw forbidden();
    if (l.status !== "active") throw badRequest("Only active listings can be featured");
    const days = Number(req.option ?? 7) as keyof typeof FEATURED_PRICE;
    if (!FEATURED_PRICE[days]) throw badRequest("Choose 7, 15 or 30 days");
    amount = FEATURED_PRICE[days];
    description = `Featured listing — ${days} days`;
    metadata.days = days;
    returnUrl = "/dashboard/listings";
  } else if (req.purpose === "advertising") {
    const [ad] = await db.select().from(s.advertisements).where(eq(s.advertisements.id, req.referenceId));
    if (!ad) throw notFound("Campaign");
    if (ad.advertiserId !== actor.id) throw forbidden();
    if (ad.paymentId) throw badRequest("This campaign is already paid");
    amount = ad.budget;
    description = `Advertising — ${ad.campaignName}`;
    returnUrl = "/dashboard/ads";
  } else if (req.purpose === "booking_fee" || req.purpose === "project_booking") {
    const [proj] = await db.select().from(s.projects).where(eq(s.projects.id, req.referenceId));
    if (!proj) throw notFound("Project");
    // booking token / fee in the site currency
    amount = COUNTRY.code === "ae" ? (req.purpose === "project_booking" ? 5_000 : 500) : req.purpose === "project_booking" ? 50_000 : 5_000;
    description = `${req.purpose === "project_booking" ? "Booking token" : "Booking fee"} — ${proj.name}`;
    returnUrl = `/project/${proj.slug}`;
  } else if (req.purpose === "token_deposit" || req.purpose === "escrow_deposit") {
    const [l] = await db.select().from(s.propertyListings).where(eq(s.propertyListings.id, req.referenceId));
    if (!l) throw notFound("Listing");
    if (l.status !== "active") throw badRequest("Listing is not available for deposit");
    amount = Number(req.amount ?? 50_000);
    description = `Token Deposit (Escrow) — ${l.title.slice(0, 60)}`;
    metadata.listingId = l.id;
    metadata.holdDays = 7;
    returnUrl = `/property/${l.slug}`;
  } else throw badRequest("Unknown payment purpose");
  if (amount <= 0) throw badRequest("Nothing to pay");

  const [payment] = await db
    .insert(s.payments)
    .values({ userId: actor.id, invoiceNumber: invoiceNumber(), purpose: req.purpose, referenceId: req.referenceId, description, amount, provider: gateway.key, metadata })
    .returning();
  const [user] = await db.select({ email: s.users.email, phone: s.users.phone }).from(s.users).where(eq(s.users.id, actor.id));
  const action: CheckoutAction = await gateway.createCheckout(
    { id: payment.id, invoiceNumber: payment.invoiceNumber, amount, description, customerEmail: user?.email, customerPhone: user?.phone },
    { appUrl, returnUrl: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}payment=${payment.invoiceNumber}` },
  );
  await audit(db, { actorId: actor.id, action: "payment.start", entityType: "payment", entityId: payment.id, metadata: { amount, purpose: req.purpose, gateway: gateway.key } });
  return { payment, action };
}

/** Called by gateway callbacks. Idempotent. */
export async function completePayment(db: Database, gatewayKey: string, params: Record<string, string>) {
  const gateway = getGateway(gatewayKey);
  if (!gateway) throw badRequest("Unknown gateway");
  const result = await gateway.verifyCallback(params);
  const [payment] = await db.select().from(s.payments).where(eq(s.payments.invoiceNumber, result.invoiceNumber));
  if (!payment) throw notFound("Payment");
  if (payment.provider !== gatewayKey) throw badRequest("Gateway mismatch");
  if (payment.status === "succeeded") return payment; // idempotent
  // never accept a payment for less than the invoice
  if (result.status === "succeeded" && result.amountPaid != null && Math.round(result.amountPaid) < payment.amount) {
    result.status = "failed";
    result.message = `Paid amount ${result.amountPaid} is less than the invoice ${payment.amount}`;
  }
  if (result.status !== "succeeded") {
    const [p] = await db.update(s.payments).set({ status: result.status === "cancelled" ? "cancelled" : "failed", failureReason: result.message ?? "Payment was not completed", providerRef: result.providerRef }).where(eq(s.payments.id, payment.id)).returning();
    return p;
  }
  const [paid] = await db.update(s.payments).set({ status: "succeeded", paidAt: new Date(), providerRef: result.providerRef }).where(and(eq(s.payments.id, payment.id), sql`${s.payments.status} <> 'succeeded'`)).returning();
  if (!paid) return payment;
  await fulfil(db, paid);
  return paid;
}

async function fulfil(db: Database, p: typeof s.payments.$inferSelect) {
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  if (p.purpose === "subscription") {
    const yearly = meta.option === "yearly";
    const [plan] = await db.select().from(s.subscriptionPlans).where(eq(s.subscriptionPlans.id, p.referenceId!));
    const now = new Date();
    const [current] = await db.select().from(s.subscriptions).where(and(eq(s.subscriptions.userId, p.userId), eq(s.subscriptions.status, "active")));
    const start = current && current.planId === plan.id && current.currentPeriodEnd > now ? current.currentPeriodEnd : now;
    const end = new Date(start);
    end.setMonth(end.getMonth() + (yearly ? 12 : 1));
    if (current && current.planId !== plan.id) await db.update(s.subscriptions).set({ status: "cancelled" }).where(eq(s.subscriptions.id, current.id));
    if (current && current.planId === plan.id) await db.update(s.subscriptions).set({ currentPeriodEnd: end, billingCycle: yearly ? "yearly" : "monthly", cancelAtPeriodEnd: false }).where(eq(s.subscriptions.id, current.id));
    else {
      const [agency] = await db.select({ id: s.agencies.id }).from(s.agencies).where(eq(s.agencies.ownerId, p.userId));
      await db.insert(s.subscriptions).values({ userId: p.userId, agencyId: agency?.id ?? null, planId: plan.id, status: "active", billingCycle: yearly ? "yearly" : "monthly", currentPeriodStart: now, currentPeriodEnd: end });
    }
  } else if (p.purpose === "featured_listing") {
    const days = Number(meta.days ?? 7);
    const [l] = await db.select().from(s.propertyListings).where(eq(s.propertyListings.id, p.referenceId!));
    const from = l.featuredUntil && l.featuredUntil > new Date() ? l.featuredUntil : new Date();
    await db.update(s.propertyListings).set({ featuredUntil: new Date(from.getTime() + days * 86400_000), isPremium: true }).where(eq(s.propertyListings.id, l.id));
  } else if (p.purpose === "advertising") {
    await db.update(s.advertisements).set({ paymentId: p.id, status: "pending" }).where(eq(s.advertisements.id, p.referenceId!));
  } else if (p.purpose === "project_booking" || p.purpose === "booking_fee") {
    const [proj] = await db.select().from(s.projects).where(eq(s.projects.id, p.referenceId!));
    const [dev] = await db.select({ ownerId: s.developers.ownerId, id: s.developers.id }).from(s.developers).where(eq(s.developers.id, proj.developerId));
    const [buyer] = await db.select().from(s.users).where(eq(s.users.id, p.userId));
    await db.insert(s.leads).values({ projectId: proj.id, developerId: dev.id, recipientId: dev.ownerId, userId: buyer.id, name: buyer.name, phone: buyer.phone ?? "", email: buyer.email, message: `Paid ${p.description} (invoice ${p.invoiceNumber}).`, source: "form", status: "qualified" });
    if (dev.ownerId) await notify(db, { userId: dev.ownerId, type: "payment", title: "Booking payment received", body: `${buyer.name} paid ${p.description}.`, link: "/dashboard/leads" });
  } else if (p.purpose === "token_deposit" || p.purpose === "escrow_deposit") {
    const listingId = (meta.listingId as string) || p.referenceId;
    if (listingId) {
      await db.update(s.propertyListings).set({ status: "paused" }).where(eq(s.propertyListings.id, listingId));
      await notify(db, {
        userId: p.userId,
        type: "payment",
        title: "Token Deposit Held in Escrow",
        body: `Your token deposit of PKR ${p.amount.toLocaleString()} is securely held in escrow. Listing is reserved for 7 days.`,
        link: "/account",
      });
    }
  }
  await db.update(s.payments).set({ fulfilledAt: new Date() }).where(eq(s.payments.id, p.id));
  await notify(db, { userId: p.userId, type: "payment", title: "Payment received", body: `${p.description} — ${formatPKRFull(p.amount)} (invoice ${p.invoiceNumber}).`, link: `/dashboard/billing` });
}

export async function getPaymentByInvoice(db: Database, invoice: string) {
  const [p] = await db.select().from(s.payments).where(eq(s.payments.invoiceNumber, invoice));
  return p ?? null;
}

export async function billingOverview(db: Database, actor: Actor) {
  const plan = await getActivePlan(db, actor.id);
  const payments = await db.select().from(s.payments).where(eq(s.payments.userId, actor.id)).orderBy(desc(s.payments.createdAt)).limit(50);
  const [{ used }] = await db.select({ used: sql<number>`count(*)::int` }).from(s.propertyListings).where(and(eq(s.propertyListings.postedById, actor.id), inArray(s.propertyListings.status, ["active", "pending_review"])));
  const [{ featured }] = await db.select({ featured: sql<number>`count(*)::int` }).from(s.propertyListings).where(and(eq(s.propertyListings.postedById, actor.id), gt(s.propertyListings.featuredUntil, new Date())));
  return { plan, payments, usage: { listings: used, featured } };
}

export async function cancelSubscription(db: Database, actor: Actor | null) {
  requireActor(actor);
  const [sub] = await db.select().from(s.subscriptions).where(and(eq(s.subscriptions.userId, actor.id), eq(s.subscriptions.status, "active")));
  if (!sub) throw badRequest("No active subscription");
  await db.update(s.subscriptions).set({ cancelAtPeriodEnd: true }).where(eq(s.subscriptions.id, sub.id));
  await audit(db, { actorId: actor.id, action: "subscription.cancel", entityType: "subscription", entityId: sub.id });
}

/** Use a monthly featured credit included in the plan (no payment). */
export async function featureWithCredit(db: Database, actor: Actor | null, listingId: string) {
  requireActor(actor);
  const plan = await getActivePlan(db, actor.id);
  const sub = plan.subscription;
  if (!sub || sub.featuredCreditsUsed >= plan.featuredQuota) throw badRequest("No featured credits left this period");
  const [l] = await db.select().from(s.propertyListings).where(eq(s.propertyListings.id, listingId));
  if (!l || l.postedById !== actor.id) throw forbidden();
  if (l.status !== "active") throw badRequest("Only active listings can be featured");
  const from = l.featuredUntil && l.featuredUntil > new Date() ? l.featuredUntil : new Date();
  await db.update(s.propertyListings).set({ featuredUntil: new Date(from.getTime() + 7 * 86400_000) }).where(eq(s.propertyListings.id, l.id));
  await db.update(s.subscriptions).set({ featuredCreditsUsed: sub.featuredCreditsUsed + 1 }).where(eq(s.subscriptions.id, sub.id));
}
