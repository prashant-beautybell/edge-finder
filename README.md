# UK Racing Algorithm App

Local-first horse racing intelligence dashboard using SQLite — no Supabase required.

## Quick start

```bash
cd racing-app
npm install
npm run db:push          # create local database at prisma/dev.db
npm run db:import:all    # import all CSV years (2016–2026, ~5–10 min)
npm run dev              # open http://localhost:3000/dashboard
```

## Database

| Setting | Value |
|---------|-------|
| Engine | SQLite (local file) |
| Location | `prisma/dev.db` |
| Config | `DATABASE_URL="file:./prisma/dev.db"` in `.env` |

The database stays on your machine. Nothing is sent to the cloud.

## Data source

CSV exports from RacingFormBook:

```
/Users/prashanttripathi/Downloads/RacingFormBookDatabase/RacingFormBook_exported/
  2016.csv … 2026.csv
```

Override path with `HISTORICAL_DATA_DIR` in `.env`.

## Commands

```bash
npm run db:push              # sync schema to SQLite
npm run db:import:all        # full import (clears + reloads all years)
npm run import:historical -- --year 2024 --clear   # single year only
npm run dev                  # start dashboard
npm test                     # algorithm unit tests
```

## What gets imported

For each of ~1.25M runner rows across 2016–2026:

- Race and runner details (course, distance, OR, weight, SP, jockey)
- LTO (last time out) form lookup per horse
- Jockey strike rates per season (turf handicaps)
- 9-rule algorithm applied → `qualified` flag + P&L at £1,000 stake

## API

```
GET /api/stats?from=2021-01-01&to=2026-12-31
GET /api/stats?...&include=full   # monthly, distance, running P&L
GET /api/import/historical      # row counts
```

## Project structure

```
racing-app/
├── prisma/
│   ├── schema.prisma      # SQLite schema
│   └── dev.db             # local database (gitignored)
├── scripts/import-historical.ts
└── src/
    ├── app/dashboard/     # KPI dashboard
    ├── app/api/stats/     # stats API
    └── lib/algorithm.ts   # 9-rule engine
```
