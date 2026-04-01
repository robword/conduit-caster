#!/usr/bin/env bash
set -euo pipefail

# Conduit Caster Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/org/conduit-caster/main/install.sh | bash

REPO="robword/conduit-caster"
DEFAULT_INSTALL_DIR="$HOME/conduit-caster"
INSTALL_DIR=""
VERSION=""
DEV_MODE=false
SKIP_DOCKER=false
SKIP_AVAHI=false
NO_START=false

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --dev) DEV_MODE=true; shift ;;
    --version) VERSION="$2"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --skip-docker) SKIP_DOCKER=true; shift ;;
    --skip-avahi) SKIP_AVAHI=true; shift ;;
    --no-start) NO_START=true; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── 1. Preflight checks ─────────────────────────────────────────────────────

echo "Conduit Caster Installer"
echo "========================"
echo ""

# OS check
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  case "$ID" in
    ubuntu)
      case "$VERSION_ID" in
        22.04|24.04) info "OS: Ubuntu $VERSION_ID" ;;
        *) warn "Untested Ubuntu version: $VERSION_ID" ;;
      esac
      ;;
    debian)
      if [[ "${VERSION_ID:-}" == "12" ]]; then
        info "OS: Debian 12"
      else
        warn "Untested Debian version: ${VERSION_ID:-unknown}"
      fi
      ;;
    raspbian)
      info "OS: Raspberry Pi OS"
      ;;
    *)
      warn "Untested OS: $ID"
      ;;
  esac
else
  error "Cannot detect OS. This script requires Linux."
fi

# Architecture check
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) info "Architecture: x86_64" ;;
  aarch64|arm64) info "Architecture: arm64" ;;
  *) error "Unsupported architecture: $ARCH" ;;
esac

# Non-root with sudo
if [[ $EUID -eq 0 ]]; then
  error "Do not run as root. Run as a regular user with sudo access."
fi

if ! sudo -n true 2>/dev/null; then
  echo "This script requires sudo access."
  sudo true || error "sudo access required"
fi

# Port check
for port in 1935 3000 8555 8888; do
  if ss -tlnp 2>/dev/null | grep -q ":${port} " || netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
    warn "Port $port is already in use"
  fi
done

echo ""

# ── 2. Install Docker ───────────────────────────────────────────────────────

if [[ "$SKIP_DOCKER" == false ]]; then
  if command -v docker &>/dev/null; then
    info "Docker already installed: $(docker --version)"
  else
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    info "Docker installed"
  fi

  # Add user to docker group
  if ! groups | grep -q docker; then
    sudo usermod -aG docker "$USER"
    info "Added $USER to docker group"
  fi

  # Ensure Docker is enabled and running
  sudo systemctl enable docker
  sudo systemctl start docker

  # Check for Compose plugin
  if ! docker compose version &>/dev/null && ! sudo docker compose version &>/dev/null; then
    error "Docker Compose plugin not found. Install it: sudo apt-get install docker-compose-plugin"
  fi
  info "Docker Compose: $(docker compose version --short 2>/dev/null || sudo docker compose version --short)"
else
  info "Skipping Docker install"
fi

# Use sudo for docker commands if current session doesn't have docker group access
DOCKER="docker"
if ! docker info &>/dev/null 2>&1; then
  DOCKER="sudo docker"
fi

echo ""

# ── 3. Configure Avahi ──────────────────────────────────────────────────────

if [[ "$SKIP_AVAHI" == false ]]; then
  echo "Configuring Avahi for mDNS..."

  # Disable systemd-resolved mDNS
  if [[ -f /etc/systemd/resolved.conf ]]; then
    sudo sed -i 's/#MulticastDNS=yes/MulticastDNS=no/' /etc/systemd/resolved.conf
    sudo sed -i 's/MulticastDNS=yes/MulticastDNS=no/' /etc/systemd/resolved.conf
    sudo systemctl restart systemd-resolved 2>/dev/null || true
  fi

  # Install Avahi
  sudo apt-get update -qq
  sudo apt-get install -y -qq avahi-daemon avahi-utils

  # Write Avahi config with reflector enabled
  sudo tee /etc/avahi/avahi-daemon.conf > /dev/null <<'AVAHIEOF'
[server]
use-ipv4=yes
use-ipv6=no
ratelimit-interval-usec=1000000
ratelimit-burst=1000

[wide-area]
enable-wide-area=yes

[publish]
publish-addresses=yes
publish-hinfo=yes
publish-workstation=yes
publish-domain=yes

[reflector]
enable-reflector=yes
reflect-ipv=no

[rlimits]
rlimit-core=0
rlimit-data=4194304
rlimit-fsize=0
rlimit-nofile=768
rlimit-stack=4194304
rlimit-nproc=3
AVAHIEOF

  sudo systemctl enable avahi-daemon
  sudo systemctl restart avahi-daemon

  # Smoke test
  if avahi-browse _googlecast._tcp --terminate 2>/dev/null | grep -q "="; then
    info "Avahi mDNS working — Chromecasts detected"
  else
    warn "No Chromecasts found yet (normal if none are powered on)"
  fi
else
  info "Skipping Avahi setup"
fi

echo ""

# ── 4. Fetch application files ──────────────────────────────────────────────

if [[ "$DEV_MODE" == true ]]; then
  echo "Cloning repository (dev mode)..."
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    cd "$INSTALL_DIR"
    git pull
    info "Repository updated"
  else
    git clone "https://github.com/$REPO" "$INSTALL_DIR"
    info "Repository cloned to $INSTALL_DIR"
  fi
else
  # Try release tarball first, fall back to git clone
  if [[ -z "$VERSION" ]]; then
    RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null || true)
    if echo "$RELEASE_JSON" | grep -q '"tag_name"'; then
      PARSED_TAG=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name": *"v?([^"]+)".*/\1/')
      # Only accept clean semver (e.g., 1.0.0)
      if [[ "$PARSED_TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        VERSION="$PARSED_TAG"
      fi
    fi
  fi

  FETCHED=false
  if [[ -n "$VERSION" && "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Downloading release v${VERSION}..."
    TARBALL_URL="https://github.com/$REPO/releases/download/v${VERSION}/conduit-caster-${VERSION}.tar.gz"
    mkdir -p "$INSTALL_DIR"
    if curl -fsSL "$TARBALL_URL" | tar xz -C "$INSTALL_DIR" --strip-components=1 2>/dev/null; then
      info "Downloaded v${VERSION} to $INSTALL_DIR"
      FETCHED=true
    else
      warn "Release tarball not found"
    fi
  fi

  if [[ "$FETCHED" == false ]]; then
    echo "No release available — cloning repository instead..."
    if [[ -d "$INSTALL_DIR/.git" ]]; then
      cd "$INSTALL_DIR"
      git pull
      info "Repository updated"
    else
      git clone "https://github.com/$REPO" "$INSTALL_DIR"
      info "Repository cloned to $INSTALL_DIR"
    fi
    DEV_MODE=true  # Need to build locally since there's no pre-built image
  fi
fi

cd "$INSTALL_DIR"

# ── 5. Configure environment ────────────────────────────────────────────────

if [[ ! -f .env ]]; then
  cp .env.example .env
  info "Created .env from .env.example"
fi

# Set HOST_IP in .env so the backend knows the real LAN IP (not Docker bridge)
LAN_IP=$(ip route get 1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I | awk '{print $1}')
if grep -q '^HOST_IP=' .env; then
  sed -i "s/^HOST_IP=.*/HOST_IP=${LAN_IP}/" .env
else
  echo "HOST_IP=${LAN_IP}" >> .env
fi
info "Host IP: ${LAN_IP}"

mkdir -p config data
chown "$USER:$USER" config data
chmod 700 data

# Bootstrap config files so Docker can mount them as files (not directories)
LAN_IP=$(ip route get 1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I | awk '{print $1}')

if [[ ! -f config/mediamtx.yml ]]; then
  cat > config/mediamtx.yml <<MTXEOF
api: yes
apiAddress: :9997
authInternalUsers: []
rtmp: yes
rtmpAddress: :1935
hls: yes
hlsAddress: :8888
hlsAlwaysRemux: yes
hlsSegmentCount: 7
hlsSegmentDuration: 1s
paths:
  ~^live:
    runOnReady: >
      curl -sf -X POST http://backend:3000/api/webhook/stream
      -H 'Content-Type: application/json'
      -d '{"event":"start","path":"\$MTX_PATH"}'
    runOnNotReady: >
      curl -sf -X POST http://backend:3000/api/webhook/stream
      -H 'Content-Type: application/json'
      -d '{"event":"stop","path":"\$MTX_PATH"}'
MTXEOF
  info "Created bootstrap mediamtx.yml"
fi

if [[ ! -f config/go2rtc.yaml ]]; then
  cat > config/go2rtc.yaml <<G2REOF
api:
  listen: :1984
streams:
  live: http://mediamtx:8888/live/index.m3u8
webrtc:
  listen: :8555
  candidates:
    - ${LAN_IP:-127.0.0.1}:8555
G2REOF
  info "Created bootstrap go2rtc.yaml"
fi

info "Directories configured"

echo ""

# ── 6. Pull and start ───────────────────────────────────────────────────────

if [[ "$NO_START" == true ]]; then
  info "Installation complete (--no-start specified)"
else
  echo "Pulling Docker images..."
  $DOCKER compose pull 2>/dev/null || true

  if [[ "$DEV_MODE" == true ]]; then
    echo "Building backend image (dev mode)..."
    $DOCKER compose build
  fi

  echo "Starting services..."
  $DOCKER compose up -d

  # Health check poll
  echo "Waiting for backend to be ready..."
  for i in $(seq 1 20); do
    if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
      info "Backend is healthy"
      break
    fi
    if [[ $i -eq 20 ]]; then
      warn "Backend health check timed out. Check logs: docker compose logs backend"
    fi
    sleep 3
  done
fi

# ── 7. Summary ──────────────────────────────────────────────────────────────

echo ""
echo "========================================"

# Detect LAN IP
LAN_IP=$(ip route get 1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I | awk '{print $1}')

VERSION_DISPLAY=$(cat VERSION 2>/dev/null || echo "dev")

echo ""
info "Conduit Caster v${VERSION_DISPLAY} is running!"
echo ""
echo "  Web UI:      http://${LAN_IP}:3000"
echo "  RTMP input:  rtmp://${LAN_IP}:1935/live"
echo ""
echo "Point your ATEM Mini Pro RTMP output to the address above."
echo "Open the Web UI to complete first-run setup."
echo ""
echo "Optional Tailscale:"
echo "  docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d"
echo ""
