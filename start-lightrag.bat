@echo off
chcp 65001 >nul
title RPG-Brain: LightRAG Server
echo ============================================
echo   RPG-Brain - LightRAG Server
echo ============================================
echo.
echo Server startet auf: http://localhost:9621
echo Dieses Fenster offen lassen!
echo Zum Beenden: Strg+C oder Fenster schliessen
echo ============================================
echo.

:: Pruefen ob LightRAG installiert ist
lightrag-server --help >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] LightRAG ist nicht installiert!
    echo Bitte zuerst install-lightrag.bat ausfuehren.
    echo.
    pause
    exit /b 1
)

:: Datenverzeichnis erstellen
if not exist "%APPDATA%\RPGBrain\lightrag" (
    mkdir "%APPDATA%\RPGBrain\lightrag"
)

:: LightRAG starten
lightrag-server --port 9621 --working-dir "%APPDATA%\RPGBrain\lightrag"
pause
