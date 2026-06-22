import { PrismaClient as PostgresPrismaClient } from "@prisma/client";
import path from "path";
import { PrismaClient as RacingSqliteClient } from "@/generated/sqlite-client";
import { PrismaClient as FootballSqliteClient } from "@/generated/football-sqlite-client";
import { ensureDatabaseEnv, getRuntimeDatabaseUrl } from "./db-config";
import { usesLocalSqlite } from "./db-mode";
import type { SportId } from "./sports";

type RacingClient = PostgresPrismaClient | RacingSqliteClient;
type FootballClient = FootballSqliteClient;

const globalForPrisma = globalThis as unknown as {
  racingPrisma?: RacingClient;
  footballPrisma?: FootballClient;
  prismaMode?: "sqlite" | "postgres";
};

function sqliteDatasourceUrl(sport: "racing" | "football"): string {
  const file = sport === "football" ? "football.db" : "dev.db";
  return `file:${path.join(process.cwd(), "prisma", file)}`;
}

function createRacingClient(): RacingClient {
  if (usesLocalSqlite()) {
    const url = sqliteDatasourceUrl("racing");
    process.env.DATABASE_URL = url;
    return new RacingSqliteClient({ datasources: { db: { url } } });
  }

  const url = process.env.RACING_DATABASE_URL ?? getRuntimeDatabaseUrl();
  if (!url.includes("connection_limit=")) {
    console.warn("[db:racing] DATABASE_URL missing connection_limit");
  }
  ensureDatabaseEnv();
  process.env.DATABASE_URL = url;
  return new PostgresPrismaClient();
}

function createFootballClient(): FootballClient {
  if (usesLocalSqlite()) {
    const url = sqliteDatasourceUrl("football");
    process.env.FOOTBALL_DATABASE_URL = url;
    return new FootballSqliteClient({ datasources: { db: { url } } });
  }

  const url = process.env.FOOTBALL_DATABASE_URL ?? getRuntimeDatabaseUrl();
  if (!url) {
    throw new Error(
      "FOOTBALL_DATABASE_URL is not configured. Set it in .env.local for production football data."
    );
  }
  process.env.FOOTBALL_DATABASE_URL = url;
  return new FootballSqliteClient({ datasources: { db: { url } } });
}

function clientSupportsHistory(client: unknown): boolean {
  return Boolean(
    client &&
      typeof client === "object" &&
      "algorithmConfigHistory" in client &&
      (client as { algorithmConfigHistory?: unknown }).algorithmConfigHistory
  );
}

function resetPrismaClients(): void {
  void globalForPrisma.racingPrisma?.$disconnect();
  void globalForPrisma.footballPrisma?.$disconnect();
  globalForPrisma.racingPrisma = undefined;
  globalForPrisma.footballPrisma = undefined;
}

export function getRacingPrisma(): RacingClient {
  const mode = usesLocalSqlite() ? "sqlite" : "postgres";
  if (globalForPrisma.prismaMode && globalForPrisma.prismaMode !== mode) {
    resetPrismaClients();
  }

  if (!globalForPrisma.racingPrisma || !clientSupportsHistory(globalForPrisma.racingPrisma)) {
    if (globalForPrisma.racingPrisma) resetPrismaClients();
    globalForPrisma.racingPrisma = createRacingClient();
    globalForPrisma.prismaMode = mode;
  }
  return globalForPrisma.racingPrisma;
}

export function getFootballPrisma(): FootballClient {
  const mode = usesLocalSqlite() ? "sqlite" : "postgres";
  if (globalForPrisma.prismaMode && globalForPrisma.prismaMode !== mode) {
    resetPrismaClients();
  }

  if (!globalForPrisma.footballPrisma || !clientSupportsHistory(globalForPrisma.footballPrisma)) {
    if (globalForPrisma.footballPrisma) resetPrismaClients();
    globalForPrisma.footballPrisma = createFootballClient();
    globalForPrisma.prismaMode = mode;
  }
  return globalForPrisma.footballPrisma;
}

export function getPrismaForSport(sport: SportId): RacingClient | FootballClient {
  return sport === "football" ? getFootballPrisma() : getRacingPrisma();
}

/** Racing database (default app DB). */
export const prisma = getRacingPrisma();

/** Football database (separate SQLite file locally). */
export const footballPrisma = getFootballPrisma();
