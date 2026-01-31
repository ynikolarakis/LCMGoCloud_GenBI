#!/bin/bash
set -euo pipefail

# GenBI Staging Deploy Script
# Usage: ./deploy.sh <ELASTIC_IP> [SSH_USER]

IP="${1:?Usage: ./deploy.sh <ELASTIC_IP> [SSH_USER]}"
USER="${2:-cronos}"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== Deploying GenBI to ${USER}@${IP} ==="

# --- Backend ---
echo "[1/4] Uploading backend..."
rsync -az --delete \
  --exclude='__pycache__' \
  --exclude='.pytest_cache' \
  --exclude='venv' \
  --exclude='.env' \
  "${PROJECT_ROOT}/backend/" \
  "${USER}@${IP}:/tmp/genbi-backend/"

echo "[2/4] Installing backend on server..."
ssh "${USER}@${IP}" bash -s << 'REMOTE_BACKEND'
sudo rsync -a /tmp/genbi-backend/ /opt/genbi/backend/ --exclude=venv --exclude=.env
sudo chown -R genbi:genbi /opt/genbi/backend
cd /opt/genbi/backend
sudo -u genbi python3.12 -m venv venv 2>/dev/null || true
sudo -u genbi venv/bin/pip install --quiet --upgrade pip
sudo -u genbi venv/bin/pip install --quiet -r requirements.txt
# Run migrations
sudo -u genbi bash -c 'source /opt/genbi/backend/.env && cd /opt/genbi/backend && venv/bin/python -m alembic upgrade head' || echo "Migration skipped (may need manual run)"
sudo systemctl enable genbi-backend
sudo systemctl restart genbi-backend
REMOTE_BACKEND

# --- Frontend ---
echo "[3/4] Building frontend locally..."
cd "${PROJECT_ROOT}/frontend"
npm ci --silent
npm run build

echo "[4/4] Uploading frontend build..."
rsync -az --delete \
  "${PROJECT_ROOT}/frontend/dist/" \
  "${USER}@${IP}:/tmp/genbi-frontend/"

ssh "${USER}@${IP}" bash -s << 'REMOTE_FRONTEND'
sudo rsync -a /tmp/genbi-frontend/ /var/www/genbi/
sudo chown -R www-data:www-data /var/www/genbi
sudo systemctl restart nginx
REMOTE_FRONTEND

echo ""
echo "=== Deploy complete ==="
echo "Frontend: http://${IP}"
echo "API:      http://${IP}/api/v1/health"
echo "SSH:      ssh ${USER}@${IP}"
