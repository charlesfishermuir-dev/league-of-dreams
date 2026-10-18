"""A small client for Fantrax's internal API (the same endpoint the website and
the FantraxAPI library use). Fantrax has no official API, so every response is
checked before use: if Fantrax changes its format, we raise FantraxFormatError
instead of writing bad data.
"""
import json
import re
import time
from datetime import date, datetime

import requests

ENDPOINT = "https://www.fantrax.com/fxpa/req"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"


class FantraxError(Exception):
    """Fantrax is down, refused the request, or the login cookie expired."""


class FantraxFormatError(FantraxError):
    """Fantrax answered, but not in the shape we expect (they changed something)."""


def need(obj, *path):
    """obj[path[0]][path[1]]..., raising FantraxFormatError naming the missing piece."""
    for key in path:
        try:
            obj = obj[key]
        except (KeyError, IndexError, TypeError):
            raise FantraxFormatError(f"Fantrax response is missing '{key}' (looking for {'/'.join(map(str, path))})")
    return obj


class Fantrax:
    def __init__(self, league_id: str, cookie: str, retries: int = 3):
        self.league_id = league_id
        self.retries = retries
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Content-Type": "application/json", "Cookie": cookie})

    def call(self, method: str, league_id: str | None = None, **data) -> dict:
        league_id = league_id or self.league_id
        body = {"msgs": [{"method": method, "data": {"leagueId": league_id, **data}}]}
        last_error = None
        for attempt in range(self.retries):
            try:
                resp = self.session.post(ENDPOINT, params={"leagueId": league_id}, data=json.dumps(body), timeout=30)
                if resp.status_code >= 500:
                    raise FantraxError(f"Fantrax server error (HTTP {resp.status_code})")
                resp.raise_for_status()
                payload = resp.json()
            except (requests.RequestException, ValueError, FantraxError) as e:
                last_error = e
                time.sleep(2 * (attempt + 1))
                continue
            code = (payload.get("pageError") or {}).get("code")
            if code == "WARNING_NOT_LOGGED_IN":
                raise FantraxError("Fantrax login cookie has expired. Copy a fresh FX_RM cookie into FANTRAX_COOKIE.")
            if code:
                raise FantraxError(f"Fantrax refused {method}: {code}")
            return need(payload, "responses", 0, "data")
        raise FantraxError(f"Could not reach Fantrax for {method}: {last_error}")

    # ---- convenience wrappers ----
    def league_info(self):
        return self.call("getFantasyLeagueInfo")

    def history(self):
        return self.call("getLeagueHistory")

    def standings(self, view: str, league_id: str | None = None):
        return self.call("getStandings", league_id=league_id, view=view)

    def roster(self, team_id: str):
        return self.call("getTeamRosterInfo", teamId=team_id)

    def transactions(self, page: int, per_page: int = 100):
        return self.call("getTransactionDetailsHistory", maxResultsPerPage=str(per_page), pageNumber=str(page))


# ---------- parsing helpers ----------

def number(cell) -> float | None:
    """A stat cell -> number. Prefers the full-precision tooltip ('0.243678' over '.244')."""
    text = str(cell.get("toolTip") or cell.get("content") or "").replace(",", "").strip()
    if text in ("", "-", "--"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


_DATE = r"[A-Z][a-z]{2} ([A-Z][a-z]{2} \d{1,2}, \d{4})"


def period_dates(text: str) -> tuple[date | None, date | None]:
    """'(Wed Mar 25, 2026 - Sun Apr 5, 2026)' -> (2026-03-25, 2026-04-05)."""
    m = re.search(_DATE + r"\s*-\s*" + _DATE, text or "")
    if not m:
        return None, None
    parse = lambda s: datetime.strptime(s, "%b %d, %Y").date()
    return parse(m.group(1)), parse(m.group(2))
