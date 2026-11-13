@echo off
REM CONDUIT - run backend (serves the built UI too) on http://127.0.0.1:8000
cd /d "%~dp0\.."
call .venv\Scripts\activate.bat
if not exist dist\index.html (echo Building frontend first... & call npm run build)
echo Open http://127.0.0.1:8000 in your browser.
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
