"""WebSocket endpoint: streams structured events to the UI and accepts a few validated commands."""
from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from backend.models.schemas import ClientMessage

router = APIRouter()


def _env(type_: str, data: dict) -> dict:
    return {"type": type_, "timestamp": time.time(), "data": data}


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    runtime = ws.app.state.runtime
    q = runtime.bus.subscribe()
    await ws.send_json(_env("snapshot", runtime.status()))

    async def sender():
        while True:
            await ws.send_json(await q.get())

    async def receiver():
        while True:
            raw = await ws.receive_text()
            try:
                msg = ClientMessage.model_validate(json.loads(raw))
            except (ValueError, ValidationError) as e:
                await ws.send_json(_env("system_error", {"where": "websocket", "message": "Malformed message ignored",
                                                         "detail": str(e)[:200]}))
                continue
            if msg.type == "ping":
                await ws.send_json(_env("pong", {}))
            elif msg.type == "snapshot":
                await ws.send_json(_env("snapshot", runtime.status()))
            elif msg.type == "activate":
                runtime.interaction_activate()
            elif msg.type == "deactivate":
                runtime.interaction_deactivate()
            elif msg.type == "cancel":
                runtime.interaction_cancel()

    tasks = [asyncio.create_task(sender()), asyncio.create_task(receiver())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except WebSocketDisconnect:
        pass
    finally:
        for t in tasks:
            t.cancel()
        runtime.bus.unsubscribe(q)
