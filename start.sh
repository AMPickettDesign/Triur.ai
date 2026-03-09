#!/bin/bash

echo "========================================"
echo "  Triur.ai - Three AI Companions"
echo "========================================"
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if Python 3 is installed
echo "[1/5] Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo ""
    echo "  ERROR: Python is not installed."
    echo "  Please install Python 3.14+ from https://www.python.org/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Check Python version
PYVER=$(python3 --version 2>&1 | awk '{print $2}')
PYMAJOR=$(echo $PYVER | cut -d. -f1)
PYMINOR=$(echo $PYVER | cut -d. -f2)

if [ "$PYMAJOR" -lt 3 ]; then
    echo ""
    echo "  ERROR: Python version $PYVER is too old."
    echo "  Please upgrade to Python 3.14+ from https://www.python.org/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

if [ "$PYMAJOR" -eq 3 ] && [ "$PYMINOR" -lt 14 ]; then
    echo ""
    echo "  WARNING: Python $PYVER detected. Version 3.14+ recommended."
    echo "  Triur.ai may not work correctly with older versions."
    echo ""
fi

# Check if Ollama is installed
echo "[2/5] Checking Ollama..."
if ! command -v ollama &> /dev/null; then
    echo ""
    echo "  ERROR: Ollama is not installed."
    echo "  Please install Ollama from https://ollama.com/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if Ollama is running, start it if not
echo "[3/5] Checking Ollama status..."
if ! pgrep -x "ollama" > /dev/null; then
    echo "  Starting Ollama..."
    ollama serve &
    sleep 5
else
    echo "  Ollama is already running."
fi

# Check if the model is pulled
echo "[4/5] Checking AI model..."
if ! ollama list 2>/dev/null | grep -q "dolphin-llama3:8b"; then
    echo ""
    echo "  INFO: AI model not found. Pulling it now..."
    echo "  This may take a few minutes..."
    echo ""
    ollama pull dolphin-llama3:8b
    if [ $? -ne 0 ]; then
        echo ""
        echo "  ERROR: Failed to pull AI model."
        echo "  Please run: ollama pull dolphin-llama3:8b"
        echo ""
        read -p "Press Enter to exit..."
        exit 1
    fi
fi
echo "  AI model ready."

# Install Python dependencies if needed
echo "[5/5] Checking Python dependencies..."
if [ ! -d "venv" ]; then
    echo "  Creating virtual environment..."
    python3 -m venv venv
fi

echo "  Installing Flask and dependencies..."
source venv/bin/activate
pip install -r requirements.txt -q
if [ $? -ne 0 ]; then
    echo ""
    echo "  ERROR: Failed to install Python dependencies."
    echo "  Please run: pip install -r requirements.txt"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Start Triur.ai
echo ""
echo "========================================"
echo "  Starting Triur.ai..."
echo "========================================"
echo ""

# Start the brain server in background
python3 src/server.py &
sleep 3

# Start the Electron app
cd app
npx electron .

echo "  Triur.ai is running!"
echo ""
