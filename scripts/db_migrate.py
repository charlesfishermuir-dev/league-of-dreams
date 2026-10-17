"""Apply any new SQL files in supabase/migrations/ to the database, in order.

Usage: .venv/bin/python scripts/db_migrate.py
Safe to re-run: each file is applied once and recorded in schema_migrations.
"""
import sys

import psycopg

from common import ROOT, db_url

MIGRATIONS = ROOT / "supabase" / "migrations"


def main() -> None:
    with psycopg.connect(db_url()) as conn:
        conn.execute(
            "create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())"
        )
        conn.execute("alter table schema_migrations enable row level security")
        done = {r[0] for r in conn.execute("select name from schema_migrations")}
        pending = [p for p in sorted(MIGRATIONS.glob("*.sql")) if p.name not in done]
        if not pending:
            print("Database is up to date.")
            return
        for path in pending:
            print(f"Applying {path.name} ...")
            with conn.transaction():
                conn.execute(path.read_text())
                conn.execute("insert into schema_migrations (name) values (%s)", (path.name,))
        print(f"Applied {len(pending)} migration(s).")


if __name__ == "__main__":
    sys.exit(main())
