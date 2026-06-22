/**
 * Supabase + Prisma connection URLs.
 *
 * Local dev: auto-uses prisma/dev.db when present (see src/lib/db.ts).
 * Vercel: session pooler on port 5432 with connection_limit=1.
 */

import { usesLocalSqlite } from "@/lib/db-mode";

function withPostgresProtocol(url: string): string {
  return url.replace(/^postgres:\/\//, "postgresql://");
}

function toPrismaUrl(url: string): string {
  return url.replace(/^postgresql:\/\//, "postgres://");
}

function buildDirectUrlFromParts(): string {
  const host = process.env.EDGE_FINDER_POSTGRES_HOST?.trim();
  const user = process.env.EDGE_FINDER_POSTGRES_USER?.trim() ?? "postgres";
  const password = process.env.EDGE_FINDER_POSTGRES_PASSWORD?.trim();
  const database = process.env.EDGE_FINDER_POSTGRES_DATABASE?.trim() ?? "postgres";
  if (!host || !password) return "";
  return `postgres://${user}:${password}@${host}:5432/${database}?sslmode=require`;
}

function normalizeSupabaseRuntimeUrl(url: string): string {
  if (!url || url.startsWith("file:")) return url;

  const parsed = new URL(withPostgresProtocol(url));
  const isPooler = parsed.hostname.includes("pooler.supabase.com");

  if (isPooler && parsed.port === "6543") {
    parsed.port = "5432";
    parsed.searchParams.delete("pgbouncer");
  }

  if (!parsed.searchParams.has("sslmode")) {
    parsed.searchParams.set("sslmode", "require");
  }

  // Single connection queues requests instead of timing out on the pooler.
  parsed.searchParams.set("connection_limit", "1");
  parsed.searchParams.set("pool_timeout", "120");

  return toPrismaUrl(parsed.toString());
}

/** Resolve the runtime Postgres URL. */
export function resolveDatabaseUrl(): string {
  const raw =
    process.env.DATABASE_URL ??
    process.env.EDGE_FINDER_POSTGRES_URL_NON_POOLING ??
    process.env.EDGE_FINDER_POSTGRES_PRISMA_URL ??
    process.env.EDGE_FINDER_POSTGRES_URL ??
    "";

  return normalizeSupabaseRuntimeUrl(raw);
}

/** Resolve the direct Postgres URL (migrations / db push). */
export function resolveDirectUrl(): string {
  const raw =
    process.env.DIRECT_URL ??
    (process.env.EDGE_FINDER_POSTGRES_HOST ? buildDirectUrlFromParts() : null) ??
    process.env.EDGE_FINDER_POSTGRES_URL_NON_POOLING ??
    process.env.EDGE_FINDER_POSTGRES_URL ??
    "";

  if (!raw) return resolveDatabaseUrl();
  return toPrismaUrl(withPostgresProtocol(raw));
}

export function ensureDatabaseEnv(): void {
  const runtimeUrl = resolveDatabaseUrl();
  if (runtimeUrl) process.env.DATABASE_URL = runtimeUrl;

  const directUrl = resolveDirectUrl();
  if (directUrl) process.env.DIRECT_URL = directUrl;
}

export function getRuntimeDatabaseUrl(): string {
  ensureDatabaseEnv();
  return process.env.DATABASE_URL ?? "";
}

export function getDatabaseLabel(): string {
  if (usesLocalSqlite()) return "Local SQLite";
  const url = getRuntimeDatabaseUrl();
  if (!url) return "Not configured";
  if (url.startsWith("file:")) return "Local SQLite";
  if (url.includes("supabase")) return "Supabase Postgres";
  return "PostgreSQL";
}

export function isDatabaseConfigured(): boolean {
  if (usesLocalSqlite()) return true;
  const url = getRuntimeDatabaseUrl();
  return (
    url.length > 0 &&
    !url.includes("YOUR_PROJECT") &&
    !url.includes("YOUR_PASSWORD")
  );
}

export function getDatabaseSetupError(): string | null {
  const url = getRuntimeDatabaseUrl();

  if (!url) {
    return "Database URL is not configured. Set DATABASE_URL or EDGE_FINDER_POSTGRES_HOST in .env.local.";
  }

  if (url.includes("YOUR_PROJECT") || url.includes("YOUR_PASSWORD")) {
    return "Database URL still contains placeholder values.";
  }

  if (url.startsWith("file:")) {
    if (process.env.VERCEL) {
      return "SQLite is not supported on Vercel. Use Supabase Postgres.";
    }
    return null;
  }

  return null;
}

export function isPoolerTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ECHECKOUTTIMEOUT") ||
    message.includes("EMAXCONNSESSION") ||
    message.includes("max clients reached") ||
    message.includes("connection from the pool") ||
    message.includes("Timed out fetching a new connection") ||
    message.includes("P2024") ||
    message.includes("Can't reach database server") ||
    message.includes("Server has closed the connection") ||
    message.includes("DbHandler exited") ||
    message.includes("statement timeout")
  );
}

export function getPoolerErrorHint(): string {
  if (usesLocalSqlite()) {
    return "Database query failed. Restart the dev server with npm run dev:clean.";
  }
  return (
    "Supabase connection limit reached. Local dev auto-uses prisma/dev.db when present. " +
    "Otherwise set DATABASE_URL to pooler port 5432 with connection_limit=1 and restart."
  );
}
