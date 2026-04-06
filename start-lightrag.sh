#!/bin/bash
echo "============================================"
echo "  RPG-Brain - LightRAG Server"
echo "============================================"
echo ""
echo "Server startet auf: http://localhost:9621"
echo "Zum Beenden: Strg+C"
echo "============================================"
echo ""

# Pruefen ob LightRAG installiert ist
if ! command -v lightrag-server &> /dev/null; then
    echo "[FEHLER] LightRAG ist nicht installiert!"
    echo "Bitte zuerst ./install-lightrag.sh ausfuehren."
    exit 1
fi

# Pruefen ob Ollama laeuft
echo "Pruefe Ollama..."
if ! ollama list &> /dev/null; then
    echo "[INFO] Starte Ollama..."
    ollama serve &
    sleep 3
fi

# Modelle pruefen und ggf. herunterladen
echo "Pruefe Modelle..."
if ! ollama list 2>/dev/null | grep -qi "nomic-embed-text"; then
    echo "[INFO] Lade Embedding-Modell: nomic-embed-text ..."
    ollama pull nomic-embed-text
fi

if ! ollama list 2>/dev/null | grep -qi "qwen2.5:3b"; then
    echo "[INFO] Lade LLM-Modell: qwen2.5:3b ..."
    ollama pull qwen2.5:3b
fi

echo ""
echo "[OK] Ollama + Modelle bereit"
echo ""

# Datenverzeichnis
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/rpg-brain/lightrag"
mkdir -p "$DATA_DIR"

# Ollama-Modelle per Umgebungsvariablen setzen
export LLM_MODEL=qwen2.5:3b
export EMBEDDING_MODEL=nomic-embed-text
export EMBEDDING_DIM=768

# Kleinere Chunks damit Ollama nicht in Timeouts laeuft
export LIGHTRAG_CHUNK_SIZE=512
export LIGHTRAG_CHUNK_OVERLAP_SIZE=64

# LightRAG starten mit Ollama-Binding
lightrag-server --port 9621 --working-dir "$DATA_DIR" --llm-binding ollama --embedding-binding ollama
