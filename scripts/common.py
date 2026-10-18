"""Shared helpers for the Python scripts: settings from .env and the database URL."""
import os
import pathlib
import sys

from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def setting(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"Missing {name}. Add it to .env (local) or the GitHub Actions secrets.")
    return value


def db_url() -> str:
    return setting("SUPABASE_DB_URL")


def db_connect():
    """Connect to the database, giving up quickly if the network is down or stalls."""
    import psycopg
    return psycopg.connect(db_url(), connect_timeout=15, keepalives=1, keepalives_idle=20,
                           keepalives_interval=5, keepalives_count=3)
