@echo off
REM CONDUIT - validate/repair the local MediaPipe model + WASM runtime
cd /d "%~dp0\.."
if not exist .venv\Scripts\python.exe (
  echo Python environment not found. Run scripts\setup.bat first.
  exit /b 1
)
.venv\Scripts\python.exe scripts\fetch_model.py %*
