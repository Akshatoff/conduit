"""Thin persistence helpers for devices, commands and intent events."""
from __future__ import annotations

import json
import time
from typing import List, Optional

from sqlalchemy import select

from backend.models.db_models import CommandRow, DeviceRow, IntentEventRow


class Repository:
    def __init__(self, session_factory) -> None:
        self.sf = session_factory

    # ------------------------------------------------------------- devices
    def upsert_device(self, d: dict) -> None:
        with self.sf() as s:
            row = s.get(DeviceRow, d["id"]) or DeviceRow(id=d["id"], name=d["name"], type=d["type"])
            row.current_state = d.get("confirmed_state") or "UNKNOWN"
            row.connection_status = d.get("connection", "disconnected")
            row.last_acknowledgement = json.dumps(d.get("last_ack")) if d.get("last_ack") else row.last_acknowledgement
            row.updated_at = time.time()
            s.merge(row)
            s.commit()

    # ------------------------------------------------------------ commands
    def log_command(self, command_id: str, device: str, action: str, source: str, status: str,
                    executed_on: str, confidence: Optional[float]) -> None:
        with self.sf() as s:
            s.merge(CommandRow(command_id=command_id, device=device, action=action, timestamp=time.time(), source=source,
                               execution_status=status, executed_on=executed_on, confidence=confidence))
            s.commit()

    def update_command(self, command_id: str, status: str, ack: Optional[dict], latency_ms: Optional[float]) -> None:
        with self.sf() as s:
            row = s.get(CommandRow, command_id)
            if row:
                row.execution_status = status
                row.acknowledgement = json.dumps(ack) if ack else None
                row.latency_ms = latency_ms
                s.commit()

    def recent_commands(self, limit: int = 50) -> List[dict]:
        with self.sf() as s:
            rows = s.scalars(select(CommandRow).order_by(CommandRow.timestamp.desc()).limit(limit))
            return [{c.name: getattr(r, c.name) for c in CommandRow.__table__.columns} for r in rows]

    # -------------------------------------------------------- intent events
    def log_intent_event(self, ev: dict, mode: str) -> None:
        with self.sf() as s:
            s.add(IntentEventRow(timestamp=ev.get("wall_time", time.time()), kind=ev["kind"], intent=ev["intent"],
                                 confidence=float(ev["confidence"]), target=ev.get("target"), accepted=bool(ev["accepted"]),
                                 reason=ev["reason"], reason_code=ev["reason_code"], state=ev["state"], mode=mode))
            s.commit()

    def recent_intent_events(self, limit: int = 100) -> List[dict]:
        with self.sf() as s:
            rows = s.scalars(select(IntentEventRow).order_by(IntentEventRow.id.desc()).limit(limit))
            return [{c.name: getattr(r, c.name) for c in IntentEventRow.__table__.columns} for r in rows]
