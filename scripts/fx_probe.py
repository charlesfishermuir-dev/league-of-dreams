"""Probe the Fantrax endpoints with the cookie from .env. Never prints the cookie."""
import json, os, sys, subprocess, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
env = dict(l.split("=", 1) for l in (root / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
cookie, lid = env["FANTRAX_COOKIE"].strip(), env["FANTRAX_LEAGUE_ID"].strip()
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)

def call(method, **data):
    body = json.dumps({"msgs": [{"method": method, "data": {"leagueId": lid, **data}}]}).encode()
    # Cookie goes to curl on stdin so it never appears in the process list.
    r = subprocess.run(["curl", "-s", "-m", "30", "-X", "POST", f"https://www.fantrax.com/fxpa/req?leagueId={lid}",
                        "-H", "Content-Type: application/json", "-H", "@-", "--data-binary", body.decode()],
                       input=f"Cookie: {cookie}\n", capture_output=True, text=True, check=True)
    return json.loads(r.stdout)

for arg in sys.argv[2:]:
    # arg is "method" or "method:{json data}:label"
    m, _, rest = arg.partition(":")
    extra, _, label = rest.rpartition(":") if rest.count(":") else (rest, "", "")
    r = call(m, **(json.loads(extra) if extra else {}))
    m = label or m
    (out / f"{m}.json").write_text(json.dumps(r, indent=1))
    err = r.get("pageError", {}).get("code")
    resp = (r.get("responses") or [{}])[0]
    print(f"{m}: error={err} keys={list(resp.get('data', {}).keys())[:15]}")
