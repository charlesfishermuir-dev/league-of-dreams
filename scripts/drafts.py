"""Draft history from the Google Sheet's year tabs (2020 on, the years with an 'Origin' column).

Each tab lists the 12 draft slots (the same order every round) and the 5 rounds of picks.
Slots 1-8 went to the non-playoff teams by lottery; 9-12 to the playoff teams by finish.
"""
import csv
import io
import json

import requests

from common import ROOT

SHEET_ID = "1rdgP-sAPzYIz41buy1cPH8EASMLzChwXeqG_2WKMgvo"
DRAFT_TABS = {2026: 550634619, 2025: 1816930487, 2024: 7069513, 2023: 765576927,
              2022: 1843960110, 2021: 1243963443, 2020: 329883913}
ROUNDS, SLOTS = 5, 12


def _tab(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    return list(csv.reader(io.StringIO(requests.get(url, timeout=60).text)))


def parse(conn, rep):
    """Returns {year: {"order": [slug x12], "picks": [(pick, round, slot, player, picker_slug)]}}."""
    cfg = json.loads((ROOT / "data" / "draft_abbreviations.json").read_text())
    abbr, aliases = cfg["abbreviations"], cfg["team_aliases"]
    names = {}  # team name (lowercase) -> slug, from every season's standings
    for name, slug in conn.execute("select t.team_name, f.slug from team_seasons t join franchises f on f.id = t.franchise_id"):
        names[" ".join(name.lower().split())] = slug
    for f_name, slug in conn.execute("select name, slug from franchises"):
        names.setdefault(" ".join(f_name.lower().split()), slug)
    names.update({k.lower(): v for k, v in aliases.items()})

    drafts = {}
    for year, gid in sorted(DRAFT_TABS.items()):
        rows = [r + [""] * 20 for r in _tab(gid)[1:1 + SLOTS]]
        order, picks = [], []
        for slot, r in enumerate(rows, start=1):
            code = r[0].strip()
            if code not in abbr:
                rep.problem(f"Draft {year} slot {slot}: unknown abbreviation '{code}'. Add it to data/draft_abbreviations.json.")
            order.append(abbr.get(code))
            for rnd in range(ROUNDS):
                num, player, team = (r[1 + 3 * rnd].strip(), r[2 + 3 * rnd].strip(), r[3 + 3 * rnd].strip())
                if not num.isdigit():
                    continue
                forfeited = not player or player.lower().startswith("forfeit")
                picker = None if forfeited else names.get(" ".join(team.lower().split()))
                if not forfeited and picker is None:
                    rep.problem(f"Draft {year} pick {num}: unknown team '{team}'. Add it to team_aliases in data/draft_abbreviations.json.")
                picks.append((int(num), rnd + 1, slot, None if forfeited else " ".join(player.split()), picker))
        drafts[year] = {"order": order, "picks": picks}
    return drafts


def write(conn, drafts, rep):
    fid = dict(conn.execute("select slug, id from franchises").fetchall())
    conn.execute("delete from drafts where source = 'sheet'")
    for year, d in drafts.items():
        based_on = year - 1
        prior = conn.execute("select franchise_id, place, finish from team_seasons where year = %s", (based_on,)).fetchall()
        lottery_teams = sorted((p for p in prior if not p[2]), key=lambda p: -p[1])  # worst record first
        seed = {f: i for i, (f, *_) in enumerate(lottery_teams, start=1)}
        conn.execute("insert into drafts (year, based_on, source) values (%s, %s, 'sheet')", (year, based_on))
        order_ids = [fid.get(s) for s in d["order"]]
        for slot, f in enumerate(order_ids, start=1):
            if f is None:
                continue
            how = "lottery" if slot <= 8 else "playoffs"
            if how == "lottery" and f not in seed:
                rep.note(f"Draft {year} slot {slot}: that team made the {based_on} playoffs, so it isn't marked as a lottery pick.")
                how = "playoffs"
            conn.execute("insert into draft_order (year, slot, franchise_id, how, seed) values (%s, %s, %s, %s, %s)",
                         (year, slot, f, how, seed.get(f) if how == "lottery" else None))
        with conn.cursor() as cur:
            cur.executemany(
                "insert into draft_picks (year, pick, round, slot, player, franchise_id, origin_franchise_id) values (%s, %s, %s, %s, %s, %s, %s)",
                [(year, pick, rnd, slot, player, fid.get(picker) if picker else None, order_ids[slot - 1])
                 for pick, rnd, slot, player, picker in d["picks"]])
