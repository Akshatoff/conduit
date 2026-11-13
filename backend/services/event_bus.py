"""In-process pub/sub used to fan structured events out to WebSocket clients."""
from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Any, Deque, Dict, Set

from backend.models.schemas import Envelope

HIGH_RATE = {"hand_landmarks", "trajectory_update"}


class EventBus:
    def __init__(self, history: int = 300) -> None:
        self._subs: Set[asyncio.Queue] = set()
        self.history: Deque[dict] = deque(maxlen=history)  # low-rate events only (for new clients / debugging)

    def subscribe(self, maxsize: int = 256) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._subs.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs.discard(q)

    @property
    def subscriber_count(self) -> int:
        return len(self._subs)

    def publish(self, type_: str, data: Dict[str, Any]) -> dict:
        env = Envelope(type=type_, timestamp=time.time(), data=data).model_dump()
        if type_ not in HIGH_RATE:
            self.history.append(env)
        for q in list(self._subs):
            if q.full():
                try:
                    q.get_nowait()  # slow consumer: drop oldest rather than block the pipeline
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(env)
        return env
