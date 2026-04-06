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

:: Pruefen ob Ollama laeuft
echo Pruefe Ollama...
ollama list >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Starte Ollama...
    start "" ollama serve
    timeout /t 3 /nobreak >nul
)

:: Modelle pruefen und ggf. herunterladen
echo Pruefe Modelle...
ollama list 2>nul | findstr /i "nomic-embed-text" >nul
if %errorlevel% neq 0 (
    echo [INFO] Lade Embedding-Modell: nomic-embed-text ...
    ollama pull nomic-embed-text
)

ollama list 2>nul | findstr /i "qwen2.5:7b" >nul
if %errorlevel% neq 0 (
    echo [INFO] Lade LLM-Modell: qwen2.5:7b ...
    ollama pull qwen2.5:7b
)

echo.
echo [OK] Ollama + Modelle bereit
echo.

:: Datenverzeichnis erstellen
if not exist "%APPDATA%\RPGBrain\lightrag" (
    mkdir "%APPDATA%\RPGBrain\lightrag"
)

:: Ollama-Modelle per Umgebungsvariablen setzen
set LLM_MODEL=qwen2.5:7b
set EMBEDDING_MODEL=nomic-embed-text
set EMBEDDING_DIM=768

:: Kleinere Chunks damit Ollama nicht in Timeouts laeuft
set LIGHTRAG_CHUNK_SIZE=512
set LIGHTRAG_CHUNK_OVERLAP_SIZE=64

:: LightRAG starten mit Ollama-Binding
lightrag-server --port 9621 --working-dir "%APPDATA%\RPGBrain\lightrag" --llm-binding ollama --embedding-binding ollama
pause
