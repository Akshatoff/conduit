@echo off
REM CONDUIT - one-time setup (Windows, Python 3.11+ and Node 20+ required)
cd /d "%~dp0\.."

echo [1/4] Creating Python virtual environment...
py -3.11 -m venv .venv 2>nul || python -m venv .venv
if errorlevel 1 (echo Python 3.11+ not found & exit /b 1)

echo [2/4] Installing backend dependencies...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (echo pip install failed & exit /b 1)

echo [3/4] Installing and building the frontend...
call npm install
call npm run build

echo [4/4] Preparing the local MediaPipe model and WASM runtime...
python scripts\fetch_model.py
if errorlevel 1 echo WARNING: the hand model is not usable - see the message above. The app still runs with the pointer simulator.

if not exist .env copy .env.example .env >nul
echo.
echo Setup complete. Start CONDUIT with:  scripts\run.bat
