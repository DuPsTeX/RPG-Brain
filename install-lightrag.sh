#!/bin/bash
echo "============================================"
echo "  RPG-Brain - LightRAG Installation"
echo "============================================"
echo ""

# Python pruefen
if ! command -v python3 &> /dev/null; then
    echo "[FEHLER] Python3 ist nicht installiert!"
    echo ""
    echo "Installation:"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip"
    echo "  macOS:         brew install python3"
    echo "  Arch:          sudo pacman -S python python-pip"
    exit 1
fi

echo "[OK] Python gefunden: $(python3 --version)"
echo ""

# pip pruefen
if ! command -v pip3 &> /dev/null; then
    echo "[FEHLER] pip3 nicht gefunden!"
    echo "  sudo apt install python3-pip"
    exit 1
fi

echo "[OK] pip gefunden"
echo ""

# LightRAG installieren
echo "Installiere LightRAG..."
echo ""
pip3 install lightrag-hku

if [ $? -ne 0 ]; then
    echo ""
    echo "[FEHLER] Installation fehlgeschlagen!"
    echo "Versuche: pip3 install lightrag-hku --user"
    exit 1
fi

echo ""
echo "============================================"
echo "  Installation erfolgreich!"
echo "============================================"
echo ""
echo "Starte LightRAG mit: ./start-lightrag.sh"
echo "Oder manuell:        lightrag-server --port 9621"
