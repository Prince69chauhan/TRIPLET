#!/usr/bin/env bash
# ============================================================
#  Triplet — one-shot VM bootstrap for Oracle Cloud Always Free
#  Target: Ubuntu 22.04 on Ampere A1 (ARM64) or AMD E2 (x86_64)
#
#  Run AFTER cloning the repo, from the repo root:
#    bash deploy/oracle-setup.sh
#
#  What it does:
#   1. Installs docker + docker compose plugin
#   2. Opens firewall ports 80 + 443 (Oracle's iptables blocks them by default)
#   3. Patches requirements.txt for ARM64 if needed (torch +cpu has no arm64 wheel)
#   4. Generates RSA keys for the integrity service
#   5. Creates .env from .env.production.example if missing
#   6. Verifies DOMAIN's DNS A record resolves to this VM's public IP
#   7. Builds and starts the stack (Caddy obtains Let's Encrypt cert on first run)
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\n\033[1;34m[setup]\033[0m %s\n' "$*"; }
err() { printf '\n\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

# ── 1. Docker ────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  UBUNTU_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

  sudo usermod -aG docker "$USER"
  log "Docker installed. You may need to log out + back in for group membership to apply."
else
  log "Docker already present — skipping install."
fi

# ── 2. Firewall (Oracle VMs have restrictive default iptables) ──
open_port() {
  local port=$1 proto=${2:-tcp}
  if sudo iptables -C INPUT -p "$proto" --dport "$port" -j ACCEPT 2>/dev/null; then
    log "Port $port/$proto rule already present."
  else
    sudo iptables -I INPUT 6 -p "$proto" --dport "$port" -m state --state NEW,ESTABLISHED -j ACCEPT
  fi
}
log "Opening ports 80, 443 on host firewall..."
open_port 80  tcp
open_port 443 tcp
open_port 443 udp   # HTTP/3
if ! command -v netfilter-persistent >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
fi
sudo netfilter-persistent save
log "Reminder: also open ports 80 and 443 in your Oracle VCN Security List (web console)."

# ── 3. ARM64 torch-wheel workaround ─────────────────────────
ARCH="$(uname -m)"
if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
  REQ=backend/requirements.txt
  if grep -q "^torch==2.3.0+cpu" "$REQ"; then
    log "ARM64 detected — patching $REQ (torch +cpu has no aarch64 wheel)..."
    # Drop the PyTorch CPU index line (PyPI has aarch64 wheels already)
    sed -i '/^--extra-index-url https:\/\/download.pytorch.org\/whl\/cpu/d' "$REQ"
    # Replace torch==2.3.0+cpu with plain torch==2.3.0
    sed -i 's/^torch==2.3.0+cpu/torch==2.3.0/' "$REQ"
    log "Patched. (This change is local to the VM — do not commit it.)"
  fi
fi

# ── 4. RSA keys for integrity service ───────────────────────
KEY_DIR="$REPO_ROOT/backend/keys"
if [[ ! -f "$KEY_DIR/private_key.pem" ]]; then
  log "Generating RSA keys for integrity service..."
  mkdir -p "$KEY_DIR"
  openssl genpkey -algorithm RSA -out "$KEY_DIR/private_key.pem" -pkeyopt rsa_keygen_bits:2048
  openssl rsa -in "$KEY_DIR/private_key.pem" -pubout -out "$KEY_DIR/public_key.pem"
  chmod 600 "$KEY_DIR/private_key.pem"
fi
# Mount keys into the named volume path expected by compose
# (docker-compose.prod.yml uses a named volume `backend_keys` → /app/keys)
# We copy keys in on first start via a one-shot container below.

# ── 5. .env ─────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  if [[ -f .env.production.example ]]; then
    log "Creating .env from .env.production.example — YOU MUST EDIT IT NOW."
    cp .env.production.example .env
    err "Edit .env: set DOMAIN + ACME_EMAIL and replace every CHANGE_ME value."
    err "Then point your domain's DNS A record at this VM's public IP and wait for it to propagate."
    err "Re-run: bash deploy/oracle-setup.sh"
    exit 1
  else
    err ".env.production.example missing — aborting."
    exit 1
  fi
fi

if grep -q "CHANGE_ME" .env; then
  err ".env still contains CHANGE_ME placeholders — fill them in first."
  exit 1
fi

# ── 6. DNS sanity check ─────────────────────────────────────
# Source .env to read DOMAIN (ignore quoting — it's a simple KEY=value file).
set -a; source .env; set +a
if [[ -z "${DOMAIN:-}" ]]; then
  err "DOMAIN not set in .env — aborting."
  exit 1
fi

log "Checking DNS: $DOMAIN should resolve to this VM's public IP..."
VM_IP="$(curl -fsSL --max-time 5 https://api.ipify.org || echo '')"
DNS_IP="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -n1 || true)"
if [[ -n "$VM_IP" && -n "$DNS_IP" && "$VM_IP" == "$DNS_IP" ]]; then
  log "DNS OK: $DOMAIN → $DNS_IP"
elif [[ -z "$DNS_IP" ]]; then
  err "$DOMAIN does not resolve yet. Add an A record pointing to $VM_IP and wait for propagation."
  err "Check with: dig +short $DOMAIN   or   nslookup $DOMAIN"
  exit 1
else
  err "DNS mismatch: $DOMAIN → $DNS_IP, but this VM's public IP is $VM_IP."
  err "Fix the A record before continuing (Let's Encrypt will fail otherwise and trigger rate limits)."
  exit 1
fi

# ── 7. Build & start ────────────────────────────────────────
log "Building images (first run takes 10–15 min on ARM)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

log "Starting stack..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Copy RSA keys into the named volume now that backend container exists
log "Seeding RSA keys into backend_keys volume..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml cp \
  "$KEY_DIR/private_key.pem" backend:/app/keys/private_key.pem
docker compose -f docker-compose.yml -f docker-compose.prod.yml cp \
  "$KEY_DIR/public_key.pem"  backend:/app/keys/public_key.pem
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend celery_worker celery_beat

log "Done. Check status: docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
log "Logs: docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
log "Caddy cert issuance can take ~30s on first start. Watch with:"
log "  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy"
log "Once you see 'certificate obtained successfully', visit: https://$DOMAIN"
