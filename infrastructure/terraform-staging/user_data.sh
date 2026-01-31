#!/bin/bash
exec > /var/log/genbi-setup.log 2>&1
set -x

echo "=== GenBI Staging Setup ==="

# --- System user: cronos (do this FIRST, before anything that can fail) ---
useradd -m -s /bin/bash cronos || true
echo "cronos:${admin_password}" | chpasswd
usermod -aG sudo cronos
echo "cronos ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/cronos

# Enable SSH password auth (Ubuntu 24.04 uses sshd_config.d includes)
echo "PasswordAuthentication yes" > /etc/ssh/sshd_config.d/99-password-auth.conf
echo "KbdInteractiveAuthentication yes" >> /etc/ssh/sshd_config.d/99-password-auth.conf
systemctl restart ssh

# --- System packages ---
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl gnupg lsb-release software-properties-common nginx git

# PostgreSQL 16
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update -y
apt-get install -y postgresql-16 postgresql-client-16

# Python 3.12
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -y
apt-get install -y python3.12 python3.12-venv python3.12-dev

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# --- PostgreSQL config ---
sudo -u postgres psql -c "CREATE USER genbi WITH PASSWORD 'genbi_staging_pwd';" || true
sudo -u postgres psql -c "CREATE DATABASE genbi OWNER genbi;" || true

# --- Application directories ---
mkdir -p /opt/genbi/backend /opt/genbi/frontend /var/www/genbi
useradd -r -s /usr/sbin/nologin genbi || true
chown -R genbi:genbi /opt/genbi

# --- Backend .env (Terraform interpolates these before the script runs) ---
cat > /opt/genbi/backend/.env << ENVEOF
GENBI_METADATA_DB_URL=host=localhost port=5432 dbname=genbi user=genbi password=genbi_staging_pwd
GENBI_ENVIRONMENT=staging
GENBI_AUTH_ENABLED=false
AWS_DEFAULT_REGION=${aws_region}
GENBI_BEDROCK_MODEL_ID=${bedrock_model_id}
GENBI_CORS_ORIGINS=*
ENVEOF
chown genbi:genbi /opt/genbi/backend/.env
chmod 600 /opt/genbi/backend/.env

# --- Systemd service ---
cp /tmp/genbi-backend.service /etc/systemd/system/genbi-backend.service 2>/dev/null || true
systemctl daemon-reload

# --- Nginx config ---
rm -f /etc/nginx/sites-enabled/default
cp /tmp/nginx-genbi.conf /etc/nginx/sites-available/genbi 2>/dev/null || true
ln -sf /etc/nginx/sites-available/genbi /etc/nginx/sites-enabled/genbi
nginx -t && systemctl restart nginx || true

echo "=== GenBI staging base setup complete ==="
echo "Run deploy.sh to upload and start the application."
