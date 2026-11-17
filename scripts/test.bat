@echo off
REM CONDUIT - run all automated tests (no camera or ESP32 needed)
cd /d "%~dp0\.."
call .venv\Scripts\activate.bat
echo === Python: landmarks, trajectory, intent engine, devices, analytics, API ===
python -m pytest -q
if errorlevel 1 exit /b 1
echo === TypeScript: type check ===
call npx tsc --noEmit
if errorlevel 1 exit /b 1
echo === TypeScript: Intent Engine parity with Python ===
call npx esbuild tests_ts/parity.ts --bundle --platform=node --outfile=.parity.cjs --log-level=error
if errorlevel 1 exit /b 1
node .parity.cjs
if errorlevel 1 exit /b 1
del .parity.cjs
echo === TypeScript: operational environments + shared engine ===
call npx esbuild tests_ts/modes.ts --bundle --platform=node --outfile=.modes.cjs --log-level=error
if errorlevel 1 exit /b 1
node .modes.cjs
if errorlevel 1 exit /b 1
del .modes.cjs
