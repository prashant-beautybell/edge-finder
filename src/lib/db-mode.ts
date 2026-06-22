import { existsSync } from "fs";
import path from "path";
import type { SportId } from "@/lib/sports";

const RACING_SQLITE_PATH = path.join(process.cwd(), "prisma/dev.db");
const FOOTBALL_SQLITE_PATH = path.join(process.cwd(), "prisma/football.db");

export function getRacingSqlitePath(): string {
  return RACING_SQLITE_PATH;
}

export function getFootballSqlitePath(): string {
  return FOOTBALL_SQLITE_PATH;
}

export function usesLocalSqlite(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.USE_LOCAL_DB === "false") return false;
  if (process.env.USE_LOCAL_DB === "true") return true;
  return existsSync(RACING_SQLITE_PATH);
}

export function sqlitePathForSport(sport: SportId): string {
  return sport === "football" ? FOOTBALL_SQLITE_PATH : RACING_SQLITE_PATH;
}

/** @deprecated use getRacingSqlitePath */
export function getLocalSqlitePath(): string {
  return RACING_SQLITE_PATH;
}
