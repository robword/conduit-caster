# Conduit Caster

A self-contained Docker Compose appliance that ingests RTMP streams from a Blackmagic ATEM Mini Pro, discovers Chromecast devices via mDNS, and casts the stream to selected Chromecasts with automatic CEC TV power-on.

## Features

- **RTMP ingest** from ATEM Mini Pro (or any RTMP source)
- **Automatic Chromecast discovery** via mDNS with manual fallback
- **One-click casting** to multiple Chromecasts simultaneously
- **CEC TV power-on** — Chromecasts turn on TVs automatically
- **Live preview** — WebRTC (< 1s latency on LAN) or HLS fallback
- **Stream gap tolerance** — holds cast sessions during brief stream drops
- **Grace period** — configurable delay before disconnecting after stream ends
- **Web UI** for configuration, monitoring, and control
- **Optional Tailscale** for remote HTTPS access

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/org/conduit-caster/main/install.sh | bash
```

Then open `http://<your-ip>:3000` and complete the setup wizard.

## Architecture

```
ATEM Mini Pro → RTMP:1935 → MediaMTX → HLS → Chromecasts (LAN)
                                      → go2rtc → WebRTC → Browser Preview
                                      → webhook → Backend → Cast Control
```

Four Docker services on a shared bridge network:
- **MediaMTX** — RTMP ingest, HLS output
- **go2rtc** — WebRTC repackaging for browser preview
- **Backend** — Node.js/Express orchestration, API, WebSocket
- **Tailscale** (optional) — Remote access

## Requirements

- Raspberry Pi 4/5 (arm64) or x86_64 mini PC
- Ubuntu 22.04/24.04, Debian 12, or Raspberry Pi OS 64-bit
- Network access to Chromecast devices

## Documentation

- [Setup Guide](docs/setup.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Implementation Spec](CONDUIT_CASTER_SPEC.md)

## Development

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev

# Docker build
docker compose build
docker compose up -d
```

## License

MIT
