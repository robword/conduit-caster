# Conduit Caster Setup Guide

## Requirements

- Raspberry Pi 4/5 (arm64) or x86_64 mini PC
- Ubuntu 22.04/24.04 LTS, Debian 12, or Raspberry Pi OS 64-bit (Bookworm)
- Network access to Chromecast devices (same LAN/VLAN)
- Blackmagic ATEM Mini Pro (or any RTMP source)

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/org/conduit-caster/main/install.sh | bash
```

This will:
1. Install Docker and Compose plugin
2. Configure Avahi for mDNS Chromecast discovery
3. Download and start Conduit Caster
4. Print the Web UI and RTMP addresses

## Install Options

```bash
# Dev mode (clone repo instead of downloading release)
curl -fsSL ... | bash -s -- --dev

# Specific version
curl -fsSL ... | bash -s -- --version 1.0.0

# Custom install directory
curl -fsSL ... | bash -s -- --install-dir /opt/conduit-caster

# Skip Docker install (if already installed)
curl -fsSL ... | bash -s -- --skip-docker

# Skip Avahi setup (if already configured)
curl -fsSL ... | bash -s -- --skip-avahi
```

## First-Run Setup

1. Open the Web UI at `http://<your-ip>:3000`
2. Complete the setup wizard:
   - Create admin credentials
   - Confirm RTMP stream path
   - Discover or manually add Chromecast devices
   - Configure cast behavior
3. Configure your ATEM Mini Pro RTMP output to `rtmp://<your-ip>:1935/live`

## ATEM Mini Pro Configuration

1. Open ATEM Software Control
2. Go to Output > Streaming
3. Set Platform to "Custom"
4. Set Server to `rtmp://<conduit-caster-ip>:1935/live`
5. Set Key to any value (not used, but ATEM requires it)
6. Click "On Air" to start streaming

## Tailscale (Optional Remote Access)

```bash
docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d
```

1. Enter your Tailscale auth key in the Web UI under Tailscale settings
2. Access the UI remotely via your `*.ts.net` hostname
3. Preview will automatically switch to HLS mode over Tailscale

## Ports

| Port | Purpose |
|------|---------|
| 1935 | RTMP ingest (point ATEM here) |
| 3000 | Web UI and API |
| 8555 | WebRTC preview (auto-negotiated) |
| 8888 | HLS stream (Chromecast pull) |
