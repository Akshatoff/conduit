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


def make_session_factory(engine):
    from backend.models import db_models  # noqa: F401  (register tables)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)
