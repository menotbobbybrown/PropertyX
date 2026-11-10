import { NextResponse } from "next/server";
import postgres from "postgres";
import { publicAppUrl } from "@propertyx/shared";
import { connectionOptions } from "@propertyx/database";
import { storageDriver } from "@propertyx/core";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Health check & diagnostic probe.
 * Simple GET returns fast 200 for Caddy / Docker / load-balancers.
 * GET ?verbose=1 performs full database and service diagnostics.
 */
export async function GET(req: Request) {
  const url = process.env.DATABASE_URL ?? "";
  const { searchParams } = new URL(req.url);
  const isVerbose = searchParams.get("verbose") === "1" || searchParams.get("app") === "1";

  if (!isVerbose) {
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "PropertyX",
      storage: storageDriver(),
    });
  }

  const checks: Record<string, unknown> = {
    DATABASE_URL: url ? "set" : process.env.NODE_ENV === "production" ? "MISSING — set DATABASE_URL in environment" : "not set (local dev database in use)",
    databaseHost: url ? (url.match(/@([^:/?]+)/)?.[1] ?? "unparseable") : null,
    AUTH_SECRET: (process.env.AUTH_SECRET?.length ?? 0) >= 32 ? "set" : "missing/short",
    notificationProviders: {
      email: process.env.EMAIL_PROVIDER ?? "console",
      sms: process.env.SMS_PROVIDER ?? "console",
      whatsapp: process.env.WHATSAPP_PROVIDER ?? "console",
    },
    APP_URL: publicAppUrl() + (process.env.APP_URL ? "" : " (auto)"),
    storage: storageDriver(),
  };

  const dbUrl = url || (process.env.NODE_ENV !== "production" ? "postgres://propertyx:propertyx_dev@127.0.0.1:54329/propertyx" : "");
  if (dbUrl) {
    try {
      const { url: u, options } = connectionOptions(dbUrl);
      const sql = postgres(u, { ...options, max: 1, connect_timeout: 4, connection: { statement_timeout: 3000, application_name: "health-check" } });
      await sql`select 1`;
      checks.db = { ok: true };
      await sql.end({ timeout: 1 }).catch(() => {});
    } catch (e) {
      checks.db = { ok: false, error: (e as Error).message.slice(0, 150) };
    }
  }

  return NextResponse.json({ status: "ok", ...checks });
}
