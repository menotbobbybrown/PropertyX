import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const DEFAULT_DEV_URL = "postgres://propertyx:propertyx_dev@127.0.0.1:54329/propertyx";

declare global {
  // eslint-disable-next-line no-var
  var __propertyxDb: { sql: postgres.Sql; db: Database } | undefined;
}

/**
 * Connection options that work for a local PostgreSQL as well as hosted ones
 * (Supabase, Neon, RDS…):
 * - transaction-mode poolers (Supabase pooler on port 6543, PgBouncer, Neon "-pooler" hosts)
 *   don't support prepared statements. Override with DB_PREPARE=true|false.
 * - remote hosts get TLS unless the URL already says otherwise (sslmode=…)
 * - serverless (Vercel) keeps a tiny pool per function instance
 */
export function connectionOptions(rawUrl: string) {
  const url = new URL(rawUrl);
  // Supabase's pooler on 5432 is session mode (one server connection per client, 15 max on small plans),
  // which serverless instances exhaust within seconds; the same pooler on 6543 is transaction mode
  if (process.env.VERCEL && url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") url.port = "6543";
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".internal") || url.searchParams.get("sslmode") === "disable";
  const pooled = url.port === "6543" || url.searchParams.get("pgbouncer") === "true" || url.hostname.includes("-pooler.");
  const prepare = process.env.DB_PREPARE ? process.env.DB_PREPARE === "true" : !pooled;
  // postgres.js forwards unknown URL params to the server as settings; pgbouncer=… is Prisma-only
  url.searchParams.delete("pgbouncer");
  url.searchParams.delete("sslmode");
  const ssl = local ? undefined : ("require" as const);
  const max = Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10));
  // postgres.js pipelines extra queries onto busy connections; Supavisor in transaction mode can stall
  // on pipelined queries (seen as a backend stuck "waiting on Client"), so send one query per connection at a time
  const max_pipeline = pooled ? 0 : 100;
  return { url: url.toString(), options: { max, idle_timeout: 30, connect_timeout: 15, prepare, ssl, max_pipeline, onnotice: () => {} } };
}

function create(rawUrl: string) {
  const { url, options } = connectionOptions(rawUrl);
  const sql = postgres(url, options);
  return { sql, db: drizzle(sql, { schema, casing: "snake_case" }) };
}

function resolveUrl() {
  const url = process.env.DATABASE_URL;
  if (!url && process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is not set");
  return url ?? DEFAULT_DEV_URL;
}

/** Singleton (survives Next.js dev hot reloads). */
export function getDb(): Database {
  if (!globalThis.__propertyxDb) globalThis.__propertyxDb = create(resolveUrl());
  return globalThis.__propertyxDb.db;
}

export function getSql(): postgres.Sql {
  getDb();
  return globalThis.__propertyxDb!.sql;
}

export const db: Database = new Proxy({} as Database, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export function createDb(url: string) {
  return create(url);
}

export async function closeDb() {
  if (globalThis.__propertyxDb) {
    await globalThis.__propertyxDb.sql.end({ timeout: 5 });
    globalThis.__propertyxDb = undefined;
  }
}
