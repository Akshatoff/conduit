# Hardware — the phone node (USB · `adb`)

Conduit's physical build is a **mobile phone**. The machine running the Conduit backend drives it over a
**USB cable with `adb`** (Android Debug Bridge). There is no microcontroller, no shield, no soldering and
no companion app — and no motor, fan or relay. Three outputs on the phone itself:

| Device id | Function | What the phone does | States | Readable back? |
|---|---|---|---|---|
| `torch` | Torch | rear camera LED (`cmd torch set on\|off`; falls back to a full-brightness screen flash when the phone does not expose the torch) | `ON` / `OFF` | **no** — the node reports `ACKNOWLEDGED`, never `CONFIRMED` |
| `screen` | Screen flash | backlight to maximum + wake (`settings put system screen_brightness 255`) | `ON` / `OFF` | **yes** — brightness ≥ 240 is read back, so this output can reach `CONFIRMED` |
| `vibration` | Vibration | repeating haptic pulse (`cmd vibrator vibrate <pulse_ms>`) | `ON` / `OFF` (pulses stop on OFF) | **no** — acknowledged only |

Everything else (zones, twins, analytics, validation) uses these three ids. The old `lighting` /
`access` devices, the Arduino sketch and the serial protocol are gone; there is no fallback to them.

> **Scope.** Only your own phone's torch, screen and vibration motor are actuated. Never point this at
> medical devices, machinery, door locks or anything safety-critical, and never leave a vibration pulse
> running unattended.

---

## 1. What you need

| Part | Role |
|---|---|
| An Android phone (Android 8+ recommended — `cmd vibrator` / `cmd torch` exist there) | the node |
| A USB **data** cable (not charge-only) | transport |
| `adb` — standalone platform-tools, or Android Studio's SDK, or `winget install Google.PlatformTools` | the driver |
| Windows 10/11, macOS or Linux running Conduit | host |

No root, no unlocked bootloader, no app installation, no USB OTG adapter.

## 2. Enable USB debugging (once per phone)

1. **Settings → About phone → Build number** — tap 7 times to unlock *Developer options*.
2. **Settings → System → Developer options → USB debugging** — on.
3. Plug the phone into the PC. On the phone, accept **Allow USB debugging?** (tick *Always allow from
   this computer*).
4. If the prompt never appears: Developer options → **Revoke USB debugging authorisations**, replug,
   and if needed switch **USB configuration** from *Charging only* to *File transfer (MTP)*.

Check it from a terminal:

```powershell
adb devices -l
# List of devices attached
# R58M12345AB  device product:... model:SM_G991B ...
```

`device` means ready. Other states:

| `adb devices` shows | Meaning | Fix |
|---|---|---|
| `unauthorized` | the prompt was not accepted | unlock the phone, accept *Allow USB debugging*, re-run |
| `offline` | the daemon lost sync | `adb kill-server`, replug, `adb devices -l` |
| nothing at all | no data connection | try another cable/port; on Windows install the OEM USB driver |

## 3. Point Conduit at the phone

* **Settings → Simulation & phone node** → *adb path* (blank = `adb` on `PATH`, then the usual
  platform-tools folders), *Phone serial* (blank = the first phone adb reports as ready),
  *Command timeout* and *Vibration pulse*.
* **Find phones** scans `adb devices` and lists serial, model and state; the same inventory is shown on
  the **Hardware** page.
* **Test link** runs the adb handshake (`adb version`, device list, `getprop` for model/manufacturer and
  Android version) and reports what it found.

Equivalent environment variables (used when the settings are blank):
`CONDUIT_ADB` (path to the adb executable) and `CONDUIT_PHONE_SERIAL`.

API: `GET /api/hardware/phone` → `{adb, devices, error, hint}`; `POST /api/hardware/connect` retries the
handshake; `GET|PUT /api/settings` carries `phone: {adb_path, serial, timeout_s, pulse_ms}`.

## 4. How a command is executed

```
UI / Intent Engine ─▶ controller.validate_command ─▶ SENT ─▶ adb command ─▶ node ACK
                                                                 │
                                        readable output?  ── yes ─▶ read back ─▶ CONFIRMED (verified)
                                                          └─ no  ─▶ ACKNOWLEDGED (verified: false)
```

* **Never fabricated.** If `adb` errors, times out or the phone disappears, the command ends
  `FAILED` / `DISCONNECTED`, the twin shows `UNKNOWN` and *no* acknowledgement is invented.
* **Independent read-back** after the ack for `screen` only (brightness). The torch is probed with
  `cmd torch`, `cmd flashlight` and a sysfs check; whether it is usable is reported as a capability. If it
  is not, the torch command drives a full-brightness screen flash instead and the detail string says so.
* **Idempotency + timeouts** live in the controller, identical in simulation and on the phone.
* **Safe state on loss.** `shutdown()` / disconnect / OFF stops every pending vibration pulse, releases the
  torch and restores the brightness value saved before the flash (128 if it was never readable).
* **Baseline gesture commands never reach the phone** — they run on the simulated node only.
* **Manual test** buttons exist only on the Hardware bench and the Twin device cards; each press writes one
  `manual_test` command and is logged as such.

### What the node actually runs

| Purpose | Command |
|---|---|
| handshake | `adb version`, `adb devices -l`, `getprop ro.product.model` / `ro.product.manufacturer` / `ro.build.version.release` |
| capability probe | `cmd torch set off`, `cmd flashlight set off`, `cmd vibrator` |
| torch | `cmd torch set on` / `cmd torch set off` |
| screen | `settings put system screen_brightness_mode 0`, `settings put system screen_brightness 255`, `input keyevent 224`, `wm dismiss-keyguard`; restore the saved value on OFF |
| screen read-back | `settings get system screen_brightness` |
| vibration | `cmd vibrator vibrate 700`, repeated every ~0.9 s (capped at 45 s); `cmd vibrator cancel` on OFF |

## 5. Manual bench test

From a terminal (phone unlocked once so the prompt is accepted):

```powershell
adb shell cmd torch set on
adb shell cmd torch set off

adb shell settings put system screen_brightness_mode 0
adb shell settings put system screen_brightness 255
adb shell settings get system screen_brightness      # 255
adb shell settings put system screen_brightness 128  # restore something sane

adb shell cmd vibrator vibrate 700
adb shell cmd vibrator cancel
```

Then in the app: **Hardware → Torch on / Flash on / Buzz**. The bench shows, per output, the ack, whether
it was verified, and the command id; the twin shows *ack only* where no read-back exists.

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `adb: command not found` / backend reports *adb not found* | platform-tools not installed or not on `PATH` | set the full path in Settings, or add platform-tools to `PATH` |
| `unauthorized` | debugging prompt not accepted | unlock the phone, accept, re-run *Find phones* |
| *No phone detected* but the phone charges | charge-only cable or port | use a data cable, another USB port, avoid hubs |
| torch never turns on, detail mentions *screen fallback* | phone does not expose `cmd torch` without root | expected: the node uses the screen flash instead and says so |
| `cmd vibrator` *Unknown command* | older Android | the pulse command is probed; vibration stays unavailable and is reported, never faked |
| Brightness does not change | another app owns the brightness / auto-brightness | the node sets `screen_brightness_mode 0` first; close the other app |
| Two adb servers fight (`adb devices` empty while the phone is connected) | another SDK/emulator version started its own daemon | `adb kill-server`, use one adb, restart Conduit |
| Hardware mode shows *Disconnected* forever | adb handshake failed | read the hint on the Hardware page — it names the failing step |

## 7. Limits worth saying out loud

* Without root, the **torch cannot be read back**, and on many phones it cannot be switched at all; that is
  why the torch output is acknowledged, with a screen-flash fallback.
* The **vibration motor** gives no state over `adb`: the node reports the pulses it sent, nothing more.
* Only the **screen brightness** is genuinely verifiable, so `CONFIRMED` is reserved for it.
* The phone must stay connected: adb over Wi-Fi (`adb connect`) is not part of this build.
* Everything runs on the PC; the phone receives no code, no app and no network traffic from Conduit.
