#!/usr/bin/env bash
# One-time setup of Courier Hub on the server that already runs ParentVox.
# After this, every push to main/dev deploys automatically (.github/workflows/deploy.yml).
#
#   sudo bash deploy/setup-server.sh prod courier.example.com
#   sudo bash deploy/setup-server.sh dev  courier-dev.example.com
#
# Safe to run again: existing .env files, database and data are kept.
# It never touches ParentVox: separate folder, ports, services, database and nginx site.

set -euo pipefail

ENV_NAME="${1:-}"
DOMAIN="${2:-}"
REPO="${REPO:-https://github.com/JaiPrakashRjp/LABcourier.git}"

case "$ENV_NAME" in
  prod) NAME=courierhub;     DIR=/opt/courierhub;     BRANCH=main; API_PORT=8200; WEB_PORT=3200; DB=courier_hub ;;
  dev)  NAME=courierhub-dev; DIR=/opt/courierhub-dev; BRANCH=dev;  API_PORT=8201; WEB_PORT=3201; DB=courier_hub_dev ;;
  *) echo "Usage: sudo bash $0 prod|dev <domain>"; exit 1 ;;
esac
[ -n "$DOMAIN" ] || { echo "Give the domain, e.g. courier.example.com"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo"; exit 1; }

DATA=/var/lib/$NAME
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "Checking ports $API_PORT and $WEB_PORT are free"
for port in "$API_PORT" "$WEB_PORT"; do
  if ss -ltn "( sport = :$port )" | grep -q LISTEN && ! systemctl is-active --quiet "$NAME-api" "$NAME-web"; then
    echo "Port $port is already used by something else. Change API_PORT/WEB_PORT in this script and the workflow."; exit 1
  fi
done

for cmd in git python3.12 node npm psql nginx; do
  command -v "$cmd" >/dev/null || { echo "Missing $cmd. Install it first (ParentVox should already have most of these)."; exit 1; }
done

say "Code in $DIR (branch $BRANCH)"
if [ ! -d "$DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO" "$DIR"
else
  git -C "$DIR" fetch origin "$BRANCH" && git -C "$DIR" reset --hard "origin/$BRANCH"
fi

say "Python environment"
[ -d "$DIR/venv" ] || python3.12 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -q --upgrade pip
"$DIR/venv/bin/pip" install -q -r "$DIR/backend/requirements.txt"

say "Database $DB"
DB_PASS_FILE=/root/.$NAME-db-password
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB'" | grep -q 1; then
  "$DIR/venv/bin/python" -c "import secrets; print(secrets.token_urlsafe(24))" > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
  sudo -u postgres psql -c "CREATE ROLE $DB LOGIN PASSWORD '$(cat "$DB_PASS_FILE")'"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  sudo -u postgres createdb -O "$DB" "$DB"
fi
# The search index needs pg_trgm, which only a superuser can add.
sudo -u postgres psql -d "$DB" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm" >/dev/null

say "Backend settings (backend/.env)"
ENV_FILE="$DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  [ -f "$DB_PASS_FILE" ] || { echo "Database role $DB exists but its password file $DB_PASS_FILE is missing. Write backend/.env by hand."; exit 1; }
  rand() { "$DIR/venv/bin/python" -c "import secrets; print(secrets.token_urlsafe(48))"; }
  FERNET=$("$DIR/venv/bin/python" -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgresql+psycopg://$DB:$(cat "$DB_PASS_FILE")@localhost:5432/$DB
JWT_SECRET=$(rand)
WEBHOOK_SECRET=$(rand)
# Keep this safe and never change it: it unlocks the courier API keys stored in the database.
CREDENTIALS_ENCRYPTION_KEY=$FERNET
ACCESS_TOKEN_MINUTES=15
SESSION_HOURS=24
COOKIE_SECURE=true
STORAGE_DIR=$DATA
TRACKING_POLL_MINUTES=30
EOF
  echo "Created $ENV_FILE"
else
  echo "Keeping existing $ENV_FILE"
fi
chown root:www-data "$ENV_FILE"
chmod 640 "$ENV_FILE"

say "Storage for labels and return photos ($DATA)"
mkdir -p "$DATA"
chown -R www-data:www-data "$DATA"

say "Database tables"
(cd "$DIR/backend" && "$DIR/venv/bin/alembic" upgrade head)

say "Website build"
echo "BACKEND_URL=http://127.0.0.1:$API_PORT" > "$DIR/frontend/.env.production.local"
(cd "$DIR/frontend" && npm ci --no-audit --no-fund && npm run build)
chown -R www-data:www-data "$DIR/frontend/.next"

say "Services: $NAME-api, $NAME-web, $NAME-tracking"
NPM=$(command -v npm)
cat > "/etc/systemd/system/$NAME-api.service" <<EOF
[Unit]
Description=Courier Hub API ($ENV_NAME)
After=network.target postgresql.service

[Service]
User=www-data
WorkingDirectory=$DIR/backend
ExecStart=$DIR/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $API_PORT --workers 2 --proxy-headers
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/systemd/system/$NAME-tracking.service" <<EOF
[Unit]
Description=Courier Hub tracking checker ($ENV_NAME)
After=network.target postgresql.service

[Service]
User=www-data
WorkingDirectory=$DIR/backend
ExecStart=$DIR/venv/bin/python -m app.workers.tracking
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/systemd/system/$NAME-web.service" <<EOF
[Unit]
Description=Courier Hub website ($ENV_NAME)
After=network.target $NAME-api.service

[Service]
User=www-data
WorkingDirectory=$DIR/frontend
Environment=NODE_ENV=production
ExecStart=$NPM run start -- -H 127.0.0.1 -p $WEB_PORT
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$NAME-api" "$NAME-web" "$NAME-tracking"
systemctl restart "$NAME-api" "$NAME-web" "$NAME-tracking"

say "nginx site for $DOMAIN"
SITE=/etc/nginx/sites-available/$NAME
if [ ! -f "$SITE" ]; then
  cat > "$SITE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Return photos: up to 5 photos of 5 MB each.
    client_max_body_size 30m;

    # The website also forwards /api/v1/* (including courier webhooks) to the API.
    location / {
        proxy_pass http://127.0.0.1:$WEB_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
EOF
  ln -sf "$SITE" "/etc/nginx/sites-enabled/$NAME"
else
  echo "Keeping existing $SITE"
fi
nginx -t && systemctl reload nginx

say "Checking the API"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null; then echo "API is up"; break; fi
  sleep 2
  [ "$i" -eq 20 ] && { echo "API did not start - check: journalctl -u $NAME-api -n 100"; exit 1; }
done

cat <<EOF

Done. Next:
  1. Point $DOMAIN's DNS (A record) at this server, then turn on HTTPS
     (sign-in needs it because the session cookie is secure):
       sudo certbot --nginx -d $DOMAIN
  2. Create the first admin:
       cd $DIR/backend && sudo -u www-data $DIR/venv/bin/python -m app.scripts.create_admin --company "Your Company" --name "Admin" --phone 9876543210
  3. Add courier API keys:
       cd $DIR/backend && sudo -u www-data $DIR/venv/bin/python -m app.scripts.set_api_key --company-id 1 --courier SHADOWFAX --label main --env UAT
  4. Courier webhook URLs:
       https://$DOMAIN/api/v1/webhooks/india-post/<WEBHOOK_SECRET from $ENV_FILE>
       https://$DOMAIN/api/v1/webhooks/shadowfax/<WEBHOOK_SECRET from $ENV_FILE>
EOF
