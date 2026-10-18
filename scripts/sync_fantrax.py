"""Pull league data from Fantrax into the database.

Usage:
  .venv/bin/python scripts/sync_fantrax.py                  # current season: standings, matchups, rosters, transactions
  .venv/bin/python scripts/sync_fantrax.py --backfill       # also every past Fantrax season, and all transactions
  .venv/bin/python scripts/sync_fantrax.py --replay-week 12 # TEST: show the current season as if it were week 12

Each kind of data (standings, matchups, rosters, transactions) is saved in its
own database transaction. If Fantrax is down, the cookie has expired, or
Fantrax changes its format, that piece is skipped, the error is recorded in
sync_status (the site shows it), and whatever was saved before stays in place.
The script exits with an error code so a failed scheduled run shows up in red.
"""
import argparse
import re
import signal
import sys
from collections import defaultdict
from datetime import date, datetime
from zoneinfo import ZoneInfo

import psycopg
from psycopg.types.json import Jsonb

from common import db_connect, setting
from fantrax import Fantrax, FantraxError, FantraxFormatError, need, number, period_dates
from import_history import Franchises

# Fantrax's 2018 league doesn't match the real 2018 results (every record
# differs and one team is 0-239). The Google Sheet is the record for 2018.
SKIP_YEARS = {2018}
FANTRAX_TZ = ZoneInfo("America/Chicago")  # transaction times are shown in Central time
ROSTER_STATUS = {"1": "active", "2": "reserve", "3": "injured", "9": "minors"}


MATCHUP_SQL = """insert into matchups (year, period, stage, home_id, away_id, home_w, home_l, home_t,
        home_stats, away_stats, winner_id, source, fantrax_matchup_id, status, all_play)
    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'fantrax', %s, %s, %s)"""


class Sync:
    def __init__(self, conn, fx: Fantrax, fr: Franchises):
        self.conn, self.fx, self.fr = conn, fx, fr
        self.failed: list[str] = []
        self.fid = dict(conn.execute("select slug, id from franchises").fetchall())

    # ---------- bookkeeping ----------

    def run(self, dataset: str, fn, *args):
        """Run one piece of the sync in its own transaction and record how it went."""
        started = datetime.now().astimezone()
        try:
            with self.conn.transaction():
                summary = fn(*args)
            self._status(dataset, started, True, summary)
            print(f"  ✓ {dataset}: {summary}")
        except (FantraxError, psycopg.Error, ValueError, KeyError, Stalled) as e:
            self.failed.append(dataset)
            self._status(dataset, started, False, str(e)[:500])
            print(f"  ✗ {dataset}: {e}")

    def _status(self, dataset, started, ok, message):
        self.conn.execute(
            """insert into sync_status (dataset, last_attempt, last_success, ok, message)
               values (%(d)s, %(t)s, case when %(ok)s then %(t)s end, %(ok)s, %(m)s)
               on conflict (dataset) do update set last_attempt = excluded.last_attempt, ok = excluded.ok,
                   message = excluded.message,
                   last_success = coalesce(excluded.last_success, sync_status.last_success)""",
            {"d": dataset, "t": started, "ok": ok, "m": message},
        )
        self.conn.commit()

    # ---------- teams ----------

    def map_teams(self, year: int, league_id: str, team_info: dict, records: dict) -> dict[str, int]:
        """Fantrax team id -> franchise id for one season.

        Tries, in order: an override in franchises.json, the same W-L-T in the
        sheet that year, the same team name that year, the franchise's current
        name. A single leftover team is matched to the single leftover franchise.
        """
        overrides = self.fr.config.get("fantrax_team_overrides", {})
        sheet = self.conn.execute(
            "select franchise_id, team_name, wins, losses, ties from team_seasons where year = %s and source = 'sheet'", (year,)
        ).fetchall()
        by_record = defaultdict(list)
        for fid, _, w, l, t in sheet:
            by_record[(w, l, t)].append(fid)
        norm = lambda s: " ".join(s.lower().split())
        by_name = {norm(n): fid for fid, n, *_ in sheet}
        current = {norm(f["name"]): self.fid[f["slug"]] for f in self.fr.list}

        mapping: dict[str, int] = {}
        for team_id, info in team_info.items():
            name = norm(need(info, "name"))
            if team_id in overrides:
                mapping[team_id] = self.fid[overrides[team_id]]
            elif len(by_record.get(records.get(team_id), [])) == 1:
                mapping[team_id] = by_record[records[team_id]][0]
            elif name in by_name:
                mapping[team_id] = by_name[name]
            elif not sheet and name in current:
                mapping[team_id] = current[name]
        left_teams = [t for t in team_info if t not in mapping]
        expected = {fid for fid, *_ in sheet} or {self.fid[f["slug"]] for f in self.fr.list if f["active"]}
        left_franchises = expected - set(mapping.values())
        if len(left_teams) == 1 and len(left_franchises) == 1:
            mapping[left_teams[0]] = left_franchises.pop()
        elif left_teams:
            names = ", ".join(team_info[t]["name"] for t in left_teams)
            raise ValueError(f"{year}: can't match Fantrax team(s) {names} to a franchise. "
                             f"Add them to fantrax_team_overrides in data/franchises.json.")
        if len(set(mapping.values())) != len(mapping):
            raise ValueError(f"{year}: two Fantrax teams matched the same franchise.")

        for team_id, franchise_id in mapping.items():
            info = team_info[team_id]
            self.conn.execute(
                """insert into fantrax_teams (league_id, team_id, year, franchise_id, name, short_name, logo_url)
                   values (%s, %s, %s, %s, %s, %s, %s)
                   on conflict (league_id, team_id) do update set franchise_id = excluded.franchise_id,
                       name = excluded.name, short_name = excluded.short_name, logo_url = excluded.logo_url""",
                (league_id, team_id, year, franchise_id, info["name"], info.get("shortName"),
                 info.get("logoUrl512") or info.get("logoUrl256")),
            )
        return mapping

    # ---------- one season ----------

    def season(self, year: int, league_id: str, league_name: str, is_current: bool, replay_week: int | None = None):
        sched = self.fx.standings("SCHEDULE", league_id)
        reg = self.fx.standings("REGULAR_SEASON", league_id)
        tables = need(sched, "tableList")
        team_cell = lambda row: next(c for c in need(row, "fixedCells") if "teamId" in c)
        records = {}
        for row in need(reg, "tableList", 0, "rows"):
            w, l, t = (int(number(c) or 0) for c in need(row, "cells")[:3])
            records[team_cell(row)["teamId"]] = (w, l, t)
        mapping = self.map_teams(year, league_id, need(sched, "fantasyTeamInfo"), records)
        header = [c["shortName"] for c in need(tables[0], "header", "cells")]
        cats = header[4:]  # after W, L, T, Pts

        self.conn.execute(
            """insert into seasons (year, league_name, num_teams, categories, source, fantrax_league_id)
               values (%s, %s, %s, %s, 'fantrax', %s)
               on conflict (year) do update set fantrax_league_id = excluded.fantrax_league_id""",
            (year, league_name, len(mapping), cats, league_id),
        )
        if is_current:
            self.conn.execute("update seasons set is_current = (year = %s)", (year,))

        # Playoffs already in the sheet stay as they are.
        sheet_playoffs = self.conn.execute(
            "select 1 from matchups where year = %s and source = 'sheet' and stage <> 'regular' limit 1", (year,)
        ).fetchone() is not None
        playoff_tables = [t for t in tables if t["caption"].startswith("Playoffs")]
        playoff_tree, playoff_stats = None, {}
        if playoff_tables and not sheet_playoffs:
            # Fantrax's schedule shows playoff teams only as seeds ("Seed 4") or "To be Determined",
            # so the pairings come from the bracket. The bracket's scores are category *points*
            # (a tie counts half), so the real W-L-T and category totals come from the
            # "Scoring Period: Playoffs N" tables in the same view.
            playoffs_view = self.fx.standings("PLAYOFFS", league_id)
            playoff_tree = playoffs_view.get("playoffTree")
            for table in playoffs_view.get("tableList", []):
                if "Playoffs" in table.get("caption", ""):
                    hdr = [c["shortName"] for c in table["header"]["cells"]][4:]
                    playoff_stats[table["caption"].rsplit(" ", 1)[-1]] = {
                        team_cell(r)["teamId"]: {
                            "wlt": tuple(int(number(c) or 0) for c in r["cells"][:3]),
                            "stats": {k: v for k, c in zip(hdr, r["cells"][4:]) if (v := number(c)) is not None},
                        } for r in table["rows"]}

        today = date.today()
        self.conn.execute("delete from periods where year = %s", (year,))
        self.conn.execute("delete from matchups where year = %s and source = 'fantrax'", (year,))
        # Rows are collected and written in two batches: far fewer round trips to the database.
        period_rows, matchup_rows, current_period = [], [], None
        for period, table in enumerate(tables, start=1):
            caption = table["caption"]
            is_playoffs = caption.startswith("Playoffs")
            start, end = period_dates(caption + " " + (table.get("subCaption") or ""))
            if is_playoffs:
                rnd = playoff_tables.index(table) + 1
                label = "Championship" if rnd == len(playoff_tables) else f"Playoffs · Round {rnd}"
            else:
                label = f"Week {period}"
            period_rows.append((year, period, label, start, end, is_playoffs))
            if replay_week is not None:
                status = "final" if period < replay_week else "live" if period == replay_week else "upcoming"
            elif is_current and start and end:
                status = "final" if end < today else "live" if start <= today else "upcoming"
            else:
                status = "final"
            if status != "upcoming":
                current_period = period
            if is_playoffs:
                if not sheet_playoffs:
                    rnd = playoff_tables.index(table) + 1
                    matchup_rows += self._playoff_round(year, period, rnd, len(playoff_tables), status, playoff_tree,
                                                        playoff_stats.get(str(rnd), {}), mapping, len(cats))
                continue

            pairs = defaultdict(list)
            for row in need(table, "rows"):
                pairs[need(row, "matchupId")].append(row)
            all_play = len(table["rows"]) > len(mapping)
            for matchup_id, rows in pairs.items():
                if len(rows) != 2:
                    raise ValueError(f"{year} period {period}: matchup {matchup_id} has {len(rows)} teams")
                by_team = {team_cell(r)["teamId"]: r for r in rows}
                # Regular-season ids are "<away team>_<home team>"; playoff ids use seeds ("S#1_S#4").
                away_id, home_id = matchup_id.split("_") if set(matchup_id.split("_")) == set(by_team) else list(by_team)
                home, away = by_team[home_id], by_team[away_id]
                hw, hl, ht = (int(number(c) or 0) for c in home["cells"][:3])
                stats = lambda r: {cat: v for cat, c in zip(cats, r["cells"][4:]) if (v := number(c)) is not None}
                if status == "upcoming":
                    hw = hl = ht = 0
                stage = "regular"
                winner = None
                if status == "final":
                    winner = mapping[home_id] if hw > hl else mapping[away_id] if hl > hw else None
                matchup_rows.append((
                    year, period, stage, mapping[home_id], mapping[away_id], hw, hl, ht,
                    Jsonb(stats(home) if status != "upcoming" else {}), Jsonb(stats(away) if status != "upcoming" else {}),
                    winner, matchup_id, status, all_play))
        with self.conn.cursor() as cur:
            cur.executemany(
                "insert into periods (year, period, label, start_date, end_date, is_playoffs) values (%s, %s, %s, %s, %s, %s)",
                period_rows)
            cur.executemany(MATCHUP_SQL, matchup_rows)
        n_matchups = len(matchup_rows)
        if is_current:
            self.conn.execute("update seasons set current_period = %s where year = %s", (current_period or 1, year))

        summary = f"{year}: {len(tables)} weeks, {n_matchups} matchups"
        has_sheet_standings = self.conn.execute(
            "select 1 from team_seasons where year = %s and source = 'sheet' limit 1", (year,)).fetchone()
        if not has_sheet_standings:
            self._standings(year, reg, mapping, playoff_tree, replay_week, league_id, team_cell)
            summary += ", standings"
        return summary

    @staticmethod
    def _playoff_round(year, period, rnd, n_rounds, status, tree, stats, mapping, n_cats) -> list[tuple]:
        """Matchup rows for one playoff round, read from Fantrax's bracket."""
        rounds = (tree or {}).get("rounds", [])
        if rnd > len(rounds):
            return []
        stage = "final" if rnd == n_rounds else "semifinal"
        later = {t for r in rounds[rnd:] for m in r.get("playoffList", []) for t in (m.get("homeId"), m.get("awayId"))}
        out = []
        for m in rounds[rnd - 1].get("playoffList", []):
            home_id, away_id = m.get("homeId"), m.get("awayId")
            if home_id not in mapping or away_id not in mapping:
                continue  # not decided yet
            home, away = stats.get(home_id), stats.get(away_id)
            if home:
                hw, hl, ht = home["wlt"]
            else:
                # No round table: fall back to the bracket's points, which can't show ties.
                hw, hl = (int(float(m.get(k) or 0)) for k in ("homeScore", "awayScore"))
                ht = max(n_cats - hw - hl, 0)
            home_stats = home["stats"] if home else {}
            away_stats = away["stats"] if away else {}
            if status == "upcoming":  # e.g. replaying an earlier week: hide results that haven't "happened"
                hw = hl = ht = 0
                home_stats = away_stats = {}
            winner = None
            if status == "final":
                if stage == "final":
                    winner = tree.get("championId")
                else:
                    winner = home_id if home_id in later else away_id if away_id in later else None
            out.append((year, period, stage, mapping[home_id], mapping[away_id], hw, hl, ht,
                        Jsonb(home_stats), Jsonb(away_stats),
                        mapping.get(winner), f"{away_id}_{home_id}", status, False))
        return out

    def _standings(self, year, reg, mapping, playoff_tree, replay_week, league_id, team_cell):
        """Regular-season standings for a season that isn't in the sheet (the current one)."""
        rows = []
        if replay_week is None:
            for place, row in enumerate(need(reg, "tableList", 0, "rows"), start=1):
                w, l, t = (int(number(c) or 0) for c in row["cells"][:3])
                rows.append({"team": team_cell(row)["teamId"], "place": place, "w": w, "l": l, "t": t})
        else:
            # Rebuild the standings as they stood before the replayed week.
            totals = {fid: [0, 0, 0] for fid in mapping.values()}
            for hid, aid, hw, hl, ht in self.conn.execute(
                """select home_id, away_id, home_w, home_l, home_t from matchups
                   where year = %s and stage = 'regular' and status = 'final'""", (year,)):
                for fid, w, l in ((hid, hw, hl), (aid, hl, hw)):
                    totals[fid][0] += w; totals[fid][1] += l; totals[fid][2] += ht
            back = {v: k for k, v in mapping.items()}
            order = sorted(totals.items(), key=lambda kv: -(kv[1][0] + kv[1][2] / 2))
            rows = [{"team": back[fid], "place": i, "w": w, "l": l, "t": t} for i, (fid, (w, l, t)) in enumerate(order, 1)]

        finish, seeds = {}, {}
        if playoff_tree and replay_week is None:
            rounds = playoff_tree.get("rounds", [])
            playoff_teams = [t for m in (rounds[0]["playoffList"] if rounds else []) for t in (m["homeId"], m["awayId"])]
            for seed, r in enumerate(sorted((r for r in rows if r["team"] in playoff_teams), key=lambda r: r["place"]), 1):
                seeds[r["team"]] = seed
                finish[r["team"]] = "semifinal"
            if rounds:
                final = rounds[-1]["playoffList"][0]
                champ = playoff_tree.get("championId")
                for t in (final["homeId"], final["awayId"]):
                    finish[t] = "champion" if t == champ else "runner_up"

        stats = {}
        if replay_week is None:
            for table in need(self.fx.standings("SEASON_STATS", league_id), "tableList"):
                if table.get("caption", "").startswith("Standings - Stat Totals"):
                    hdr = [c["shortName"] for c in table["header"]["cells"]]
                    for row in table["rows"]:
                        stats[team_cell(row)["teamId"]] = {
                            k: v for k, c in zip(hdr, row["cells"]) if k not in ("Pts", "GP", "AB", "H", "IP") and (v := number(c)) is not None}

        slug_of = {v: k for k, v in self.fid.items()}
        self.conn.execute("delete from team_seasons where year = %s and source = 'fantrax'", (year,))
        team_names = dict(self.conn.execute("select team_id, name from fantrax_teams where league_id = %s", (league_id,)).fetchall())
        manager_ids = dict(self.conn.execute("select name, id from managers").fetchall())
        batch = []
        for r in rows:
            fid = mapping[r["team"]]
            manager = self.fr.manager_for(slug_of[fid], year) or "Unknown"
            batch.append((year, fid, manager_ids.get(manager), manager, team_names[r["team"]], r["place"], r["w"], r["l"], r["t"],
                          finish.get(r["team"]), seeds.get(r["team"]), Jsonb(stats.get(r["team"], {}))))
        with self.conn.cursor() as cur:
            cur.executemany(
                """insert into team_seasons (year, franchise_id, manager_id, manager_label, team_name, place, wins, losses, ties,
                       finish, playoff_seed, stats, source)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'fantrax')""", batch)

    # ---------- current season only ----------

    def trades(self, year: int, league_id: str):
        """Trades are listed separately from claims and drops. Draft picks get a made-up player id."""
        team_fid = dict(self.conn.execute("select team_id, franchise_id from fantrax_teams where league_id = %s", (league_id,)).fetchall())
        if not team_fid:
            raise ValueError("No Fantrax teams known yet; the matchups sync must succeed first.")
        added, page, when = 0, 1, None
        while True:
            data = self.fx.call("getTransactionDetailsHistory", view="TRADE", maxResultsPerPage="100", pageNumber=str(page))
            batch = []
            for row in need(data, "table", "rows"):
                cells = {c.get("key"): c for c in row.get("cells", [])}
                if "date" in cells:
                    when = datetime.strptime(cells["date"]["content"], "%a %b %d, %Y, %I:%M%p").replace(tzinfo=FANTRAX_TZ)
                from_id, to_id = cells.get("from", {}).get("teamId"), cells.get("to", {}).get("teamId")
                player = row.get("scorer") or {}
                if row.get("draftPickDisplayParts"):
                    pick = row["draftPickDisplayParts"]
                    strip = lambda t: re.sub(r"<[^>]+>", "", t or "").replace("Draft Pick", "").strip()
                    name = f"{strip(pick.get('year'))} {strip(pick.get('roundInfo'))} pick"  # '2030 Round 5 (SouthSide Hitmen) pick'
                    pid, pos, mlb = "pick:" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"), None, None
                elif player.get("scorerId"):
                    pid, name = player["scorerId"], player.get("name", "Unknown")
                    pos, mlb = player.get("posShortNames"), player.get("teamShortName")
                else:
                    raise FantraxFormatError(f"Trade row {row.get('txSetId')} has neither a player nor a draft pick")
                kind = "trade" if to_id else "drop"
                batch.append((need(row, "txSetId"), year, when, kind, team_fid.get(to_id) if to_id else team_fid.get(from_id),
                              team_fid.get(from_id) if to_id else None, pid, name, pos, mlb))
            with self.conn.cursor() as cur:
                cur.executemany(
                    """insert into transactions (fantrax_set_id, year, occurred_at, type, franchise_id, from_franchise_id,
                           player_id, player_name, player_positions, player_mlb_team)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) on conflict do nothing""", batch)
                added += max(cur.rowcount, 0)
            if page >= int(need(data, "paginatedResultSet", "totalNumPages")):
                break
            page += 1
        return f"{added} new trade rows"

    def rosters(self, year: int, league_id: str):
        positions = {k: v["shortName"] for k, v in need(self.fx.league_info(), "positionMap").items()}
        teams = self.conn.execute("select team_id, franchise_id from fantrax_teams where league_id = %s", (league_id,)).fetchall()
        if not teams:
            raise ValueError("No Fantrax teams known yet; the matchups sync must succeed first.")
        fetched = {}
        for team_id, fid in teams:  # fetch everything first, so a failure part-way changes nothing
            fetched[fid] = need(self.fx.roster(team_id), "tables")
        batch = []
        for fid, tables in fetched.items():
            for table in tables:
                for row in table.get("rows", []):
                    p = row.get("scorer")
                    if not p:
                        continue
                    status = ROSTER_STATUS.get(str(row.get("statusId")), "other")
                    slot = positions.get(row.get("posId"), "") if status == "active" else {"reserve": "BN", "injured": "IL", "minors": "MiLB"}.get(status, "")
                    batch.append((year, fid, need(p, "scorerId"), need(p, "name"), p.get("posShortNames"), slot, status,
                                  p.get("teamShortName"), p.get("headshotUrl")))
        self.conn.execute("delete from rosters where year = %s", (year,))
        with self.conn.cursor() as cur:
            cur.executemany(
                """insert into rosters (year, franchise_id, player_id, name, positions, slot, status, mlb_team, headshot_url)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s) on conflict do nothing""", batch)
        return f"{len(batch)} players on {len(fetched)} teams"

    def transactions(self, year: int, league_id: str, everything: bool):
        team_fid = dict(self.conn.execute("select team_id, franchise_id from fantrax_teams where league_id = %s", (league_id,)).fetchall())
        if not team_fid:
            raise ValueError("No Fantrax teams known yet; the matchups sync must succeed first.")
        added, page = 0, 1
        while True:
            data = self.fx.transactions(page)
            rows = need(data, "table", "rows")
            batch, group = [], {}
            for row in rows:
                cells = {c.get("key"): c for c in row.get("cells", [])}
                set_id = need(row, "txSetId")
                if "team" in cells or "date" in cells:  # first row of a group carries the team and date
                    group = {"set": set_id, "team": cells.get("team", {}).get("teamId"), "date": cells.get("date", {}).get("content")}
                elif group.get("set") != set_id:
                    group = {"set": set_id, "team": None, "date": None}
                player = row.get("scorer") or {}
                when = None
                if group["date"]:
                    when = datetime.strptime(group["date"], "%a %b %d, %Y, %I:%M%p").replace(tzinfo=FANTRAX_TZ)
                if not player.get("scorerId"):
                    raise FantraxFormatError(f"Transaction {set_id} has no player")
                batch.append((set_id, year, when, row.get("transactionCode", "").lower() or "other",
                              team_fid.get(group["team"]), player["scorerId"], player.get("name", "Unknown"),
                              player.get("posShortNames"), player.get("teamShortName")))
            with self.conn.cursor() as cur:
                cur.executemany(
                    """insert into transactions (fantrax_set_id, year, occurred_at, type, franchise_id, player_id, player_name,
                           player_positions, player_mlb_team)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                       on conflict (fantrax_set_id, player_id, type) do update set franchise_id = excluded.franchise_id
                       where transactions.franchise_id is null and excluded.franchise_id is not null""", batch)
                new_on_page = max(cur.rowcount, 0)
            added += new_on_page
            total_pages = int(need(data, "paginatedResultSet", "totalNumPages"))
            if page >= total_pages or (not everything and new_on_page == 0):
                break
            page += 1
        return f"{added} new (read {page} page{'s' if page > 1 else ''})"


class Stalled(Exception):
    pass


def _watchdog(signum, frame):
    raise Stalled("Sync took too long (network stall?) and was stopped; nothing half-written was kept.")


def main() -> int:
    signal.signal(signal.SIGALRM, _watchdog)
    signal.alarm(8 * 60)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--backfill", action="store_true", help="also import every past Fantrax season and all transactions")
    ap.add_argument("--replay-week", type=int, metavar="N", help="TEST: show the current season as if it were week N")
    args = ap.parse_args()

    fx = Fantrax(setting("FANTRAX_LEAGUE_ID"), setting("FANTRAX_COOKIE"))
    fr = Franchises()
    with db_connect() as conn:
        sync = Sync(conn, fx, fr)
        try:
            info = fx.league_info()
            history = need(fx.history(), "seasons")
        except FantraxError as e:
            for d in ("matchups", "rosters", "transactions", "trades"):
                sync._status(d, datetime.now().astimezone(), False, str(e)[:500])
            print(f"✗ Fantrax unavailable: {e}")
            return 1
        year = int(need(info, "fantasySettings", "season", "displayYear"))
        name = need(info, "fantasySettings", "leagueName")
        print(f"Fantrax: {name} ({year})")

        if args.backfill:
            for s in sorted(history, key=lambda s: s["year"]):
                if s["year"] in SKIP_YEARS or s["year"] >= year:
                    continue
                sync.run("history", sync.season, s["year"], s["leagueId"], s["leagueName"], False)
        sync.run("matchups", sync.season, year, fx.league_id, name, True, args.replay_week)
        if args.replay_week is None:
            sync.run("rosters", sync.rosters, year, fx.league_id)
            sync.run("transactions", sync.transactions, year, fx.league_id, args.backfill)
            sync.run("trades", sync.trades, year, fx.league_id)
        else:
            print(f"  (replay mode: showing week {args.replay_week} as live; rosters and transactions left alone)")
    return 1 if sync.failed else 0


if __name__ == "__main__":
    sys.exit(main())
