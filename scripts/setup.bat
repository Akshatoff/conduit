@echo off
REM CONDUIT - one-time setup (Windows, Python 3.11+ and Node 20+ required)
cd /d "%~dp0\.."

echo [1/3] Creating Python virtual environment...
py -3.11 -m venv .venv 2>nul || python -m venv .venv
if errorlevel 1 (echo Python 3.11+ not found & exit /b 1)

echo [2/3] Installing backend dependencies...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (echo pip install failed & exit /b 1)

echo [3/3] Installing and building the frontend...
call npm install
call npm run build

if not exist .env copy .env.example .env >nul
echo.
echo Setup complete. Start CONDUIT with:  scripts\run.bat
