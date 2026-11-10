/**
 * Notification service: in-app notifications + an outbox for external channels
 * (email, SMS, WhatsApp, push). Channel providers are pluggable; the default
 * "console" providers log to the server output so development never sends real
 * messages. `processOutbox()` is run by the worker (scripts/worker.ts) or inline.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@propertyx/database";
import { notifications, notificationPreferences, notificationDeliveries, users, pushTokens } from "@propertyx/database";
import { publicAppUrl, type NotificationChannel, type NotificationType } from "@propertyx/shared";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  data?: Record<string, unknown>;
}

/** Defaults when a user hasn't customised preferences. */
export const DEFAULT_PREFERENCES: Record<NotificationChannel, boolean> = { in_app: true, email: true, sms: false, whatsapp: false, push: true };
const TYPE_DEFAULTS: Partial<Record<NotificationType, Partial<Record<NotificationChannel, boolean>>>> = {
  new_lead: { sms: true, whatsapp: true },
  visit_update: { sms: true },
  rent: { sms: true, whatsapp: true },
  system: { email: true },
  property_saved: { email: false, push: false },
};

export function defaultsFor(type: string): Record<NotificationChannel, boolean> {
  return { ...DEFAULT_PREFERENCES, ...(TYPE_DEFAULTS[type as NotificationType] ?? {}) };
}

export async function getPreferences(db: Database, userId: string) {
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  const byType = new Map(rows.map((r) => [r.type, r]));
  return (type: string): Record<NotificationChannel, boolean> => {
    const r = byType.get(type);
    if (!r) return defaultsFor(type);
    return { in_app: r.inApp, email: r.email, sms: r.sms, whatsapp: r.whatsapp, push: r.push };
  };
}

export async function notify(db: Database, input: NotifyInput) {
  const prefs = (await getPreferences(db, input.userId))(input.type);
  const [user] = await db.select({ email: users.email, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt, status: users.status, isSeed: users.isSeed }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user || user.status !== "active") return null;
  let notificationId: string | null = null;
  if (prefs.in_app) {
    const [n] = await db.insert(notifications).values({ userId: input.userId, type: input.type, title: input.title, body: input.body, link: input.link, data: input.data ?? {} }).returning({ id: notifications.id });
    notificationId = n.id;
  }
  const appUrl = publicAppUrl();
  const text = `${input.title}\n${input.body}${input.link ? `\n${appUrl}${input.link}` : ""}`;
  const outbox: (typeof notificationDeliveries.$inferInsert)[] = [];
  // demo accounts get in-app notifications only: their emails and phone numbers are made up and may belong to real people
  if (user.isSeed) return notificationId;
  if (prefs.email && user.email) outbox.push({ notificationId, userId: input.userId, channel: "email", to: user.email, subject: input.title, body: text });
  // SMS / WhatsApp only to verified numbers
  if (prefs.sms && user.phone && user.phoneVerifiedAt) outbox.push({ notificationId, userId: input.userId, channel: "sms", to: user.phone, body: text.slice(0, 300) });
  if (prefs.whatsapp && user.phone && user.phoneVerifiedAt) outbox.push({ notificationId, userId: input.userId, channel: "whatsapp", to: user.phone, body: text });
  if (prefs.push) {
    const tokens = await db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, input.userId));
    for (const t of tokens) outbox.push({ notificationId, userId: input.userId, channel: "push", to: t.token, subject: input.title, body: input.body });
  }
  if (outbox.length) await db.insert(notificationDeliveries).values(outbox);
  return notificationId;
}

export async function notifyMany(db: Database, inputs: NotifyInput[]) {
  for (const i of inputs) await notify(db, i);
}

/** Direct (non-user) message, e.g. OTP codes. */
export async function sendDirect(db: Database, channel: "sms" | "email" | "whatsapp", to: string, body: string, subject?: string) {
  await db.insert(notificationDeliveries).values({ channel, to, body, subject });
  await processOutbox(db, 20);
}

/* ---------------- channel providers ---------------- */

export interface ChannelProvider {
  name: string;
  send(msg: { to: string; subject?: string | null; body: string }): Promise<void>;
}

const consoleProvider = (channel: string): ChannelProvider => ({
  name: "console",
  async send(m) {
    console.log(`[notify:${channel}] → ${m.to}${m.subject ? ` | ${m.subject}` : ""}\n${m.body}\n`);
  },
});

/** Resend-compatible HTTP email API (EMAIL_PROVIDER=resend, RESEND_API_KEY, EMAIL_FROM) */
const resendProvider: ChannelProvider = {
  name: "resend",
  async send(m) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Bismillah <no-reply@bismillah.pk>", to: [m.to], subject: m.subject ?? "Bismillah", text: m.body }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}`);
  },
};

/** Twilio SMS (SMS_PROVIDER=twilio, TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM) */
const twilioProvider: ChannelProvider = {
  name: "twilio",
  async send(m) {
    const sid = process.env.TWILIO_SID!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_TOKEN}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: m.to, From: process.env.TWILIO_FROM!, Body: m.body }),
    });
    if (!res.ok) throw new Error(`twilio ${res.status}`);
  },
};

/** Pakistani Telco / Bulk SMS Gateway (SMS_PROVIDER=pk_sms, PK_SMS_ENDPOINT, PK_SMS_API_KEY, PK_SMS_MASK) */
const pkSmsProvider: ChannelProvider = {
  name: "pk_sms",
  async send(m) {
    const endpoint = process.env.PK_SMS_ENDPOINT || "https://api.bulksms.pk/send";
    const apiKey = process.env.PK_SMS_API_KEY || "";
    const mask = process.env.PK_SMS_MASK || "PropertyX";
    // standard Pakistani mobile format normalisation (923XXXXXXXXX)
    const phone = m.to.replace(/\D/g, "").replace(/^0/, "92");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        api_key: apiKey,
        to: phone,
        mask,
        message: m.body,
      }),
    });
    if (!res.ok) throw new Error(`pk_sms ${res.status}`);
  },
};

/** WhatsApp Cloud API (WHATSAPP_PROVIDER=meta, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID) */
const whatsappCloudProvider: ChannelProvider = {
  name: "meta",
  async send(m) {
    const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: m.to.replace("+", ""), type: "text", text: { body: m.body } }),
    });
    if (!res.ok) throw new Error(`whatsapp ${res.status}`);
  },
};

/** Twilio WhatsApp (WHATSAPP_PROVIDER=twilio, TWILIO_SID, TWILIO_TOKEN, TWILIO_WHATSAPP_FROM) */
const twilioWhatsappProvider: ChannelProvider = {
  name: "twilio_whatsapp",
  async send(m) {
    const sid = process.env.TWILIO_SID!;
    const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
    const to = m.to.startsWith("whatsapp:") ? m.to : `whatsapp:${m.to}`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_TOKEN}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: m.body }),
    });
    if (!res.ok) throw new Error(`twilio_whatsapp ${res.status}`);
  },
};

/** Expo push (PUSH_PROVIDER=expo) — suits React Native / Expo mobile apps. */
const expoPushProvider: ChannelProvider = {
  name: "expo",
  async send(m) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: m.to, title: m.subject ?? "PropertyX", body: m.body }),
    });
    if (!res.ok) throw new Error(`expo ${res.status}`);
  },
};

export function providerFor(channel: string): ChannelProvider {
  const pick = (envKey: string, map: Record<string, ChannelProvider>) => map[process.env[envKey] ?? "console"] ?? consoleProvider(channel);
  switch (channel) {
    case "email":
      return pick("EMAIL_PROVIDER", { resend: resendProvider });
    case "sms":
      return pick("SMS_PROVIDER", { twilio: twilioProvider, pk_sms: pkSmsProvider, telenor: pkSmsProvider, ptcl: pkSmsProvider });
    case "whatsapp":
      return pick("WHATSAPP_PROVIDER", { meta: whatsappCloudProvider, twilio: twilioWhatsappProvider });
    case "push":
      return pick("PUSH_PROVIDER", { expo: expoPushProvider });
    default:
      return consoleProvider(channel);
  }
}

export async function processOutbox(db: Database, limit = 50) {
  // never deliver to demo accounts (made-up contact details), including anything queued before this rule existed
  await db.execute(sql`
    update notification_deliveries d set status = 'failed', error = 'demo account — not delivered'
    from users u where u.id = d.user_id and u.is_seed and d.status in ('queued','retry')`);
  const batch = await db.execute<{ id: string; channel: string; to: string; subject: string | null; body: string; attempts: number }>(sql`
    update notification_deliveries set status = 'sending', attempts = attempts + 1
    where id in (select id from notification_deliveries where status in ('queued','retry') and attempts < 5 order by created_at limit ${limit} for update skip locked)
    returning id, channel, "to", subject, body, attempts`);
  let sent = 0;
  for (const d of batch) {
    const provider = providerFor(d.channel);
    try {
      await provider.send({ to: d.to, subject: d.subject, body: d.body });
      await db.update(notificationDeliveries).set({ status: "sent", sentAt: new Date(), provider: provider.name, error: null }).where(eq(notificationDeliveries.id, d.id));
      sent++;
    } catch (e) {
      await db.update(notificationDeliveries).set({ status: d.attempts >= 5 ? "failed" : "retry", provider: provider.name, error: (e as Error).message }).where(eq(notificationDeliveries.id, d.id));
    }
  }
  return { processed: batch.length, sent };
}

export async function markRead(db: Database, userId: string, ids?: string[]) {
  const where = ids?.length ? and(eq(notifications.userId, userId), inArray(notifications.id, ids)) : eq(notifications.userId, userId);
  await db.update(notifications).set({ readAt: new Date() }).where(and(where, sql`${notifications.readAt} is null`));
}

export async function unreadCount(db: Database, userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`));
  return r?.n ?? 0;
}
