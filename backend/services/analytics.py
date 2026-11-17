"""Comparative analytics: metric definitions, pure calculations, session/trial bookkeeping.

NOTHING here is pre-filled or randomly generated. Every number is derived from trials that
an operator ran under the documented protocol (docs/TEST_PROTOCOL.md).

Definitions (per set of trials)
-------------------------------
attempts                    number of trials (each trial = one deliberate or accidental interaction attempt)
accepted                    trials in which >= 1 command was dispatched to a device
rejected                    trials in which no command was dispatched
intended / unintended       operator-declared label of the trial (ground truth)
successful_deliberate       intended trials whose dispatched command targeted the intended device AND reached
                            state CONFIRMED
accidental_rejection_rate   unintended trials with NO command dispatched / unintended trials
false_activation_rate       unintended trials with >= 1 command dispatched / unintended trials
deliberate_success_rate     successful_deliberate / intended trials
avg_intent_latency_ms       mean wall time of one Intent Engine update() call (processing cost per frame),
                            weighted by number of calls
avg_e2e_latency_ms          mean time from command issue (intent validated) to device state CONFIRMED,
                            over trials that produced a confirmed command
device_ack_rate             commands acknowledged by the device / commands sent
confirmation_request_rate   trials in which the system explicitly asked for confirmation / attempts

Every session and trial also carries the active operational environment (workspace), so results
from different modes can be compared without mixing them. Sessions are never pre-seeded.

A high rejection count is NOT evidence of accuracy by itself - read it together with
deliberate_success_rate (a system that rejects everything has a perfect accidental rejection
rate and a useless success rate).
"""
from __future__ import annotations

import csv
import io
import json
import time
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from backend.models.db_models import TestSessionRow, TrialRow

METRIC_DEFINITIONS = {
    "attempts": "Number of trials (one deliberate or accidental interaction attempt each).",
    "accepted": "Trials in which at least one command was dispatched to a device.",
    "rejected": "Trials in which no command was dispatched.",
    "successful_deliberate": "Intended trials whose command reached the intended device and was CONFIRMED.",
    "accidental_rejection_rate": "Unintended trials with no command dispatched / unintended trials.",
    "false_activation_rate": "Unintended trials with a command dispatched / unintended trials.",
    "deliberate_success_rate": "Successful deliberate trials / intended trials.",
    "avg_intent_latency_ms": "Mean duration of one Intent Engine update() call.",
    "avg_e2e_latency_ms": "Mean time from validated command to CONFIRMED device state.",
    "device_ack_rate": "Commands acknowledged by the device / commands sent.",
    "confirmation_request_rate": "Trials with an explicit confirmation request / attempts.",
    "confirmation_success_rate": "Trials with a confirmation request that ended in an executed command / trials with a confirmation request.",
    "avg_task_duration_s": "Mean trial duration from Start trial to End trial (operator-declared task completion time).",
}


def _ratio(n: float, d: float) -> Optional[float]:
    return None if d == 0 else n / d


def compute_metrics(trials: List[Dict[str, Any]]) -> Dict[str, Any]:
    intended = [t for t in trials if t["label"] == "intended"]
    unintended = [t for t in trials if t["label"] == "unintended"]
    accepted = [t for t in trials if t["executed"]]
    successful = [t for t in intended if t["executed"] and t["correct"] and t["ack_confirmed"]]
    false_act = [t for t in unintended if t["executed"]]
    rejected_unint = [t for t in unintended if not t["executed"]]
    lat_n = sum(t.get("intent_latency_n", 0) for t in trials)
    lat_sum = sum(t.get("intent_latency_sum_ms", 0.0) for t in trials)
    e2e = [t["e2e_latency_ms"] for t in trials if t.get("e2e_latency_ms") is not None]
    sent = sum(t.get("commands_sent", 0) for t in trials)
    acked = sum(t.get("commands_acked", 0) for t in trials)
    confirmed_trials = [t for t in trials if t.get("confirmation_requested")]
    confirmation_success = [t for t in confirmed_trials if t["executed"]]
    durations = [
        t["ended_at"] - t["started_at"]
        for t in trials
        if t.get("ended_at") is not None and t.get("started_at") is not None
    ]
    return {
        "attempts": len(trials),
        "intended_trials": len(intended),
        "unintended_trials": len(unintended),
        "accepted": len(accepted),
        "rejected": len(trials) - len(accepted),
        "successful_deliberate": len(successful),
        "false_activations": len(false_act),
        "accidental_rejected": len(rejected_unint),
        "accidental_rejection_rate": _ratio(len(rejected_unint), len(unintended)),
        "false_activation_rate": _ratio(len(false_act), len(unintended)),
        "deliberate_success_rate": _ratio(len(successful), len(intended)),
        "avg_intent_latency_ms": _ratio(lat_sum, lat_n),
        "avg_e2e_latency_ms": (sum(e2e) / len(e2e)) if e2e else None,
        "commands_sent": sent,
        "commands_acked": acked,
        "device_ack_rate": _ratio(acked, sent),
        "confirmation_requests": sum(1 for t in trials if t.get("confirmation_requested")),
        "confirmation_request_rate": _ratio(len(confirmed_trials), len(trials)),
        "confirmation_success_rate": _ratio(len(confirmation_success), len(confirmed_trials)),
        "avg_task_duration_s": (sum(durations) / len(durations)) if durations else None,
    }


def _trial_dict(r: TrialRow) -> Dict[str, Any]:
    return {c.name: getattr(r, c.name) for c in TrialRow.__table__.columns}


class AnalyticsService:
    def __init__(self, session_factory) -> None:
        self.sf = session_factory
        self.session_id: Optional[int] = None
        self.session_mode: Optional[str] = None
        self.session_workspace: Optional[str] = None
        self.trial: Optional[Dict[str, Any]] = None

    # ----------------------------------------------------------------- state
    @property
    def active(self) -> bool:
        return self.session_id is not None

    def status(self) -> dict:
        return {
            "session_active": self.active, "session_id": self.session_id, "mode": self.session_mode,
            "workspace": self.session_workspace,
            "trial_active": self.trial is not None,
            "trial": ({k: self.trial[k] for k in ("label", "target", "scenario", "started_at", "executed", "rejections",
                                                   "confirmation_requested", "commands_sent")} if self.trial else None),
        }

    # -------------------------------------------------------------- sessions
    def start_session(self, mode: str, note: str = "", workspace: str = "hospital") -> int:
        if mode not in ("baseline", "conduit"):
            raise ValueError("mode must be 'baseline' or 'conduit'")
        if self.active:
            raise RuntimeError("A test session is already running")
        with self.sf() as s:
            row = TestSessionRow(mode=mode, note=note, workspace=workspace, start_time=time.time())
            s.add(row)
            s.commit()
            self.session_id, self.session_mode, self.session_workspace = row.id, mode, workspace
        return self.session_id

    def stop_session(self) -> Optional[dict]:
        if not self.active:
            return None
        if self.trial:
            self.end_trial()
        with self.sf() as s:
            row = s.get(TestSessionRow, self.session_id)
            trials = [_trial_dict(t) for t in s.scalars(select(TrialRow).where(TrialRow.session_id == row.id))]
            m = compute_metrics(trials)
            row.end_time = time.time()
            row.attempts = m["attempts"]
            row.successes = m["successful_deliberate"]
            row.unintended = m["unintended_trials"]
            row.metrics_json = json.dumps(m)
            s.commit()
            out = self._session_dict(row, m)
        self.session_id = self.session_mode = self.session_workspace = None
        return out

    # ---------------------------------------------------------------- trials
    def start_trial(self, label: str, target: Optional[str] = None, scenario: str = "") -> None:
        if not self.active:
            raise RuntimeError("Start a test session first")
        if label not in ("intended", "unintended"):
            raise ValueError("label must be 'intended' or 'unintended'")
        if label == "intended" and not target:
            raise ValueError("An intended trial needs a target device")
        if self.trial:
            self.end_trial()
        self.trial = dict(session_id=self.session_id, label=label, target=target, scenario=scenario,
                          workspace=self.session_workspace or "hospital", started_at=time.time(),
                          executed=False, executed_device=None, executed_action=None, correct=False, ack_confirmed=False,
                          commands_sent=0, commands_acked=0, confirmation_requested=False, rejections=0, reasons=[],
                          intent_latency_sum_ms=0.0, intent_latency_n=0, e2e_latency_ms=None)

    def end_trial(self) -> Optional[dict]:
        if not self.trial:
            return None
        t, self.trial = self.trial, None
        t["ended_at"] = time.time()
        t["reasons"] = json.dumps(t["reasons"][-20:])
        with self.sf() as s:
            row = TrialRow(**t)
            s.add(row)
            s.commit()
            return _trial_dict(row)

    # ------------------------------------------------------------ recording
    def record_engine_latency(self, ms: float) -> None:
        if self.trial is not None:
            self.trial["intent_latency_sum_ms"] += ms
            self.trial["intent_latency_n"] += 1

    def record_intent_event(self, ev: dict) -> None:
        t = self.trial
        if t is None:
            return
        if ev["kind"] == "confirmation_required":
            t["confirmation_requested"] = True
        if ev["kind"] in ("rejected", "cancelled") or (ev["kind"] == "error"):
            t["rejections"] += 1
            t["reasons"].append(ev["reason_code"])

    def record_command(self, res: dict) -> None:
        """Called once per command with its final CommandResult (dict)."""
        t = self.trial
        if t is None or res["status"] == "REJECTED":
            if t is not None:
                t["rejections"] += 1
                t["reasons"].append("COMMAND_VALIDATION")
            return
        t["commands_sent"] += 1
        if res.get("acknowledged"):
            t["commands_acked"] += 1
        if not t["executed"]:
            t["executed"] = True
            t["executed_device"], t["executed_action"] = res["device"], res["action"]
        confirmed = res["status"] == "CONFIRMED"
        if confirmed:
            t["ack_confirmed"] = True
            if res.get("latency_ms") is not None:
                t["e2e_latency_ms"] = res["latency_ms"] if t["e2e_latency_ms"] is None else (t["e2e_latency_ms"] + res["latency_ms"]) / 2
        if t["label"] == "intended" and res["device"] == t["target"] and confirmed:
            t["correct"] = True

    # --------------------------------------------------------------- queries
    @staticmethod
    def _session_dict(row: TestSessionRow, metrics: Optional[dict] = None) -> dict:
        m = metrics if metrics is not None else (json.loads(row.metrics_json) if row.metrics_json else None)
        return {"id": row.id, "mode": row.mode, "workspace": getattr(row, "workspace", "hospital") or "hospital",
                "note": row.note, "start_time": row.start_time, "end_time": row.end_time,
                "attempts": row.attempts, "successes": row.successes, "unintended": row.unintended, "metrics": m}

    def summary(self) -> dict:
        with self.sf() as s:
            sessions = list(s.scalars(select(TestSessionRow).order_by(TestSessionRow.id.desc())))
            trials = [_trial_dict(t) for t in s.scalars(select(TrialRow))]
            by_session: Dict[int, list] = {}
            for t in trials:
                by_session.setdefault(t["session_id"], []).append(t)
            sess_out = []
            for r in sessions:
                m = compute_metrics(by_session.get(r.id, []))
                sess_out.append(self._session_dict(r, m))
            by_mode = {}
            for mode in ("baseline", "conduit"):
                ids = {r.id for r in sessions if r.mode == mode}
                mt = [t for t in trials if t["session_id"] in ids]
                by_mode[mode] = compute_metrics(mt)
            # Per-environment comparison: only environments that actually have sessions appear here.
            workspaces = []
            for r in sessions:
                w = getattr(r, "workspace", None) or "hospital"
                if w not in workspaces:
                    workspaces.append(w)
            by_workspace = {}
            for w in workspaces:
                ids = {r.id for r in sessions if (getattr(r, "workspace", None) or "hospital") == w}
                mt = [t for t in trials if t["session_id"] in ids]
                by_workspace[w] = compute_metrics(mt)
        return {"has_data": len(trials) > 0, "total_trials": len(trials), "sessions": sess_out, "by_mode": by_mode,
                "by_workspace": by_workspace, "status": self.status(), "definitions": METRIC_DEFINITIONS}

    def export_csv(self) -> str:
        with self.sf() as s:
            sessions = {r.id: r for r in s.scalars(select(TestSessionRow))}
            modes = {r.id: r.mode for r in sessions.values()}
            rows = list(s.scalars(select(TrialRow).order_by(TrialRow.id)))
        cols = ["session_id", "mode", "workspace", "trial_id", "label", "target", "scenario", "started_at", "ended_at",
                "executed", "executed_device", "executed_action", "correct", "ack_confirmed", "commands_sent",
                "commands_acked", "confirmation_requested", "rejections", "reasons", "intent_latency_ms_avg", "e2e_latency_ms"]
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(cols)
        for r in rows:
            avg = (r.intent_latency_sum_ms / r.intent_latency_n) if r.intent_latency_n else ""
            session = sessions.get(r.session_id)
            w.writerow([r.session_id, modes.get(r.session_id, ""), getattr(r, "workspace", None) or (getattr(session, "workspace", None) if session else "") or "", r.id, r.label, r.target or "", r.scenario, r.started_at,
                        r.ended_at, int(r.executed), r.executed_device or "", r.executed_action or "", int(r.correct),
                        int(r.ack_confirmed), r.commands_sent, r.commands_acked, int(r.confirmation_requested), r.rejections,
                        r.reasons, avg, "" if r.e2e_latency_ms is None else r.e2e_latency_ms])
        return buf.getvalue()
