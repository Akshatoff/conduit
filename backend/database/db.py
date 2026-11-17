"""SQLite engine / session factory (SQLAlchemy 2.x). No video or personal data is stored."""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None = None):
    url = url or os.getenv("CONDUIT_DB_URL", "sqlite:///data/conduit.db")
    if url.startswith("sqlite:///") and ":memory:" not in url:
        Path(url.replace("sqlite:///", "", 1)).parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
    if ":memory:" in url:
        from sqlalchemy.pool import StaticPool
        kwargs["poolclass"] = StaticPool
    return create_engine(url, **kwargs)


# Columns added after the first release. ``create_all`` does not alter existing tables, so an
# existing local SQLite database is upgraded in place (additive only; no data is dropped).
_ADDED_COLUMNS = {
    "test_sessions": {"workspace": "VARCHAR(40) DEFAULT 'hospital'"},
    "trials": {"workspace": "VARCHAR(40) DEFAULT 'hospital'"},
}


def _upgrade_sqlite(engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            if not existing:  # table did not exist before create_all
                continue
            for name, ddl in columns.items():
                if name not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def make_session_factory(engine):
    from backend.models import db_models  # noqa: F401  (register tables)
    Base.metadata.create_all(engine)
    _upgrade_sqlite(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)
