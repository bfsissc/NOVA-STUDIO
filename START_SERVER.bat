@echo off
echo ==========================================
echo   NOVA Studio - Local Development Server
echo ==========================================
echo.

REM Try Python 3 first
python --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    echo Starting server with Python 3...
    echo.
    echo Open your browser at:
    echo   http://localhost:8080
    echo.
    echo Press Ctrl+C to stop the server.
    echo.
    python -m http.server 8080
    GOTO END
)

REM Try python3 command
python3 --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    echo Starting server with Python 3...
    echo.
    echo Open your browser at:
    echo   http://localhost:8080
    echo.
    echo Press Ctrl+C to stop the server.
    echo.
    python3 -m http.server 8080
    GOTO END
)

REM Try Node.js npx serve
npx --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    echo Starting server with Node.js...
    echo.
    echo Open your browser at:
    echo   http://localhost:8080
    echo.
    echo Press Ctrl+C to stop the server.
    echo.
    npx serve -p 8080 .
    GOTO END
)

REM Nothing found
echo ERROR: Python or Node.js not found.
echo.
echo Please install one of the following:
echo   Python: https://www.python.org/downloads/
echo   Node.js: https://nodejs.org/
echo.
echo OR drag index.html into your browser — but note that
echo Firebase login will NOT work from file:// URLs.
echo You must use http://localhost to test properly.
echo.
pause

:END
