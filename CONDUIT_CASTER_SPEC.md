# Conduit Caster — Implementation Specification
> Version: 1.0 (pre-implementation)

## Project Overview

Conduit Caster is a self-contained, Docker Compose–based appliance that:
- Ingests an RTMP stream from a Blackmagic ATEM Mini Pro
- Detects stream start/stop events
- Discovers Chromecast devices on the local LAN via mDNS
- Casts the stream to user-selected Chromecasts (triggering CEC TV power-on natively)
- Stops casting (and optionally powers off TVs) when the stream ends
- Provides a React-based web UI for all configuration, monitoring, and live preview
- Optionally exposes the UI over Tailscale with HTTPS

### Target Platform
- **Primary:** Raspberry Pi 4/5 (arm64), x86_64 mini PC
- **OS:** Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, Debian 12, Raspberry Pi OS 64-bit (Bookworm)
- **Not supported:** macOS, Windows (Docker Desktop networking limitations preclude mDNS)

---

## Repository Structure

```
conduit-caster/
├── VERSION                            # Single source of truth for app version (e.g. 1.0.0)
├── versions.json                      # Pinned dependency versions (baked into image at build)
├── install.sh                         # Bootstrap script (primary entry point)
├── docker-compose.yml
├── docker-compose.tailscale.yml       # Optional Tailscale override
├── .env.example
├── config/                            # Runtime-generated service config files
│   ├── mediamtx.yml                   # Written/managed by backend configService
│   └── go2rtc.yaml                    # Written/managed by backend configService
├── data/                              # Persisted app data (volume mount)
│   ├── config.json                    # App config
│   ├── credentials.json               # Admin credentials
│   └── tailscale/                     # Tailscale state (if enabled)
├── backend/
│   ├── Dockerfile                     # Multi-stage: builds frontend, then backend runtime
│   ├── package.json
│   └── src/
│       ├── index.js                   # Express entrypoint
│       ├── routes/
│       │   ├── auth.js
│       │   ├── stream.js
│       │   ├── devices.js
│       │   ├── cast.js
│       │   ├── config.js
│       │   ├── version.js
│       │   ├── network.js             # Network context (LAN vs Tailscale detection)
│       │   ├── preview.js             # WebRTC signaling proxy + HLS proxy
│       │   └── webhook.js
│       ├── services/
│       │   ├── castManager.js         # Chromecast cast orchestration
│       │   ├── discoveryService.js    # mDNS Chromecast discovery
│       │   ├── go2rtcClient.js        # go2rtc REST API wrapper
│       │   ├── mediamtxClient.js      # MediaMTX REST API wrapper
│       │   ├── configService.js       # Config read/write + service config rewriting
│       │   ├── streamMonitor.js       # Stream state machine + gap tolerance
│       │   ├── networkService.js      # Host IP, Tailscale IP detection
│       │   └── versionService.js      # Reads versions.json, exposes version info
│       └── middleware/
│           └── auth.js
├── frontend/                          # Built into backend Docker image via multi-stage
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Devices.jsx
│       │   ├── StreamConfig.jsx
│       │   ├── CastSettings.jsx
│       │   ├── About.jsx              # Version info page
│       │   └── Setup.jsx              # First-run wizard
│       └── components/
│           ├── StreamStatus.jsx
│           ├── DeviceCard.jsx
│           ├── DeviceSelector.jsx
│           ├── ConfigForm.jsx
│           └── StreamPreview.jsx      # WebRTC or HLS depending on network context
└── docs/
    ├── setup.md
    └── troubleshooting.md
```

---

## Versioning Strategy

### Version File
- `VERSION` at repo root is the single source of truth: `1.0.0`
- `versions.json` lists all pinned dependency versions:

```json
{
  "app": "1.0.0",
  "mediamtx": "1.9.1",
  "mediamtxDigest": "sha256:abc123...",
  "go2rtc": "1.9.4",
  "go2rtcDigest": "sha256:def456...",
  "node": "20"
}
```

### Image Publishing
- Backend image built and published to **GitHub Container Registry (GHCR)**:
  `ghcr.io/org/conduit-caster:1.0.0`
- Tagged with both semver version and `latest`
- Built for `linux/amd64` and `linux/arm64` via GitHub Actions multi-platform build
- `versions.json` baked into the image at build time (`COPY versions.json /app/`)

### Dependency Pinning
All third-party images are pinned by **digest** in `docker-compose.yml`:
```yaml
image: bluenviron/mediamtx:1.9.1@sha256:abc123...
image: alexxit/go2rtc:1.9.4@sha256:def456...
```
This guarantees reproducibility regardless of upstream tag changes.

### Release Process
1. Update `VERSION` and `versions.json`
2. Tag git commit: `git tag v1.0.0`
3. GitHub Actions builds + pushes GHCR image, creates GitHub Release with tarball
4. `install.sh --version 1.0.0` downloads that specific release tarball

### Semver Convention
- **Patch** (1.0.x): Bug fixes, dependency updates
- **Minor** (1.x.0): New features, backward-compatible
- **Major** (x.0.0): Breaking changes to config schema or API

---

## Bootstrap Script (`install.sh`)

Primary deployment artifact. Idempotent — safe to re-run.

### Usage

```bash
# Latest release (tarball)
curl -fsSL https://raw.githubusercontent.com/org/conduit-caster/main/install.sh | bash

# Dev mode (clone repo)
curl -fsSL https://raw.githubusercontent.com/org/conduit-caster/main/install.sh | bash -s -- --dev

# Specific version
curl -fsSL https://raw.githubusercontent.com/org/conduit-caster/main/install.sh | bash -s -- --version 1.0.0
```

### Script Flags

| Flag | Description |
|---|---|
| `--dev` | Clone repo instead of downloading tarball |
| `--version X.Y.Z` | Install specific release version |
| `--install-dir /path` | Override install directory (default: `~/conduit-caster`) |
| `--skip-docker` | Skip Docker install check |
| `--skip-avahi` | Skip Avahi install/config (advanced) |
| `--no-start` | Install only, do not start services |

### Script Steps (in order)

**1. Preflight checks**
- OS check: Ubuntu 22.04/24.04, Debian 12, Raspberry Pi OS 64-bit
- Architecture check: x86_64, arm64/aarch64
- Non-root user with sudo access
- Port conflict check: 1935, 3000, 8555, 8888

**2. Install Docker + Compose plugin**
- `curl -fsSL https://get.docker.com | sh`
- Add current user to `docker` group
- Enable + start Docker service

**3. Configure Avahi + systemd-resolved**

Disable systemd-resolved mDNS, let Avahi own it fully:

```bash
# Disable systemd-resolved mDNS
sudo sed -i 's/#MulticastDNS=yes/MulticastDNS=no/' /etc/systemd/resolved.conf
sudo systemctl restart systemd-resolved

# Install Avahi
sudo apt-get install -y avahi-daemon avahi-utils

# Enable mDNS reflector, disable IPv6
sudo tee /etc/avahi/avahi-daemon.conf > /dev/null <<EOF
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
EOF

sudo systemctl enable avahi-daemon
sudo systemctl restart avahi-daemon
```

Smoke test (warn, don't fail if no Chromecasts found yet):
```bash
avahi-browse _googlecast._tcp --terminate 2>/dev/null \
  && echo "✓ Avahi mDNS working" \
  || echo "⚠ No Chromecasts found yet (normal if none are powered on)"
```

**4. Fetch application files**
- Default: download release tarball from GitHub Releases → extract to install dir
- `--dev`: `git clone https://github.com/org/conduit-caster <install-dir>`
- `--version X.Y.Z`: download specific release tarball

**5. Configure environment**
- Copy `.env.example` → `.env` if not present
- Create `config/` and `data/` with correct ownership (`chown $USER:$USER`)
- Set `chmod 700 data/`

**6. Pull images and start**
```bash
docker compose pull
docker compose up -d
```
Poll `http://localhost:3000/api/health` every 3s for up to 60s.

**7. Print summary**
```
✓ Conduit Caster v1.0.0 is running!

  Web UI:      http://192.168.1.100:3000
  RTMP input:  rtmp://192.168.1.100:1935/live

Point your ATEM Mini Pro RTMP output to the address above.
Open the Web UI to complete first-run setup.

Optional Tailscale:
  docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d
```

---

## Services

### 1. MediaMTX
- **Image:** `bluenviron/mediamtx:<version>@sha256:<digest>` (pinned)
- **Role:** RTMP ingest from ATEM, HLS output for Chromecasts
- **Network:** `conduit-caster` bridge
- **Exposed ports:** `0.0.0.0:1935:1935` (RTMP), `0.0.0.0:8888:8888` (HLS — Chromecast pull)
- **Note:** 8888 must be LAN-exposed for Chromecast HLS pull. Proxying HLS
  through the backend would add unacceptable CPU overhead on Pi hardware.

### 2. go2rtc
- **Image:** `alexxit/go2rtc:<version>@sha256:<digest>` (pinned)
- **Role:** Repackage HLS from MediaMTX as WebRTC for browser preview.
  **Does not handle Chromecast casting.**
- **Network:** `conduit-caster` bridge
- **Exposed ports:**
  - `1984`: **NOT exposed** — internal only (go2rtc admin API)
  - `0.0.0.0:8555:8555` (TCP/UDP) — WebRTC ICE media only
- **ICE config:** go2rtc configured with host LAN IP (and Tailscale IP if active)
  as ICE candidates so browsers can reach the media stream

### 3. Backend (Node.js / Express)
- **Build:** Multi-stage Dockerfile (see below)
- **Role:** Orchestration, Chromecast discovery + casting, config management,
  WebRTC signaling proxy, HLS preview proxy (Tailscale path only), REST API, WebSocket
- **Network:** `conduit-caster` bridge
- **Exposed ports:** `0.0.0.0:3000:3000` (sole UI/API entry point)
- **npm dependencies include:** `node-castv2-client`, `http-proxy-middleware`,
  `express`, `ws`, `bcrypt`, `jsonwebtoken`, `uuid`

### 4. Tailscale (Optional)
- **Image:** `tailscale/tailscale:latest`
- **Role:** Expose port 3000 over Tailscale with automatic HTTPS
- **Network:** `conduit-caster` bridge
- **Activation:** `docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d`

---

## Docker Compose

```yaml
# docker-compose.yml
services:
  mediamtx:
    image: bluenviron/mediamtx:1.9.1@sha256:DIGEST_HERE
    restart: unless-stopped
    ports:
      - "0.0.0.0:1935:1935"
      - "0.0.0.0:8888:8888"
    volumes:
      - ./config/mediamtx.yml:/mediamtx.yml:ro
    networks:
      - conduit-caster
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8888/v3/paths/list"]
      interval: 10s
      timeout: 5s
      retries: 5

  go2rtc:
    image: alexxit/go2rtc:1.9.4@sha256:DIGEST_HERE
    restart: unless-stopped
    ports:
      - "0.0.0.0:8555:8555"     # WebRTC ICE media only — not the admin API
    volumes:
      - ./config/go2rtc.yaml:/config/go2rtc.yaml:ro
    networks:
      - conduit-caster
    depends_on:
      mediamtx:
        condition: service_healthy

  backend:
    image: ghcr.io/org/conduit-caster:${APP_VERSION:-latest}
    restart: unless-stopped
    ports:
      - "0.0.0.0:3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MEDIAMTX_API_URL=http://mediamtx:8888
      - GO2RTC_API_URL=http://go2rtc:1984
      - GO2RTC_ICE_PORT=8555
      - DATA_DIR=/data
      - CONFIG_DIR=/config
    volumes:
      - ./data:/data
      - ./config:/config
    networks:
      - conduit-caster
    depends_on:
      mediamtx:
        condition: service_healthy
      go2rtc:
        condition: service_started
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  conduit-caster:
    driver: bridge
```

```yaml
# docker-compose.tailscale.yml
services:
  tailscale:
    image: tailscale/tailscale:latest
    restart: unless-stopped
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    volumes:
      - ./data/tailscale:/var/lib/tailscale
      - /dev/net/tun:/dev/net/tun
    environment:
      - TS_AUTHKEY_FILE=/var/lib/tailscale/authkey
      - TS_SERVE_CONFIG=/var/lib/tailscale/serve.json
      - TS_STATE_DIR=/var/lib/tailscale
    networks:
      - conduit-caster
```

---

## Dockerfile (Multi-Stage)

```dockerfile
# backend/Dockerfile

# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY ../frontend/package*.json ./
RUN npm ci
COPY ../frontend/ ./
RUN npm run build

# ── Stage 2: Backend runtime ─────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# System deps for node-castv2-client mDNS (avahi-compat on host handles reflection;
# container just needs standard DNS resolution tools)
RUN apk add --no-cache wget

# Backend dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Backend source
COPY backend/src/ ./src/

# Frontend build output served as static files
COPY --from=frontend-build /frontend/dist ./public/

# Version info baked in at build time
COPY versions.json ./versions.json

EXPOSE 3000
CMD ["node", "src/index.js"]
```

**Build args for CI:**
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/org/conduit-caster:1.0.0 \
  --tag ghcr.io/org/conduit-caster:latest \
  --push .
```

---

## Port Exposure Summary

| Port | LAN Exposed | Purpose | Rationale |
|---|---|---|---|
| 1935 | ✅ | RTMP ingest (ATEM) | Must be LAN-reachable by ATEM hardware |
| 3000 | ✅ | UI + API + preview proxy | Sole user-facing entry point |
| 8555 | ✅ | WebRTC ICE media (go2rtc) | WebRTC media cannot be proxied; narrow port only |
| 8888 | ✅ | MediaMTX HLS (Chromecast pull) | Proxying HLS would tax Pi CPU unacceptably |
| 1984 | ❌ | go2rtc admin API | Internal only — never LAN-exposed |

---

## mDNS / Avahi Configuration

### Approach
Avahi daemon runs on the host with `enable-reflector=yes`, bridging mDNS
multicast between the physical LAN interface and the Docker bridge interface.
systemd-resolved mDNS is disabled (`MulticastDNS=no`) to avoid port 5353
conflicts. Avahi owns mDNS exclusively.

All containers remain on the standard `conduit-caster` bridge network.
No `network_mode: host` is used anywhere.

### Discovery Implementation (`discoveryService.js`)
- Browse `_googlecast._tcp.local` via `node-castv2-client`
- Poll on `config.discoveryIntervalSeconds` interval (default: 30s)
- Merge discovered devices with manually-added devices
- Persist device cache in `data/config.json`
- Emit `device_discovered` / `device_lost` WebSocket events

### Fallback: Static IP Entry
If Chromecasts are on a different VLAN or mDNS is blocked, users add devices
manually by IP + name in the UI. Document VLAN limitations in
`docs/troubleshooting.md`.

---

## Video Preview

### Strategy: WebRTC on LAN, HLS fallback over Tailscale

The frontend detects its network context via `GET /api/network/context` and
selects the appropriate preview method:

| Access path | Preview method | Latency | Proxy CPU cost |
|---|---|---|---|
| LAN (direct) | WebRTC via go2rtc | < 1s | None (direct ICE) |
| Tailscale (remote) | HLS proxied through backend | 2–6s | Low (remote users only) |

### WebRTC Path (LAN)

1. Frontend calls `GET /api/network/context` → `{ tailscale: false }`
2. Frontend requests WebRTC via `GET /api/preview/webrtc?src=live`
3. Backend proxies SDP signaling to `http://go2rtc:1984/api/webrtc?src=live`
4. go2rtc responds with SDP answer including ICE candidates:
   - LAN IP: `<hostLanIp>:8555`
   - Tailscale IP: `<hostTailscaleIp>:8555` (if Tailscale active)
5. Browser connects directly to go2rtc ICE endpoint for media (port 8555)
6. TV-quality preview renders in `<StreamPreview>` component

### HLS Path (Tailscale)

1. Frontend calls `GET /api/network/context` → `{ tailscale: true }`
2. Frontend requests HLS via `GET /api/preview/hls/live/index.m3u8`
3. Backend proxies HLS from `http://mediamtx:8888/live/index.m3u8`
4. Frontend plays via native `<video>` HLS (hls.js for browsers without native support)
5. Preview renders with ~2–6s latency — acceptable for remote monitoring

### Network Context Detection (`networkService.js`)

```javascript
// Detect Tailscale interface IP
const interfaces = os.networkInterfaces()
const tailscaleIp = Object.entries(interfaces)
  .find(([name]) => name === 'tailscale0')
  ?.[1]?.find(i => i.family === 'IPv4')?.address ?? null

// Detect LAN IP via default route
// Shell out: ip route get 1 → parse 'src <ip>'
const lanIp = await getDefaultRouteIp() // shells: ip route get 1

// Detect if incoming request is from Tailscale subnet
// Compare req.ip against Tailscale CGNAT range (100.64.0.0/10)
const isTailscaleRequest = (ip) => isInSubnet(ip, '100.64.0.0/10')
```

### go2rtc ICE Configuration (`configService.js`)

go2rtc config is rewritten when network state changes (Tailscale up/down):

```yaml
# config/go2rtc.yaml
api:
  listen: :1984

streams:
  live: http://mediamtx:8888/live/index.m3u8

webrtc:
  listen: :8555
  candidates:
    - 192.168.1.100:8555  # LAN IP — always present
    - 100.x.y.z:8555      # Tailscale IP — added when Tailscale is active
```

---

## Error Recovery

### Chromecast Drop (`castManager.js`)

If a Chromecast disconnects mid-cast (network blip, TV manually powered off):

1. `node-castv2-client` emits error/disconnect event
2. castManager marks device as `retrying`
3. Emit `cast_retrying` WebSocket event → UI shows retry indicator
4. Exponential backoff retry:
   - Attempt 1: wait `retryBackoffSeconds` (default: 2s)
   - Attempt 2: wait `retryBackoffSeconds * 2` (default: 4s)
5. On success: mark device `casting`, emit `cast_start`
6. After `maxRetries` failures: mark device `errored`, emit `cast_error`
7. Device resets to `idle` on next stream start event

### Stream Gap Tolerance (`streamMonitor.js`)

If the stream drops and restarts within the tolerance window:

1. MediaMTX fires `stream_stop` webhook
2. `streamMonitor` starts a gap timer (`streamGapToleranceSeconds`, default: 30s)
3. Cast sessions are **held open** — Chromecasts stall on last frame
4. If stream resumes within window: emit `stream_resume`, cast sessions continue
5. If gap exceeds window: treat as genuine stop, run normal stop behavior

### Recovery Config (stored in `data/config.json`)

```json
"recovery": {
  "maxRetries": 2,
  "retryBackoffSeconds": 2,
  "streamGapToleranceSeconds": 30
}
```

All three values are configurable in the UI under Cast Settings.

### WebSocket Events for Recovery

```json
{ "type": "cast_retrying", "payload": { "deviceId": "uuid", "attempt": 1, "maxRetries": 2 } }
{ "type": "stream_gap",    "payload": { "secondsElapsed": 5, "toleranceSeconds": 30 } }
{ "type": "stream_resume", "payload": { "gapSeconds": 7 } }
```

---

## Stream Flow (End to End)

```
ATEM Mini Pro
    │ RTMP → 0.0.0.0:1935
    ▼
MediaMTX (bridge)
    ├── HLS internal → http://mediamtx:8888/live/index.m3u8
    │     └── go2rtc pulls this for WebRTC repackaging
    │     └── backend proxies this for Tailscale HLS preview
    ├── HLS external → http://<hostLanIp>:8888/live/index.m3u8
    │     └── Chromecasts pull directly (LAN only)
    └── Webhook → http://backend:3000/api/webhook/stream
                        │
              streamMonitor.js
                        │
          ┌─────────────┴──────────────┐
       ON START                    ON STOP / GAP
          │                            │
          ├── Broadcast stream_start   ├── Start gap timer
          └── castManager              │   (hold cast sessions)
              .startCasting()          │
                    │                  ├── If gap > tolerance:
              node-castv2-client       │   castManager.stopCasting()
                    │                  │
              Chromecasts (LAN)        └── If stream resumes:
                    │                      Broadcast stream_resume
              TV on via CEC                (cast sessions survive)

go2rtc (bridge) — WebRTC preview only
    ├── Pulls HLS from mediamtx:8888
    └── Serves WebRTC → browser via ICE on port 8555
          (signaling proxied through backend:3000/api/preview/webrtc)
```

---

## Casting Flow

```
castManager.startCasting(deviceList)
  └── For each target device:
        ├── Connect via node-castv2-client (device LAN IP)
        ├── Launch DefaultMediaReceiver
        ├── Load: http://<hostLanIp>:8888/<rtmpPath>/index.m3u8
        ├── TV powers on via HDMI-CEC (Chromecast native)
        └── Emit cast_start WebSocket event

castManager.stopCasting(deviceList, stopBehavior)
  ├── 'immediate'    → disconnect all sessions now
  ├── 'grace_period' → setTimeout(gracePeriodMinutes)
  │                    emit grace_countdown every 10s
  │                    then disconnect
  └── 'end_screen'   → load endScreenUrl
                       wait endScreenDurationSeconds
                       then disconnect
```

---

## MediaMTX Configuration Template

```yaml
# Written by configService.js — ${variables} substituted at write time
api: yes
apiAddress: :8888

rtmp: yes
rtmpAddress: :1935

hls: yes
hlsAddress: :8888
hlsAlwaysRemux: yes
hlsSegmentCount: 3
hlsSegmentDuration: 1s

paths:
  ${rtmpPath}:
    runOnReady: >
      curl -sf -X POST http://backend:3000/api/webhook/stream
      -H 'Content-Type: application/json'
      -d '{"event":"start","path":"$MTX_PATH"}'
    runOnNotReady: >
      curl -sf -X POST http://backend:3000/api/webhook/stream
      -H 'Content-Type: application/json'
      -d '{"event":"stop","path":"$MTX_PATH"}'
```

---

## go2rtc Configuration Template

```yaml
# Written by configService.js
api:
  listen: :1984

streams:
  ${rtmpPath}: http://mediamtx:8888/${rtmpPath}/index.m3u8

webrtc:
  listen: :8555
  candidates:
    ${iceCandidates}   # Substituted: LAN IP always; Tailscale IP if active
```

---

## Backend API

### Health (unauthenticated)
- `GET /api/health` → `{ status: "ok", uptime: <seconds> }`

### Version (unauthenticated)
- `GET /api/version` → full versions.json contents

### Auth
- `GET /api/auth/status` → `{ firstRun: bool }`
- `POST /api/auth/setup` → first-run credential setup
- `POST /api/auth/login` → `{ token }`
- `POST /api/auth/logout`

### Network
- `GET /api/network/context` → `{ lanIp, tailscaleIp, tailscaleHostname, isTailscale: bool }`

### Stream
- `GET /api/stream/status` → `{ active, path, startedAt, uptime, gapActive }`
- `POST /api/webhook/stream` → internal MediaMTX webhook (unauthenticated)

### Devices
- `GET /api/devices` → all devices with cast + discovery state
- `POST /api/devices/discover` → trigger immediate mDNS re-scan
- `POST /api/devices` → manually add `{ name, ip }`
- `DELETE /api/devices/:id`
- `PATCH /api/devices/:id` → update `{ name, isTarget }`

### Cast
- `POST /api/cast/start` → manually cast to all targets
- `POST /api/cast/stop` → stop all sessions
- `GET /api/cast/status` → per-device state

### Config
- `GET /api/config` → full config
- `PUT /api/config` → update; rewrites mediamtx.yml + go2rtc.yaml + triggers reload

### Preview
- `GET /api/preview/webrtc` → proxy to `http://go2rtc:1984/api/webrtc` (signaling)
- `GET /api/preview/hls/*` → proxy to `http://mediamtx:8888/*` (HLS segments — Tailscale path)

### Tailscale
- `POST /api/tailscale/setup` → write auth key to `data/tailscale/authkey`
- `GET /api/tailscale/status` → `{ connected, hostname, ip }`

---

## WebSocket Events

```json
{ "type": "stream_start",    "payload": { "path": "live", "timestamp": "..." } }
{ "type": "stream_stop",     "payload": { "path": "live", "timestamp": "..." } }
{ "type": "stream_gap",      "payload": { "secondsElapsed": 5, "toleranceSeconds": 30 } }
{ "type": "stream_resume",   "payload": { "gapSeconds": 7 } }
{ "type": "cast_start",      "payload": { "deviceId": "uuid", "deviceName": "..." } }
{ "type": "cast_stop",       "payload": { "deviceId": "uuid", "reason": "stream_ended|manual|error" } }
{ "type": "cast_retrying",   "payload": { "deviceId": "uuid", "attempt": 1, "maxRetries": 2 } }
{ "type": "cast_error",      "payload": { "deviceId": "uuid", "error": "..." } }
{ "type": "grace_countdown", "payload": { "secondsRemaining": 180 } }
{ "type": "device_discovered","payload": { "id": "uuid", "ip": "...", "name": "..." } }
{ "type": "device_lost",     "payload": { "id": "uuid" } }
```

---

## Frontend Pages

### Setup Wizard (`/setup`, first-run only)
1. **Welcome** — what Conduit Caster does
2. **Admin credentials** — set username + password
3. **Stream path** — confirm RTMP path; display ATEM destination string
4. **Discover devices** — trigger scan, list results, select targets
5. **Cast behavior** — stop mode, grace period, end screen, recovery settings
6. **Done** — summary + link to dashboard

### Dashboard (`/`)
- LIVE / WAITING / GAP / ERROR badge with uptime timer
- `<StreamPreview>` component (WebRTC or HLS based on network context)
- Per-device cast status cards (casting / idle / retrying / errored)
- Global cast start/stop buttons
- Re-discover shortcut

### Devices (`/devices`)
- All discovered + manual devices with status
- Toggle `isTarget` per device
- Manual add form (name + IP)
- Re-scan button
- Per-device: IP, last seen, cast state, remove (manual only)

### Stream Config (`/config/stream`)
- RTMP path input
- Auto-detected host LAN IP with copy button
- Full ATEM destination: `rtmp://<ip>:1935/<path>`
- Stream health + last activity

### Cast Settings (`/config/cast`)
- Auto-cast on stream start toggle
- Stop behavior: Immediate / Grace period / End screen
- Grace period: 1–30 minutes
- End screen URL + display duration
- Recovery: max retries, retry backoff, stream gap tolerance

### Tailscale (`/config/tailscale`)
- Connection status
- Auth key input (write-only)
- `*.ts.net` hostname + IP once connected
- Enable/disable

### About (`/about`)
```
Conduit Caster  v1.0.0
MediaMTX        v1.9.1
go2rtc          v1.9.4
Node.js         v20.x

© 2026 — MIT License
GitHub: github.com/org/conduit-caster
```

---

## Configuration Schema (`data/config.json`)

```json
{
  "rtmpPath": "live",
  "hostIp": "192.168.1.100",
  "autoCastOnStreamStart": true,
  "stopBehavior": "grace_period",
  "gracePeriodMinutes": 5,
  "endScreenUrl": null,
  "endScreenDurationSeconds": 10,
  "discoveryIntervalSeconds": 30,
  "recovery": {
    "maxRetries": 2,
    "retryBackoffSeconds": 2,
    "streamGapToleranceSeconds": 30
  },
  "devices": [
    {
      "id": "uuid-v4",
      "name": "Sanctuary TV",
      "ip": "192.168.1.50",
      "source": "discovered",
      "isTarget": true,
      "lastSeen": "2026-01-01T00:00:00Z"
    }
  ],
  "tailscale": {
    "enabled": false
  }
}
```

---

## Credentials Schema (`data/credentials.json`)

```json
{
  "username": "admin",
  "passwordHash": "<bcrypt, cost 12>",
  "jwtSecret": "<64-char random hex, generated on first run>"
}
```

---

## Environment Variables (`.env`)

```env
APP_VERSION=1.0.0
PORT=3000
NODE_ENV=production
MEDIAMTX_API_URL=http://mediamtx:8888
GO2RTC_API_URL=http://go2rtc:1984
GO2RTC_ICE_PORT=8555
DATA_DIR=/data
CONFIG_DIR=/config
```

---

## Key Implementation Notes for Claude Code

### Host IP Detection (`networkService.js`)
```javascript
// Shell out to get default route source IP — most reliable cross-distro method
const { stdout } = await exec('ip route get 1')
// Parse: "1.0.0.0 via 192.168.1.1 dev eth0 src 192.168.1.100 ..."
const match = stdout.match(/src (\d+\.\d+\.\d+\.\d+)/)
const lanIp = match?.[1] ?? null
```

### Tailscale IP Detection (`networkService.js`)
```javascript
const interfaces = os.networkInterfaces()
const tailscaleIp = Object.entries(interfaces)
  .find(([name]) => name === 'tailscale0')
  ?.[1]?.find(i => i.family === 'IPv4' && !i.internal)?.address ?? null
```

### Tailscale Request Detection
Tailscale uses CGNAT range `100.64.0.0/10`. Compare `req.ip` against this
range to determine if a request is coming via Tailscale. Use `ipaddr.js` npm
package for subnet matching.

### go2rtc Config Rewrite Trigger
Rewrite `go2rtc.yaml` and reload go2rtc when:
- User saves config (rtmpPath change)
- Tailscale connects or disconnects (ICE candidates change)
- Backend detects host IP change on startup

### Config File Rewriting (`configService.js`)
- MediaMTX reload: `POST http://mediamtx:8888/v3/config/global/patch` — verify
  exact endpoint against current MediaMTX API docs before implementing
- go2rtc reload: `POST http://go2rtc:1984/api/restart` — verify against current
  go2rtc docs
- Write config files atomically (write to `.tmp`, then rename) to avoid
  partial-write corruption

### Casting (`castManager.js`)
- Track active `Client` instances in `Map<deviceId, { client, retryCount, retryTimer }>`
- On disconnect: clear existing retry timer before starting new one
- Grace period: store `setTimeout` handle in module scope so it can be cancelled
  if stream resumes within tolerance window
- Emit `grace_countdown` event via `setInterval` during grace period; clear on cancel

### mDNS Discovery (`discoveryService.js`)
- Handle DNS-SD timeouts gracefully — log warnings, never crash the service
- De-duplicate by IP address across discovery cycles
- On `device_lost`: only remove from in-memory list, not from `config.json`
  (user-selected targets persist; they just show as "not seen recently")

### Security
- Webhook endpoint (`/api/webhook/stream`): unauthenticated but log source IP;
  optionally restrict to Docker bridge subnet (`172.16.0.0/12`)
- Never log JWT tokens, passwords, or Tailscale auth keys
- `chmod 600 data/credentials.json` after write
- JWT secret: `crypto.randomBytes(32).toString('hex')` on first run

### Frontend (`StreamPreview.jsx`)
- On mount: call `GET /api/network/context`
- If `isTailscale: false`: initialize WebRTC using go2rtc signaling endpoint
  proxied via `/api/preview/webrtc`
- If `isTailscale: true`: initialize hls.js pointing at `/api/preview/hls/live/index.m3u8`
- Show latency indicator in UI (WebRTC: "Live", HLS: "~5s delay")
- Handle preview gracefully when stream is not active (show placeholder, not error)

---

## Supported OS Matrix

| OS | Architecture | Supported | Notes |
|---|---|---|---|
| Ubuntu 22.04 LTS | x86_64 | ✅ | Primary dev/test target |
| Ubuntu 24.04 LTS | x86_64 | ✅ | |
| Ubuntu 22.04 LTS | arm64 | ✅ | Pi 4/5 with Ubuntu Server |
| Raspberry Pi OS 64-bit | arm64 | ✅ | Bookworm recommended |
| Debian 12 | x86_64 / arm64 | ✅ | |
| macOS | any | ❌ | Docker Desktop mDNS limitation |
| Windows | any | ❌ | Docker Desktop mDNS limitation |

---

## Out of Scope (Future Iterations)

- **Remote RTMP ingest via Tailscale** — travel router/hotspot running OpenWrt +
  Tailscale as subnet router (transparent to ATEM), or OBS on Tailscale
- macOS / Windows native app support
- Pre-built Pi Imager / x86 ISO images
- Multi-stream support (more than one ATEM source)
- User roles beyond single admin credential
- Recording / DVR functionality
- HTTPS without Tailscale
- Android TV / Roku / Smart TV native API casting
- Cloud relay beyond Tailscale
