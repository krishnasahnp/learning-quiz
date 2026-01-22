#!/usr/bin/env bash
# Deployment helper for PythonAnywhere
# Usage (on PythonAnywhere Bash console):
#   chmod +x deploy.sh            # first time
#   ./deploy.sh                   # pull latest, install deps, reload

set -euo pipefail

# --- Edit these two lines to match your PythonAnywhere account ---
PA_USER="learningquiz"                 
APP_DIR="/home/learningquiz/mysite"    # path to your project root on PythonAnywhere
# -----------------------------------------------------------------

VENV_DIR="$APP_DIR/venv"
WSGI_RELOAD_CMD="pa_reload_webapp ${PA_USER}.pythonanywhere.com"

echo "[deploy] Starting deploy for ${PA_USER}..."

cd "$APP_DIR"

echo "[deploy] Pulling latest from git..."
git pull --rebase

echo "[deploy] Activating venv..."
source "$VENV_DIR/bin/activate"

echo "[deploy] Installing requirements..."
pip install -r requirements.txt

echo "[deploy] Reloading web app..."
$WSGI_RELOAD_CMD

echo "[deploy] Done."

