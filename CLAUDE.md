# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Conduit Caster is a Docker Compose-based appliance that ingests RTMP streams from a Blackmagic ATEM Mini Pro, discovers Chromecast devices via mDNS, and casts the stream to selected Chromecasts with CEC TV power-on. It provides a React web UI for configuration, monitoring, and live preview, with optional Tailscale remote access.

**Target platforms:** Raspberry Pi 4/5 (arm64) and x86_64 mini PCs running Ubuntu 22.04/24.04, Debian 12, or Raspberry Pi OS 64-bit. Not supported on macOS or Windows due to Docker Desktop mDNS limitations.

## Authoritative Specification

`CONDUIT_CASTER_SPEC.md` is the comprehensive implementation spec. Consult it for detailed API contracts, WebSocket event schemas, configuration schemas, error recovery logic, and implementation notes. All implementation should follow this spec.

## Architecture

Four Docker Compose services on a shared bridge network (`conduit-caster`):

- **MediaMTX** — RTMP ingest from ATEM, HLS output. Fires webhooks to backend on stream start/stop.
- **go2rtc** — Repackages MediaMTX HLS as WebRTC for low-latency browser preview. Does NOT handle Chromecast casting.
- **Backend (Node.js/Express)** — Orchestration hub: Chromecast discovery (mDNS via node-castv2-client), cast management, config management, REST API, WebSocket events, WebRTC signaling proxy, HLS proxy for Tailscale.
- **Tailscale (optional)** — Remote HTTPS access via Docker Compose override file.

### Key data flow
```
ATEM → RTMP:1935 → MediaMTX → webhook → backend/streamMonitor → castManager → Chromecasts (pull HLS from MediaMTX:8888)
                              → HLS → go2rtc → WebRTC:8555 → browser preview
```

### Networking
- mDNS handled by host-level Avahi with reflector enabled (bridges multicast between LAN and Docker bridge)
- No containers use `network_mode: host`
- Chromecasts pull HLS directly from MediaMTX:8888 on LAN (not proxied through backend — Pi CPU constraint)

## Tech Stack

- **Backend:** Node.js 20, Express, node-castv2-client, ws, bcrypt, jsonwebtoken
- **Frontend:** React, Vite, hls.js — built into backend Docker image via multi-stage Dockerfile
- **Infrastructure:** Docker Compose, Avahi, MediaMTX, go2rtc

## Build & Run Commands

```bash
# Development (backend)
cd backend && npm install && npm start

# Development (frontend)
cd frontend && npm install && npm run dev

# Docker build (multi-stage: frontend assets + backend runtime)
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/org/conduit-caster:latest .

# Run all services
docker compose up -d

# Run with Tailscale
docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d

# Health check
curl http://localhost:3000/api/health
```

## Versioning

- `VERSION` file at repo root is the single source of truth
- `versions.json` pins all dependency versions by digest
- Both are baked into the Docker image at build time

## Ports

| Port | Service | Purpose |
|------|---------|---------|
| 1935 | MediaMTX | RTMP ingest from ATEM |
| 3000 | Backend | UI + API (sole user-facing entry point) |
| 8555 | go2rtc | WebRTC ICE media (browser preview) |
| 8888 | MediaMTX | HLS (Chromecast pull + go2rtc source) |
| 1984 | go2rtc | Admin API — internal only, never exposed |

## Key Design Decisions

- **Preview strategy:** WebRTC (< 1s latency) on LAN via go2rtc; HLS fallback (~2-6s) over Tailscale. Frontend auto-detects via `/api/network/context`.
- **Stream gap tolerance:** When stream drops, cast sessions are held open for a configurable window (default 30s). If stream resumes within window, casts continue seamlessly.
- **Config rewriting:** Backend owns `config/mediamtx.yml` and `config/go2rtc.yaml`, rewriting them atomically (write .tmp, then rename) when config changes or Tailscale state changes.
- **Webhook:** MediaMTX `runOnReady`/`runOnNotReady` hooks POST to `/api/webhook/stream` — unauthenticated but IP-logged.
- **Credentials:** bcrypt (cost 12) + JWT with 64-char random hex secret generated on first run. Stored in `data/credentials.json` with 600 permissions.
