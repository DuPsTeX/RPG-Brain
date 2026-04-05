@echo off
chcp 65001 >nul
title RPG-Brain: LightRAG Installation
echo ============================================
echo   RPG-Brain - LightRAG Installation
echo ============================================
echo.

:: Python pruefen
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] Python ist nicht installiert oder nicht im PATH!
    echo.
    echo Bitte Python 3.10+ installieren:
    echo   https://www.python.org/downloads/
    echo.
    echo WICHTIG: Bei der Installation "Add Python to PATH" ankreuzen!
    echo.
    pause
    exit /b 1
)

echo [OK] Python gefunden:
python --version
echo.

:: pip pruefen
pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] pip nicht gefunden!
    echo Bitte "python -m ensurepip" ausfuehren.
    pause
    exit /b 1
)

echo [OK] pip gefunden
echo.

:: LightRAG installieren
echo Installiere LightRAG...
echo.
pip install lightrag-hku
if %errorlevel% neq 0 (
    echo.
    echo [FEHLER] Installation fehlgeschlagen!
    echo Versuche: pip install lightrag-hku --user
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Installation erfolgreich!
echo ============================================
echo.
echo Starte LightRAG mit: start-lightrag.bat
echo Oder manuell:        lightrag-server --port 9621
echo.
pause
