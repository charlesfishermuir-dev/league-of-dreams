"""Manage who can use the commissioner tools.

Usage:
  .venv/bin/python scripts/admins.py list
  .venv/bin/python scripts/admins.py add someone@example.com
  .venv/bin/python scripts/admins.py remove someone@example.com

Adding someone also creates their login (they sign in with an emailed link;
there's no password). Removing them takes away commissioner rights at once.
"""
import sys

import requests

from common import db_connect, setting


def create_login(email: str) -> None:
    url, key = setting("NEXT_PUBLIC_SUPABASE_URL"), setting("SUPABASE_SECRET_KEY")
    r = requests.post(f"{url}/auth/v1/admin/users", timeout=30,
                      headers={"apikey": key, "Authorization": f"Bearer {key}"},
                      json={"email": email, "email_confirm": True})
    if not r.ok and "already" not in r.text:
        sys.exit(f"Couldn't create a login for {email}: {r.text[:200]}")


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("list", "add", "remove") or (sys.argv[1] != "list" and len(sys.argv) != 3):
        sys.exit(__doc__)
    action = sys.argv[1]
    with db_connect() as conn:
        if action == "add":
            email = sys.argv[2].strip().lower()
            create_login(email)
            conn.execute("insert into admins (email) values (%s) on conflict do nothing", (email,))
            print(f"{email} is now a commissioner.")
        elif action == "remove":
            email = sys.argv[2].strip().lower()
            n = conn.execute("delete from admins where email = %s", (email,)).rowcount
            print(f"{email} removed." if n else f"{email} wasn't a commissioner.")
        emails = [r[0] for r in conn.execute("select email from admins order by email")]
        print("Commissioners:", ", ".join(emails) or "(none)")


if __name__ == "__main__":
    main()
