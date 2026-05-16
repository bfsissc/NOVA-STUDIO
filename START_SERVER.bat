@echo off
echo ===============================================
echo   NOVA Studio - Local Server Launcher
echo ===============================================
echo.
echo This app MUST be served over http://, not file://
echo Opening browser at http://localhost:8080
echo.
echo IMPORTANT: If you see "Tracking Prevention" errors,
echo you MUST use this launcher instead of opening the
echo HTML files directly. The server fixes all those errors.
echo.

:: Try Python 3 first
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using Python to start server...
    timeout /t 1 /nobreak >nul
    start "" "http://localhost:8080"
    python -m http.server 8080
    goto :done
)

:: Try Python 3 explicit
python3 --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using Python3 to start server...
    timeout /t 1 /nobreak >nul
    start "" "http://localhost:8080"
    python3 -m http.server 8080
    goto :done
)

:: Try Node.js npx serve
npx --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using Node.js/npx to start server...
    timeout /t 1 /nobreak >nul
    start "" "http://localhost:8080"
    npx serve -p 8080 .
    goto :done
)

echo ERROR: Could not find Python or Node.js.
echo.
echo Please install one of:
echo   Python (recommended): https://www.python.org/downloads/
echo   Node.js: https://nodejs.org/
echo.
echo After installing Python, run this file again.
echo The app will open automatically at http://localhost:8080
pause

:done
