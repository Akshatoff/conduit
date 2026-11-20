"""The hand-model file check: a corrupt download must never reach MediaPipe.

MediaPipe surfaces a bad ``hand_landmarker.task`` as "Unable to open zip archive", which the app used
to show as a bare "Camera could not start". These tests pin the validation that replaces it.
"""
from __future__ import annotations

import os
import zipfile
from pathlib import Path

import pytest

from backend.vision import hand_tracker as ht


def write_task_model(path: Path, payload_bytes: int = 7_200_000, prefix: bytes = b"") -> Path:
    """Create a .task-shaped ZIP (prefix + two model members) of a realistic size."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as zf:
        zf.writestr("hand_detector.tflite", os.urandom(payload_bytes))
        zf.writestr("hand_landmarks_detector.tflite", b"second model")
    if prefix:
        raw = path.read_bytes()
        path.write_bytes(prefix + raw)
    return path


def test_valid_task_bundle_is_accepted_with_or_without_prefix(tmp_path):
    plain = write_task_model(tmp_path / "plain" / "hand_landmarker.task")
    prefixed = write_task_model(tmp_path / "prefixed" / "hand_landmarker.task", prefix=b"\x00\x00")
    assert ht.is_task_model(plain)
    assert ht.is_task_model(prefixed)  # the published model carries a 2-byte prefix


def test_html_page_is_rejected_and_described(tmp_path):
    page = tmp_path / "hand_landmarker.task"
    page.write_bytes(b"<!doctype html><html><body>blocked by network policy</body></html>")
    assert not ht.is_task_model(page)
    assert "HTML/text page" in ht._describe(page)


def test_truncated_download_is_rejected(tmp_path):
    full = write_task_model(tmp_path / "hand_landmarker.task")
    data = full.read_bytes()
    full.write_bytes(data[:-200])  # loses the central-directory record
    assert not ht.is_task_model(full)


def test_ensure_model_uses_public_copy(tmp_path, monkeypatch):
    public = write_task_model(tmp_path / "public" / "hand_landmarker.task")
    monkeypatch.setattr(ht, "model_candidates", lambda: [public])
    calls = []
    monkeypatch.setattr(ht, "_download", lambda dest: calls.append(dest))
    assert ht.ensure_model() == public
    assert calls == []


def test_ensure_model_replaces_a_corrupt_file(tmp_path, monkeypatch):
    broken = tmp_path / "assets" / "hand_landmarker.task"
    broken.parent.mkdir(parents=True)
    broken.write_bytes(b"<html>502 Bad Gateway</html>")
    monkeypatch.setattr(ht, "model_candidates", lambda: [broken])

    def fake_download(dest: Path) -> Path:
        return write_task_model(dest)

    monkeypatch.setattr(ht, "_download", fake_download)
    got = ht.ensure_model()
    assert got == broken
    assert ht.is_task_model(got)


def test_ensure_model_reports_an_actionable_error_when_download_fails(tmp_path, monkeypatch):
    missing = tmp_path / "assets" / "hand_landmarker.task"
    monkeypatch.setattr(ht, "model_candidates", lambda: [missing])

    def fail(dest: Path) -> Path:
        raise ht.TrackerUnavailable(f"Could not download the hand model. The repo ships it at {ht.PUBLIC_MODEL_PATH}")

    monkeypatch.setattr(ht, "_download", fail)
    with pytest.raises(ht.TrackerUnavailable) as err:
        ht.ensure_model()
    assert "public/mediapipe/hand_landmarker.task" in str(err.value).replace("\\", "/")
