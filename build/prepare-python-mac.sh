#!/bin/bash
# Triur.ai - Prepare Embedded Python for macOS Packaging
# Downloads a standalone Python build and installs pip + requirements.
# Uses python-build-standalone (relocatable Python) from indygreg.
#
# Run from the project root:  bash build/prepare-python-mac.sh

set -e

PYTHON_VERSION="3.11.9"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="$PROJECT_ROOT/resources/python"
REQUIREMENTS="$PROJECT_ROOT/requirements.txt"

# Detect architecture
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  STANDALONE_ARCH="aarch64"
else
  STANDALONE_ARCH="x86_64"
fi

# python-build-standalone release (cpython-only, install-only flavor)
# https://github.com/indygreg/python-build-standalone/releases
RELEASE_TAG="20240726"
STANDALONE_URL="https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}/cpython-${PYTHON_VERSION}+${RELEASE_TAG}-${STANDALONE_ARCH}-apple-darwin-install_only.tar.gz"

echo ""
echo "Triur.ai - Embedded Python Setup (macOS)"
echo "Python $PYTHON_VERSION ($ARCH)"
echo ""

# 1. Clean previous
if [ -d "$TARGET_DIR" ]; then
  echo "[1/5] Cleaning previous embedded Python..."
  rm -rf "$TARGET_DIR"
fi
mkdir -p "$TARGET_DIR"

# 2. Download
echo "[2/5] Downloading Python $PYTHON_VERSION standalone ($STANDALONE_ARCH)..."
TEMP_TAR="$TARGET_DIR/python-standalone.tar.gz"
curl -L -o "$TEMP_TAR" "$STANDALONE_URL"

# 3. Extract — the archive contains a `python/` directory at root
echo "[3/5] Extracting Python..."
tar -xzf "$TEMP_TAR" -C "$TARGET_DIR" --strip-components=1
rm "$TEMP_TAR"

# 4. Verify python works
echo "[4/5] Verifying Python installation..."
PYTHON_BIN="$TARGET_DIR/bin/python3"
if [ ! -x "$PYTHON_BIN" ]; then
  echo "ERROR: Python binary not found at $PYTHON_BIN"
  exit 1
fi
"$PYTHON_BIN" --version

# 5. Install project dependencies
echo "[5/5] Installing project dependencies..."
"$PYTHON_BIN" -m pip install --upgrade pip --quiet
"$PYTHON_BIN" -m pip install -r "$REQUIREMENTS" --quiet

echo ""
echo "Done! Embedded Python ready at: $TARGET_DIR"
echo ""

"$PYTHON_BIN" -m pip list
