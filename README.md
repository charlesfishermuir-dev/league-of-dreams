# League of Dreams

The website for the League of Dreams fantasy baseball league (est. 2007).

- **Website:** Next.js (in `src/`), hosted on Vercel
- **Database:** Supabase (Postgres). Table definitions are in `supabase/migrations/`
- **Data scripts:** Python (in `scripts/`). History comes from the Google Sheet; live data will come from Fantrax

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

### Apply database changes

```sh
.venv/bin/python scripts/db_migrate.py
```

### Run the website on your computer

```sh
npm run build && npm start      # then open http://localhost:3000
```
