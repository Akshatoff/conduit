"""CONDUIT backend entry point.

    uvicorn backend.main:app --host 127.0.0.1 --port 8000

Serves the REST API (/api), the WebSocket (/ws) and - if ``npm run build`` has been run - the
built React UI from ./dist so the whole system can run on a single port.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api import routes, ws
from backend.database.db import make_engine, make_session_factory
from backend.models.schemas import AppSettings
from backend.services.runtime import ConduitRuntime
from backend.services.settings_store import load_settings

try:  # optional convenience: read .env if python-dotenv is installed
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass


def create_app(settings: Optional[AppSettings] = None, db_url: Optional[str] = None,
               worker_factory: Optional[Callable] = None, persist_settings: bool = True) -> FastAPI:
    settings = settings or load_settings()
    engine = make_engine(db_url)
    sf = make_session_factory(engine)
    runtime = ConduitRuntime(settings, sf, worker_factory=worker_factory, persist_settings=persist_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await runtime.start()
        yield
        await runtime.shutdown()

    app = FastAPI(title="CONDUIT", version="1.0.0", lifespan=lifespan,
                  description="Intent-aware, contactless interaction and hardware-control platform (prototype).")
    app.state.runtime = runtime
    origins = os.getenv("CONDUIT_CORS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000").split(",")
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])
    app.include_router(routes.router)
    app.include_router(ws.router)

    # Source assets (e.g. the hospital X-ray images in public/assets/xray/) are mounted explicitly so
    # they are served even when the UI bundle in dist/ is older than the files on disk.
    assets = Path(os.getenv("CONDUIT_ASSETS", "public/assets"))
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    dist = Path(os.getenv("CONDUIT_DIST", "dist"))
    if dist.exists():
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="ui")
    return app


app = create_app()
