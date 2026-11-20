"""Phone node: drive a USB-connected Android phone with ADB.

No root, no app to install. The phone is the project's physical hardware:

* ``torch``      — rear camera torch        (``adb shell cmd torch set on|off``)
* ``screen``     — backlight at full brightness + wake (``settings put system screen_brightness``)
* ``vibration``  — repeating haptic pulse   (``adb shell cmd vibrator vibrate 700``)

ADB exposes no state query for the torch or the vibration motor on most phones, so those commands
stop at ACKNOWLEDGED (``verified=False``) — the node never claims a read-back it does not have.
The screen brightness *is* readable, so screen commands reach CONFIRMED from the device. When the
phone does not expose ``cmd torch`` the torch device drives a full-brightness screen flash instead,
and every acknowledgement says so.

Requirements: platform-tools (``adb``) on the PC, a USB *data* cable, Developer options →
USB debugging enabled, and the "Allow USB debugging" prompt accepted on the phone.
"""
from __future__ import annotations

import asyncio
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from .models import ACTION_TO_STATE, DeviceAck, DeviceCommand
from .nodes import DeviceNode, NodeError

#: Where adb usually lives on Windows/macOS/Linux when it is not on PATH.
_COMMON_ADB = [
    Path(os.getenv("LOCALAPPDATA", "")) / "Android" / "Sdk" / "platform-tools" / "adb.exe",
    Path(os.getenv("ANDROID_HOME", "")) / "platform-tools" / "adb",
    Path(os.getenv("ANDROID_SDK_ROOT", "")) / "platform-tools" / "adb",
    Path("/usr/local/bin/adb"),
    Path("/usr/bin/adb"),
    Path("/opt/homebrew/bin/adb"),
]

BRIGHT_ON = 255           # brightness value used for the screen flash
BRIGHT_THRESHOLD = 240    # anything at/above this counts as "flash on"
BRIGHT_RESTORE = 128      # used when the previous brightness could not be read


def find_adb(configured: str = "") -> str:
    """Return a usable adb path, or raise :class:`NodeError` with install instructions."""
    candidates: List[str] = []
    if configured:
        candidates.append(configured)
    if os.getenv("CONDUIT_ADB"):
        candidates.insert(0, os.environ["CONDUIT_ADB"])
    which = shutil.which("adb")
    if which:
        candidates.append(which)
    candidates += [str(p) for p in _COMMON_ADB if str(p) and p.parent.exists()]
    for candidate in candidates:
        if candidate and (Path(candidate).exists() or shutil.which(candidate)):
            return candidate
    raise NodeError(
        "adb was not found. Install Android platform-tools (it contains adb.exe), add it to PATH or "
        "set the adb path in Settings → Hardware. Windows: winget install Google.PlatformTools"
    )


class AdbRunner:
    """Thin subprocess wrapper (injectable so the tests never need a phone)."""

    def __init__(self, adb: str = "adb", serial: str = "", timeout_s: float = 8.0) -> None:
        self.adb = adb
        self.serial = serial
        self.timeout_s = timeout_s

    def argv(self, args: Sequence[str]) -> List[str]:
        return [self.adb] + (["-s", self.serial] if self.serial else []) + list(args)

    def run(self, args: Sequence[str], timeout_s: Optional[float] = None) -> Tuple[int, str, str]:
        try:
            proc = subprocess.run(self.argv(args), capture_output=True, text=True,
                                  timeout=timeout_s or self.timeout_s, encoding="utf-8", errors="replace")
        except FileNotFoundError as e:
            raise NodeError(f"adb could not be started ({self.adb})") from e
        except subprocess.TimeoutExpired as e:
            raise NodeError(f"adb {' '.join(args)} timed out after {timeout_s or self.timeout_s:.0f}s") from e
        return proc.returncode, (proc.stdout or "").strip(), (proc.stderr or "").strip()

    def shell(self, *args: str, timeout_s: Optional[float] = None) -> Tuple[int, str, str]:
        return self.run(["shell", *args], timeout_s=timeout_s)


class PhoneAdbNode(DeviceNode):
    """The real-hardware node: an Android phone attached over USB."""

    name = "phone-adb"
    simulated = False

    def __init__(self, adb_path: str = "", serial: str = "", timeout_s: float = 8.0,
                 runner: Optional[AdbRunner] = None, pulse_ms: int = 700, pulse_gap_s: float = 0.9,
                 max_buzz_s: float = 45.0) -> None:
        self._configured_adb = adb_path
        self._runner = runner
        self.serial = serial
        self.timeout_s = timeout_s
        self.pulse_ms = pulse_ms
        self.pulse_gap_s = pulse_gap_s
        self.max_buzz_s = max_buzz_s
        self.info: Dict[str, object] = {}
        self.capabilities: Dict[str, object] = {
            "torch": False, "torch_command": None, "vibration": False, "screen": True,
            "torch_reason": "not probed yet",
        }
        self._prev_brightness: Optional[int] = None
        self._buzzing = False
        self._pulses = 0
        self._buzz_task: Optional[asyncio.Task] = None

    # ---------------------------------------------------------------- setup
    @property
    def adb(self) -> str:
        return self._runner.adb if self._runner else (self._configured_adb or "adb")

    def configure(self, adb_path: str, serial: str, timeout_s: float,
                  pulse_ms: Optional[int] = None) -> None:
        self._configured_adb = adb_path
        self.serial = serial
        self.timeout_s = timeout_s
        if pulse_ms is not None:
            self.pulse_ms = max(50, min(5000, int(pulse_ms)))
        if self._runner is not None:  # keep an injected runner pointed at the new target
            self._runner.serial = serial
            self._runner.adb = adb_path or self._runner.adb
            self._runner.timeout_s = timeout_s

    def _r(self) -> AdbRunner:
        if self._runner is None:
            self._runner = AdbRunner(find_adb(self._configured_adb), self.serial, self.timeout_s)
        return self._runner

    # ------------------------------------------------------------- health
    def _health_sync(self) -> dict:
        runner = self._r()
        rc, out, err = runner.run(["version"])
        if rc != 0:
            raise NodeError(f"adb is not usable: {err or out}")
        if not self.serial:
            self.serial = self._pick_device(runner)
            runner.serial = self.serial
        model = self._prop("ro.product.model") or "Android phone"
        manufacturer = self._prop("ro.product.manufacturer") or ""
        android = self._prop("ro.build.version.release") or "unknown"
        self._probe()
        self.info = {"serial": self.serial, "model": model, "manufacturer": manufacturer,
                     "android": android, "adb": runner.adb}
        return {"status": "ok", "node": self.name, "simulated": False, "model": model,
                "manufacturer": manufacturer, "android": android, "serial": self.serial,
                "capabilities": dict(self.capabilities)}

    def _pick_device(self, runner: AdbRunner) -> str:
        rc, out, err = runner.run(["devices", "-l"])
        if rc != 0:
            raise NodeError(f"adb devices failed: {err or out}")
        rows = [line.split() for line in out.splitlines()[1:] if line.strip()]
        states = {row[0]: (row[1] if len(row) > 1 else "?") for row in rows}
        if not states:
            raise NodeError(
                "No phone detected. Connect the phone with a USB *data* cable, enable Developer options → "
                "USB debugging, and accept the 'Allow USB debugging' prompt on the phone."
            )
        ready = [serial for serial, state in states.items() if state == "device"]
        if ready:
            return ready[0]
        unauthorised = [s for s, state in states.items() if state == "unauthorized"]
        if unauthorised:
            raise NodeError(
                "Phone is connected but not authorised for debugging. Unlock it, tap 'Allow' on the "
                "'Allow USB debugging?' prompt (tick 'Always allow'), then retry."
            )
        first_state = next(iter(states.values()))
        raise NodeError(f"Phone is not ready for debugging (state: {first_state}). Reconnect the USB cable and retry.")

    def _prop(self, name: str) -> str:
        rc, out, _ = self._r().shell("getprop", name)
        return out if rc == 0 else ""

    def _probe(self) -> None:
        """Find out what this phone actually exposes over ADB (never assume)."""
        torch_cmd, reason = None, "this phone does not expose the torch to adb"
        for candidate in (("cmd", "torch", "set"), ("cmd", "flashlight", "set")):
            rc, out, err = self._r().shell(*candidate, "off")
            text = f"{out} {err}".lower()
            if rc == 0 and "unknown service" not in text and "not found" not in text and "denied" not in text:
                torch_cmd, reason = candidate, ""
                break
            reason = (err or out or "command failed").splitlines()[0][:120]
        rc, out, _ = self._r().shell("cmd", "vibrator")
        vibration = rc == 0 and "vibrate" in f"{out}".lower()
        if not vibration:
            rc, _, _ = self._r().shell("cmd", "vibrator", "vibrate", "1")
            vibration = rc == 0
        rc, out, _ = self._r().shell("settings", "get", "system", "screen_brightness")
        self.capabilities = {
            "torch": torch_cmd is not None,
            "torch_command": list(torch_cmd) if torch_cmd else None,
            "torch_reason": reason,
            "vibration": vibration,
            "screen": rc == 0 and out.strip() != "null",
        }

    async def health(self) -> dict:
        return await asyncio.to_thread(self._health_sync)

    # -------------------------------------------------------------- output
    def _brightness(self) -> Optional[int]:
        rc, out, err = self._r().shell("settings", "get", "system", "screen_brightness")
        if rc != 0:
            raise NodeError(f"Could not read screen brightness: {err or out}")
        match = re.search(r"\d+", out)
        return int(match.group(0)) if match else None

    def _set_screen(self, state: str) -> None:
        runner = self._r()
        if state == "ON":
            current = self._brightness()
            if current is not None and current < BRIGHT_THRESHOLD:
                self._prev_brightness = current
            runner.shell("settings", "put", "system", "screen_brightness_mode", "0")
            rc, out, err = runner.shell("settings", "put", "system", "screen_brightness", str(BRIGHT_ON))
            if rc != 0:
                raise NodeError(f"Phone refused the brightness change: {err or out}")
            runner.shell("input", "keyevent", "224")   # KEYCODE_WAKEUP
            runner.shell("wm", "dismiss-keyguard")
        else:
            restore = self._prev_brightness if self._prev_brightness is not None else BRIGHT_RESTORE
            runner.shell("settings", "put", "system", "screen_brightness", str(restore))

    def _set_torch(self, state: str) -> str:
        """Returns a short description of the physical path used."""
        command = self.capabilities.get("torch_command")
        if self.capabilities.get("torch"):
            assert command is not None
            rc, out, err = self._r().shell(*command, state.lower())
            text = f"{out} {err}".lower()
            if rc == 0 and "denied" not in text:
                return "adb torch"
            self.capabilities["torch"] = False
            self.capabilities["torch_reason"] = (err or out or "torch command failed").splitlines()[0][:120]
        # Honest fallback: the screen backlight is still a real light output, and we say so.
        self._set_screen(state)
        return "screen flash (torch not exposed over adb)"

    def _send_sync(self, cmd: DeviceCommand) -> DeviceAck:
        target = ACTION_TO_STATE[cmd.action]
        if cmd.device == "torch":
            used = self._set_torch(target)
            note = "" if used == "adb torch" else f" — {self.capabilities.get('torch_reason') or 'torch not available'}"
            return DeviceAck(command_id=cmd.command_id, device=cmd.device, status="ACKNOWLEDGED",
                             actual_state=target, detail=f"Torch {target} via {used}{note}".strip(),
                             simulated=False, verified=used.startswith("screen flash"))
        if cmd.device == "screen":
            self._set_screen(target)
            return DeviceAck(command_id=cmd.command_id, device=cmd.device, status="ACKNOWLEDGED",
                             actual_state=target, detail=f"Screen flash {target}", simulated=False, verified=True)
        if cmd.device == "vibration":
            raise AssertionError("vibration is handled by the async layer")  # pragma: no cover
        return DeviceAck(command_id=cmd.command_id, device=cmd.device, status="REJECTED",
                         detail=f"Unknown device '{cmd.device}'", simulated=False)

    async def send(self, cmd: DeviceCommand) -> DeviceAck:
        if cmd.device == "vibration":
            target = ACTION_TO_STATE[cmd.action]
            if target == "ON":
                if not self.capabilities.get("vibration", True):
                    return DeviceAck(command_id=cmd.command_id, device=cmd.device, status="REJECTED",
                                     detail="This phone does not expose the vibration motor to adb", simulated=False)
                self._start_buzz()
                return DeviceAck(command_id=cmd.command_id, device=cmd.device, status="ACKNOWLEDGED",
                                 actual_state="ON",
                                 detail=f"Vibration ON — {self.pulse_ms} ms pulse every "
                                        f"{int((self.pulse_gap_s + self.pulse_ms / 1000) * 1000)} ms",
                                 simulated=False, verified=False)
            await self._stop_buzz()
            return DeviceAck(command_id=cmd.command_id, device=cmd.device, status="ACKNOWLEDGED",
                             actual_state="OFF", detail=f"Vibration OFF after {self._pulses} pulse(s)",
                             simulated=False, verified=False)
        return await asyncio.to_thread(self._send_sync, cmd)

    # ------------------------------------------------------------ vibration
    def _start_buzz(self) -> None:
        self._pulses = 0
        self._buzzing = True
        if self._buzz_task is None or self._buzz_task.done():
            self._buzz_task = asyncio.get_running_loop().create_task(self._buzz_loop())

    async def _stop_buzz(self) -> None:
        self._buzzing = False
        task = self._buzz_task
        self._buzz_task = None
        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def _buzz_loop(self) -> None:
        deadline = time.monotonic() + self.max_buzz_s
        try:
            while self._buzzing and time.monotonic() < deadline:
                rc, _, _ = await asyncio.to_thread(self._r().shell, "cmd", "vibrator", "vibrate", str(self.pulse_ms))
                if rc == 0:
                    self._pulses += 1
                await asyncio.sleep(self.pulse_gap_s)
        except asyncio.CancelledError:  # pragma: no cover - normal stop path
            raise
        finally:
            self._buzzing = False

    # ------------------------------------------------------------ read back
    def _read_sync(self) -> Dict[str, str]:
        states: Dict[str, str] = {}
        brightness = self._brightness()
        if brightness is not None:
            states["screen"] = "ON" if brightness >= BRIGHT_THRESHOLD else "OFF"
            if not self.capabilities.get("torch"):
                # The torch is being driven through the screen, so it is genuinely readable.
                states["torch"] = states["screen"]
        return {k: v for k, v in states.items() if k in ("screen", "torch")}

    async def read_state(self) -> Dict[str, str]:
        return await asyncio.to_thread(self._read_sync)

    # ------------------------------------------------------------- safe state
    async def shutdown(self) -> None:
        """Return the phone to a quiet state (no buzzing, torch/screen off)."""
        await self._stop_buzz()
        try:
            await asyncio.to_thread(self._send_sync, DeviceCommand(device="screen", action="OFF", source="manual_test"))
            if self.capabilities.get("torch"):
                await asyncio.to_thread(self._send_sync, DeviceCommand(device="torch", action="OFF", source="manual_test"))
        except NodeError:
            pass


def adb_inventory(adb_path: str = "", timeout_s: float = 6.0) -> dict:
    """List what adb can see, for Settings → Hardware. Never raises: the error is returned."""
    try:
        adb = find_adb(adb_path)
    except NodeError as e:
        return {"adb": None, "version": None, "devices": [], "error": str(e)}
    runner = AdbRunner(adb, "", timeout_s)
    try:
        rc, out, err = runner.run(["version"])
        version = out.splitlines()[0] if rc == 0 and out else None
        if version is None:
            return {"adb": adb, "version": None, "devices": [], "error": err or "adb version failed"}
        rc, out, err = runner.run(["devices", "-l"])
        if rc != 0:
            return {"adb": adb, "version": version, "devices": [], "error": err or "adb devices failed"}
    except NodeError as e:
        return {"adb": adb, "version": None, "devices": [], "error": str(e)}
    devices = []
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 2:
            continue
        extra = {}
        for token in parts[2:]:
            if ":" in token:
                key, value = token.split(":", 1)
                extra[key] = value
        devices.append({"serial": parts[0], "state": parts[1], "model": extra.get("model", ""),
                        "product": extra.get("product", ""), "device": extra.get("device", "")})
    hint = None
    if not devices:
        hint = ("Connect the phone with a USB data cable, enable Developer options → USB debugging, "
                "and accept the 'Allow USB debugging' prompt on the phone.")
    elif all(d["state"] != "device" for d in devices):
        hint = ("A phone is visible but not authorised. Unlock it and accept the USB debugging prompt "
                "(tick 'Always allow from this computer').")
    return {"adb": adb, "version": version, "devices": devices, "error": None, "hint": hint}
