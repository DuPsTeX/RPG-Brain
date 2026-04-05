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

# Datenverzeichnis
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/rpg-brain/lightrag"
mkdir -p "$DATA_DIR"

# LightRAG starten
lightrag-server --port 9621 --working-dir "$DATA_DIR"
