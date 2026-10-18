# League of Dreams

The website for the League of Dreams fantasy baseball league (est. 2007).

- **Website:** Next.js (in `src/`), hosted on Vercel
- **Database:** Supabase (Postgres). Table definitions are in `supabase/migrations/`
- **Data scripts:** Python (in `scripts/`). History (2007 on) comes from the Google Sheet; live data and every
  regular-season matchup since 2019 come from Fantrax

> Full setup steps (GitHub, Supabase, Vercel, scheduled Fantrax sync) will be added in Stage 4.

## Secrets

All passwords and keys live in `.env`, which git ignores. `.env.example` lists the names with no values.
**Never commit `.env` or paste its contents anywhere.**

## Everyday tasks

Run these in Terminal from the project folder (`cd ~/league-of-dreams`).

### Re-import history after fixing the Google Sheet

```sh
.venv/bin/python scripts/import_history.py --check   # just report problems
.venv/bin/python scripts/import_history.py           # report, then import
```

The import reads the sheet's **Seasons**, **Playoffs** and **Champions & Runner Ups** tabs.
The sheet's link sharing must stay on ("Anyone with the link can view").
Each team-season is matched to a franchise by **manager and year** using `data/franchises.json`.
If a new manager joins, or someone takes over a team, add them there.

The Leaderboards tab is **not** imported. The site calculates leaderboards from the season results.

**Corrections.** `data/corrections.json` lists fixes to the sheet's data, each with the reason: two mistyped records,
one misspelled team name, and category totals for 2019–2025 that differ from Fantrax (the official record for those
years). The import applies them every time, so the sheet itself doesn't have to change. Each fix only applies while
the sheet still has the old value. If you fix the sheet, the import says that correction can be deleted.

### Sync from Fantrax

```sh
.venv/bin/python scripts/sync_fantrax.py                  # current season: standings, matchups, rosters, transactions, trades
.venv/bin/python scripts/sync_fantrax.py --backfill       # also every past Fantrax season (run once, or after fixing data)
.venv/bin/python scripts/sync_fantrax.py --replay-week 12 # TEST: show the current season as if week 12 were live
```

Run the plain command afterwards to undo a replay. The sync needs `FANTRAX_COOKIE` (the `FX_RM=...` login cookie)
and `FANTRAX_LEAGUE_ID` in `.env`.

- **Fantrax 2018 is skipped.** That Fantrax league doesn't match the real 2018 results, so the sheet is the record.
- **If the cookie expires**, the sync stops with "Fantrax login cookie has expired" and the site shows a warning
  while still showing the last good data. Log in to fantrax.com, copy the new `FX_RM` cookie into `.env`
  (and, once deployed, the GitHub secret), and the next sync recovers.
- **If a team can't be matched** to a franchise (for example, two teams renamed in the same off-season),
  add `"<fantrax team id>": "<franchise slug>"` to `fantrax_team_overrides` in `data/franchises.json`.

### Apply database changes

```sh
.venv/bin/python scripts/db_migrate.py
```

### Run the website on your computer

```sh
npm run build && npm start      # then open http://localhost:3000
```
