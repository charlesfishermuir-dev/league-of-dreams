"""Import league history (2007 onward) from the Google Sheet into the database.

Usage:
  .venv/bin/python scripts/import_history.py            # check the sheet, then import
  .venv/bin/python scripts/import_history.py --check    # only check, change nothing

Reads the sheet's public CSV export (link sharing must stay on), places every
team-season by manager + year using data/franchises.json, prints a report of
anything inconsistent, and replaces all sheet-sourced rows in the database.
Rows that came from Fantrax are never touched. Safe to re-run any time.
"""
import argparse
import csv
import io
import json
import re
import sys
from collections import Counter, defaultdict

import psycopg
import requests
from psycopg.types.json import Jsonb

from common import ROOT, db_url

SHEET_ID = "1rdgP-sAPzYIz41buy1cPH8EASMLzChwXeqG_2WKMgvo"
TABS = {"seasons": 29603902, "playoffs": 1530207872, "champions": 1164838397}

# Column order of the category totals in the Seasons tab (cols K..V).
SEASON_STAT_COLS = ["R", "HR", "RBI", "SB", "AVG", "OPS", "K", "W", "L", "SV", "ERA", "WHIP"]
HITTING = ["R", "HR", "RBI", "SB", "AVG", "OPS"]
PITCHING = ["K", "W", "L", "SV", "ERA", "WHIP"]

SEASON_NOTES = {
    2020: "COVID-shortened 60-game season. Records are on a different scale from other years.",
}
FINISH = {"1st": "champion", "2nd": "runner_up", "3rd": "third", "4th": "fourth"}


class Report:
    def __init__(self):
        self.problems: list[str] = []
        self.notes: list[str] = []

    def problem(self, msg: str):
        self.problems.append(msg)

    def note(self, msg: str):
        self.notes.append(msg)


def fetch_tab(gid: int) -> list[list[str]]:
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    resp = requests.get(url, timeout=60)
    if resp.status_code != 200 or "text/csv" not in resp.headers.get("content-type", ""):
        sys.exit(f"Could not read the Google Sheet (HTTP {resp.status_code}). Is link sharing still on?")
    return list(csv.reader(io.StringIO(resp.text)))


def num(text: str):
    """'1,099' -> 1099, '.2737' -> 0.2737, '--' or '' -> None."""
    text = (text or "").strip().replace(",", "")
    if text in ("", "--", "-"):
        return None
    try:
        return int(text)
    except ValueError:
        try:
            return float(text)
        except ValueError:
            return None


def roman(n: int) -> str:
    out = ""
    for value, letters in [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        while n >= value:
            out, n = out + letters, n - value
    return out


class Franchises:
    """Looks up the franchise for a (manager, year) using data/franchises.json."""

    def __init__(self):
        config = json.loads((ROOT / "data" / "franchises.json").read_text())
        self.list = config["franchises"]
        self.aliases = config.get("manager_aliases", {})

    def clean_manager(self, name: str) -> str:
        name = " ".join(name.split())
        return self.aliases.get(name, name)

    def lookup(self, manager: str, year: int) -> str | None:
        manager = self.clean_manager(manager)
        for f in self.list:
            for m in f["managers"]:
                if m["name"] == manager and m["from"] <= year <= m.get("to", 9999):
                    return f["slug"]
        return None

    def managers(self) -> list[str]:
        return sorted({m["name"] for f in self.list for m in f["managers"]})


def parse_seasons(rows, fr: Franchises, rep: Report):
    team_seasons = []
    for r in rows:
        if not (r and re.fullmatch(r"\d{4}", r[0].strip()) and r[1].strip().isdigit()):
            continue
        year = int(r[0])
        manager = fr.clean_manager(r[8])
        slug = fr.lookup(manager, year)
        if not slug:
            rep.problem(f"Seasons {year}: no franchise for manager '{manager}' ({r[2].strip()}). Add them to data/franchises.json.")
            continue
        stats = {cat: num(r[10 + i]) for i, cat in enumerate(SEASON_STAT_COLS)}
        finish_text = r[7].strip()
        team_seasons.append({
            "year": year, "slug": slug, "manager": manager, "team_name": " ".join(r[2].split()),
            "place": int(r[1]), "wins": num(r[3]), "losses": num(r[4]), "ties": num(r[5]),
            "sheet_pct": num(r[6]), "finish_text": finish_text,
            "finish": FINISH.get(finish_text), "stats": {k: v for k, v in stats.items() if v is not None},
        })
        if finish_text and finish_text not in FINISH:
            rep.problem(f"Seasons {year} {r[2].strip()}: unrecognised Finish '{finish_text}'.")

    by_year = defaultdict(list)
    for ts in team_seasons:
        by_year[ts["year"]].append(ts)
    for year, teams in sorted(by_year.items()):
        places = sorted(t["place"] for t in teams)
        if places != list(range(1, len(teams) + 1)):
            rep.problem(f"Seasons {year}: places are {places}, expected 1..{len(teams)}.")
        if len(teams) != 12:
            rep.note(f"Seasons {year}: {len(teams)} teams.")
        if len({t['slug'] for t in teams}) != len(teams):
            rep.problem(f"Seasons {year}: a franchise appears twice.")
        w, l, t = (sum(x[k] for x in teams) for k in ("wins", "losses", "ties"))
        if w != l:
            rep.problem(f"Seasons {year}: total wins ({w}) ≠ total losses ({l}). A record is probably mistyped.")
        for x in teams:
            games = x["wins"] + x["losses"] + x["ties"]
            pct = (x["wins"] + 0.5 * x["ties"]) / games if games else 0
            pct_no_ties = x["wins"] / (x["wins"] + x["losses"]) if x["wins"] + x["losses"] else 0
            if x["sheet_pct"] is not None and min(abs(pct - x["sheet_pct"]), abs(pct_no_ties - x["sheet_pct"])) > 0.0015:
                rep.problem(f"Seasons {year} {x['team_name']}: Win % {x['sheet_pct']} doesn't match record {x['wins']}-{x['losses']}-{x['ties']}.")
        finishes = Counter(x["finish_text"] for x in teams if x["finish_text"])
        if finishes.get("1st") != 1 or finishes.get("2nd") != 1:
            rep.problem(f"Seasons {year}: expected one 1st and one 2nd in Finish, found {dict(finishes)}.")
        if finishes.get("3rd") == 2:
            # No third-place game that year: both semifinal losers are listed as 3rd.
            for x in teams:
                if x["finish_text"] == "3rd":
                    x["finish"] = "semifinal"
    return team_seasons, by_year


def parse_playoffs(rows, fr: Franchises, rep: Report):
    """Returns playoff matchups and each team's seed, keyed by (year, slug)."""
    rounds = defaultdict(list)  # (year, stage) -> [team rows]
    col14 = "OPS"
    for r in rows:
        r = r + [""] * (26 - len(r))
        if r[0].strip() == "SEASON":
            col14 = r[14].strip() or "OPS"
            continue
        if not re.fullmatch(r"\d{4}", r[0].strip()):
            continue
        year, stage_text = int(r[0]), r[1].strip()
        if stage_text not in ("Semi", "Finals"):
            continue
        manager = fr.clean_manager(r[24])
        slug = fr.lookup(manager, year)
        if not slug:
            rep.problem(f"Playoffs {year} {stage_text}: no franchise for manager '{manager}' ({r[3].strip()}).")
            continue
        stats = {"R": num(r[9]), "HR": num(r[10]), "RBI": num(r[11]), "SB": num(r[12]), "AVG": num(r[13]),
                 col14: num(r[14]), "K": num(r[17]), "W": num(r[18]), "L": num(r[19]), "SV": num(r[20]),
                 "ERA": num(r[21]), "WHIP": num(r[22])}
        if r[15].strip() and col14 == "TB":
            stats["H"] = num(r[15])
        if r[23].strip():
            stats["BB"] = num(r[23])
        rounds[(year, "semifinal" if stage_text == "Semi" else "final")].append({
            "slug": slug, "team": r[3].strip(), "seed": num(r[2]), "result": r[4].strip(),
            "w": num(r[5]), "l": num(r[6]), "t": num(r[7]),
            "stats": {k: v for k, v in stats.items() if v is not None},
        })

    matchups, seeds = [], {}
    for (year, stage), teams in sorted(rounds.items()):
        if len(teams) % 2:
            rep.problem(f"Playoffs {year} {stage}: odd number of team rows ({len(teams)}).")
            continue
        for a, b in zip(teams[0::2], teams[1::2]):
            seeds[(year, a["slug"])] = a["seed"]
            seeds[(year, b["slug"])] = b["seed"]
            if (a["w"], a["l"], a["t"]) != (b["l"], b["w"], b["t"]):
                rep.problem(f"Playoffs {year} {stage}: {a['team']} {a['w']}-{a['l']}-{a['t']} vs {b['team']} "
                            f"{b['w']}-{b['l']}-{b['t']} don't mirror each other.")
            winner = a if a["w"] > a["l"] else b if b["w"] > b["l"] else None
            if winner is None:
                tied = "Win" in (a["result"], b["result"])
                rep.note(f"Playoffs {year} {stage}: {a['team']} vs {b['team']} tied "
                         f"{a['w']}-{a['l']}-{a['t']}{' (sheet marks a winner, presumably by tiebreaker)' if tied else ''}.")
            elif winner["result"] != "Win":
                rep.problem(f"Playoffs {year} {stage}: {winner['team']} won the categories but is marked '{winner['result']}'.")
            home, away = sorted((a, b), key=lambda x: x["seed"] or 99)
            matchups.append({
                "year": year, "stage": stage, "home": home["slug"], "away": away["slug"],
                "home_seed": home["seed"], "away_seed": away["seed"],
                "home_w": home["w"], "home_l": home["l"], "home_t": home["t"],
                "home_stats": home["stats"], "away_stats": away["stats"],
                "winner": (home if home["result"] == "Win" else away)["slug"],
            })
    return matchups, seeds


def cross_check(team_seasons, by_year, matchups, champions_rows, fr: Franchises, rep: Report):
    finish = {(t["year"], t["slug"]): t["finish"] for t in team_seasons}
    years_with_playoffs = sorted({m["year"] for m in matchups})
    for year in sorted(by_year):
        if year not in years_with_playoffs:
            rep.note(f"Playoffs {year}: no bracket in the Playoffs tab (Stage 2 will fill it from Fantrax).")
    for m in matchups:
        if m["stage"] == "final":
            loser = m["away"] if m["winner"] == m["home"] else m["home"]
            if finish.get((m["year"], m["winner"])) != "champion":
                rep.problem(f"{m['year']}: Playoffs final winner ({m['winner']}) isn't marked 1st in Seasons.")
            if finish.get((m["year"], loser)) != "runner_up":
                rep.problem(f"{m['year']}: Playoffs final loser ({loser}) isn't marked 2nd in Seasons.")
        for slug in (m["home"], m["away"]):
            if not finish.get((m["year"], slug)):
                rep.problem(f"{m['year']}: {slug} played in the playoffs but has no Finish in Seasons.")

    # Champions & Runner Ups tab: ring years per manager should match Seasons.
    rings = defaultdict(set)
    for t in team_seasons:
        if t["finish"] == "champion":
            rings[t["manager"]].add(t["year"])
    for r in champions_rows[1:]:
        if len(r) < 6 or not r[3].strip():
            continue
        manager = fr.clean_manager(r[3])
        listed = {int(y) for y in re.findall(r"\d{4}", r[5])}
        if listed != rings.get(manager, set()):
            rep.problem(f"Champions tab: {manager} rings listed as {sorted(listed)}, Seasons says {sorted(rings.get(manager, []))}.")


def write(team_seasons, by_year, matchups, seeds, fr: Franchises):
    with psycopg.connect(db_url()) as conn, conn.transaction():
        # Managers and franchises are upserted (other tables refer to them).
        for name in fr.managers():
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            conn.execute("insert into managers (name, slug) values (%s, %s) on conflict (name) do nothing", (name, slug))
        for f in fr.list:
            conn.execute(
                """insert into franchises (slug, name, active) values (%s, %s, %s)
                   on conflict (slug) do update set name = excluded.name, active = excluded.active""",
                (f["slug"], f["name"], f["active"]),
            )
        fid = dict(conn.execute("select slug, id from franchises").fetchall())
        mid = dict(conn.execute("select name, id from managers").fetchall())

        # Replace everything that came from the sheet; Fantrax rows stay.
        conn.execute("delete from seasons where source = 'sheet'")
        for year, teams in sorted(by_year.items()):
            has_ops = any("OPS" in t["stats"] for t in teams)
            cats = HITTING + PITCHING if has_ops else [c for c in HITTING + PITCHING if c != "OPS"]
            notes = SEASON_NOTES.get(year)
            if not has_ops:
                notes = ((notes + " ") if notes else "") + "12th category before OPS not recorded."
            conn.execute(
                "insert into seasons (year, league_name, num_teams, categories, notes, source) values (%s, %s, %s, %s, %s, 'sheet')",
                (year, f"League of Dreams {roman(year - 2006)}", len(teams), cats, notes),
            )
        for t in team_seasons:
            conn.execute(
                """insert into team_seasons (year, franchise_id, manager_id, manager_label, team_name, place,
                       wins, losses, ties, finish, playoff_seed, stats, source)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'sheet')""",
                (t["year"], fid[t["slug"]], mid.get(t["manager"]), t["manager"], t["team_name"], t["place"],
                 t["wins"], t["losses"], t["ties"], t["finish"], seeds.get((t["year"], t["slug"])), Jsonb(t["stats"])),
            )
        for m in matchups:
            conn.execute(
                """insert into matchups (year, stage, home_id, away_id, home_seed, away_seed,
                       home_w, home_l, home_t, home_stats, away_stats, winner_id, source)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'sheet')""",
                (m["year"], m["stage"], fid[m["home"]], fid[m["away"]], m["home_seed"], m["away_seed"],
                 m["home_w"], m["home_l"], m["home_t"], Jsonb(m["home_stats"]), Jsonb(m["away_stats"]),
                 fid[m["winner"]]),
            )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="only check the sheet; don't change the database")
    args = ap.parse_args()

    fr, rep = Franchises(), Report()
    print("Reading the Google Sheet ...")
    seasons_rows, playoff_rows, champ_rows = (fetch_tab(TABS[k]) for k in ("seasons", "playoffs", "champions"))
    team_seasons, by_year = parse_seasons(seasons_rows, fr, rep)
    matchups, seeds = parse_playoffs(playoff_rows, fr, rep)
    cross_check(team_seasons, by_year, matchups, champ_rows, fr, rep)

    years = sorted(by_year)
    print(f"Found {len(years)} seasons ({years[0]}–{years[-1]}), {len(team_seasons)} team-seasons, "
          f"{len(matchups)} playoff matchups.")
    for n in rep.notes:
        print(f"  note: {n}")
    for p in rep.problems:
        print(f"  PROBLEM: {p}")
    if rep.problems:
        print(f"{len(rep.problems)} problem(s) found. They're imported as-is; fix them in the sheet and re-run.")

    if args.check:
        print("Check only — database not changed.")
        return 0
    write(team_seasons, by_year, matchups, seeds, fr)
    print("Imported into the database.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
