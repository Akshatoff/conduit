@echo off
REM CONDUIT - development mode: backend with auto-reload + Vite dev server (http://localhost:5173)
cd /d "%~dp0\.."
call .venv\Scripts\activate.bat
start "conduit-backend" cmd /k python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
call npm run dev
