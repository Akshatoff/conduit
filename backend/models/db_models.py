"""SQLAlchemy table definitions."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.db import Base


class DeviceRow(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(40))
    current_state: Mapped[str] = mapped_column(String(20), default="UNKNOWN")
    connection_status: Mapped[str] = mapped_column(String(20), default="disconnected")
    last_acknowledgement: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[float] = mapped_column(Float, default=0.0)


class CommandRow(Base):
    __tablename__ = "commands"
    command_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device: Mapped[str] = mapped_column(String(40), index=True)
    action: Mapped[str] = mapped_column(String(20))
    timestamp: Mapped[float] = mapped_column(Float, index=True)
    source: Mapped[str] = mapped_column(String(40))
    execution_status: Mapped[str] = mapped_column(String(20))
    acknowledgement: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    executed_on: Mapped[str] = mapped_column(String(20), default="simulation")
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class IntentEventRow(Base):
    __tablename__ = "intent_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[float] = mapped_column(Float, index=True)
    kind: Mapped[str] = mapped_column(String(40))
    intent: Mapped[str] = mapped_column(String(40))
    confidence: Mapped[float] = mapped_column(Float)
    target: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    accepted: Mapped[bool] = mapped_column(Boolean)
    reason: Mapped[str] = mapped_column(Text)
    reason_code: Mapped[str] = mapped_column(String(40))
    state: Mapped[str] = mapped_column(String(40))
    mode: Mapped[str] = mapped_column(String(20), default="conduit")


class TestSessionRow(Base):
    __tablename__ = "test_sessions"
    __test__ = False  # not a pytest class
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mode: Mapped[str] = mapped_column(String(20))
    workspace: Mapped[str] = mapped_column(String(40), default="hospital")
    note: Mapped[str] = mapped_column(Text, default="")
    start_time: Mapped[float] = mapped_column(Float)
    end_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    successes: Mapped[int] = mapped_column(Integer, default=0)
    unintended: Mapped[int] = mapped_column(Integer, default=0)
    metrics_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class TrialRow(Base):
    """One controlled trial inside a session (see docs/TEST_PROTOCOL.md)."""
    __tablename__ = "trials"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("test_sessions.id"), index=True)
    label: Mapped[str] = mapped_column(String(12))          # intended | unintended
    workspace: Mapped[str] = mapped_column(String(40), default="hospital")
    target: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    scenario: Mapped[str] = mapped_column(String(80), default="")
    started_at: Mapped[float] = mapped_column(Float)
    ended_at: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    executed: Mapped[bool] = mapped_column(Boolean, default=False)
    executed_device: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    executed_action: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    correct: Mapped[bool] = mapped_column(Boolean, default=False)
    ack_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    commands_sent: Mapped[int] = mapped_column(Integer, default=0)
    commands_acked: Mapped[int] = mapped_column(Integer, default=0)
    confirmation_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    rejections: Mapped[int] = mapped_column(Integer, default=0)
    reasons: Mapped[str] = mapped_column(Text, default="[]")
    intent_latency_sum_ms: Mapped[float] = mapped_column(Float, default=0.0)
    intent_latency_n: Mapped[int] = mapped_column(Integer, default=0)
    e2e_latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
