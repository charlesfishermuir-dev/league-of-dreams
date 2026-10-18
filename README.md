# League of Dreams

The website for the League of Dreams fantasy baseball league (est. 2007): live scores, standings, schedule,
team pages with rosters, 20 years of history and records, news, and the league rules.

## How it fits together

```
 Google Sheet (2007–2025 history) ──import_history.py──┐
                                                        ├──► Supabase database ◄── website reads (Vercel)
 Fantrax (2019–now) ──sync_fantrax.py, every 5 min ─────┘          ▲
                      (GitHub Actions)                              └── commissioner edits (news, rules, awards, corrections)
```

| Piece | What it is | Where it lives | Cost |
|---|---|---|---|
| **Website** | Next.js app in `src/` | **Vercel** (rebuilds itself on every push to GitHub) | Free (Hobby plan) |
| **Database + login** | Postgres with row-level security; email sign-in links | **Supabase** project `league-of-dreams` | Free |
| **Fantrax sync** | `scripts/sync_fantrax.py`, run on a timer | **GitHub Actions** (`.github/workflows/sync.yml`) | Free (public repo) |
| **History import** | `scripts/import_history.py`, run by hand | Your computer | Free |

The website only ever reads the database; it never talks to Fantrax. If Fantrax is down or changes, the site keeps
showing the last good data with a warning, and "Updated … ago" times show how fresh everything is.

## Accounts and settings

| Account | Used for | Settings that matter |
|---|---|---|
| **GitHub** (`charlesfishermuir-dev`) | Code, scheduled sync | Repo → Settings → Secrets and variables → Actions: `FANTRAX_COOKIE`, `FANTRAX_LEAGUE_ID`, `SUPABASE_DB_URL` |
| **Supabase** (sign in with GitHub) | Database, commissioner login | Authentication → URL Configuration: **Site URL** = the live site; **Redirect URLs** include `https://<site>/auth/callback` and `http://localhost:3000/auth/callback`. Authentication → Emails → **Magic Link** template (see below). Authentication → Sign In / Providers: **new user sign-ups off** |
| **Vercel** (sign in with GitHub) | Hosting | Project → Settings → Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| **Fantrax** | Source of live data | Your login cookie (`FX_RM`) powers the sync |

**Magic Link email template** (Supabase → Authentication → Emails → Magic Link), so sign-in links work in any
browser, including a phone's mail app:

```html
<h2>Sign in to League of Dreams</h2>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Sign in as commissioner</a></p>
<p>This link works once and expires in an hour. If you didn't ask for it, ignore this email.</p>
```

## Secrets

All passwords and keys live in `.env` on your computer (git ignores it) and in GitHub/Vercel settings.
`.env.example` lists the names with no values. **Never commit `.env` or paste its contents anywhere.**

| Name | What it is | Needed by |
|---|---|---|
| `FANTRAX_COOKIE` | `FX_RM=…` cookie from a logged-in fantrax.com request | sync (your computer, GitHub) |
| `FANTRAX_LEAGUE_ID` | `9g1kc613mg6tvuzu` (changes each season, see below) | sync |
| `SUPABASE_DB_URL` | Database connection string (Session pooler) with the database password | scripts, GitHub |
| `SUPABASE_SECRET_KEY` | `sb_secret_…`, full access | `scripts/admins.py` only (your computer) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public, read-only by design | website (your computer, Vercel) |

## Everyday tasks

Run these in Terminal from the project folder (`cd ~/league-of-dreams`).

### Commissioner tools

Sign in at **/login** (or the "Commissioner" link in the footer). You'll get an emailed sign-in link; there's no
password. From the dashboard you can post news, edit the rules (every version is kept and can be restored), add
awards, and correct records (corrections survive every import and sync, and can be undone).

Add or remove co-commissioners:

```sh
.venv/bin/python scripts/admins.py list
.venv/bin/python scripts/admins.py add someone@example.com
.venv/bin/python scripts/admins.py remove someone@example.com
```

### When the Fantrax cookie expires

The site shows "⚠ Fantrax sync is failing", the admin dashboard says "login cookie has expired", and GitHub
emails you that the workflow failed. To fix:

1. Log in at fantrax.com in Chrome, open your league, press **⌥⌘I** → **Network**, reload, filter for `req`.
2. Click a `req?leagueId=…` row → **Request Headers** → `cookie:`. Find the part that starts `FX_RM=` and copy it
   up to (not including) the next `;`.
3. Put it in `.env` as `FANTRAX_COOKIE=FX_RM=…`, then update the GitHub secret:
   `gh secret set FANTRAX_COOKIE --body "$(grep ^FANTRAX_COOKIE= .env | cut -d= -f2-)"`
4. On GitHub: **Actions → Fantrax sync → Run workflow** to sync right away.

### New season

Fantrax gives each season a new league ID. When the new season's league exists on Fantrax:

1. Update `FANTRAX_LEAGUE_ID` in `.env` and on GitHub (`gh secret set FANTRAX_LEAGUE_ID`).
2. Run the sync once by hand. The finished season stays in the database as history.
3. If a team renamed and the sync can't match it, see "Team can't be matched" below.

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

### Sync from Fantrax by hand

```sh
.venv/bin/python scripts/sync_fantrax.py                  # current season: standings, matchups, rosters, transactions, trades
.venv/bin/python scripts/sync_fantrax.py --backfill       # also every past Fantrax season (run once, or after fixing data)
.venv/bin/python scripts/sync_fantrax.py --replay-week 12 # TEST: show the current season as if week 12 were live
```

Run the plain command afterwards to undo a replay.

- **Fantrax 2018 is skipped.** That Fantrax league doesn't match the real 2018 results, so the sheet is the record.
- **2020** was an all-play season; the site counts it as one normal season in all-time totals and leaves it out of
  single-season records. The explanation is on the History page.
- **Team can't be matched** to a franchise (e.g. two teams renamed in the same off-season): add
  `"<fantrax team id>": "<franchise slug>"` to `fantrax_team_overrides` in `data/franchises.json`.

### The scheduled sync stopped

GitHub pauses scheduled workflows in a public repo after **60 days with no commits**. If live scores stop updating
(the site shows "⚠ Live scores may be behind"), go to **Actions → Fantrax sync** on GitHub and click
**Enable workflow**. Any commit to the repo also resets the 60-day clock.

### Apply database changes

```sh
.venv/bin/python scripts/db_migrate.py
```

### Run the website on your computer

```sh
npm run build && npm start      # then open http://localhost:3000
```

## Setting it up from scratch

Only needed on a new computer or if the project is ever rebuilt.

1. Install Node.js (LTS) and Python 3.12+. Clone the repo.
2. `npm install` and `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and fill in the values (see **Secrets**).
4. `.venv/bin/python scripts/db_migrate.py` (creates the tables)
5. `.venv/bin/python scripts/import_history.py` then `.venv/bin/python scripts/sync_fantrax.py --backfill`
6. `.venv/bin/python scripts/admins.py add <your email>`
7. Connect the GitHub repo to Vercel, add the two `NEXT_PUBLIC_…` variables, and set the Supabase URL
   settings and email template above.
