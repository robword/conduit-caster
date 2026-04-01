import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', '..', 'data');
const CONFIG_DIR = process.env.CONFIG_DIR || join(__dirname, '..', '..', '..', 'config');

const CONFIG_PATH = join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  rtmpPath: 'live',
  hostIp: null,
  autoCastOnStreamStart: true,
  stopBehavior: 'grace_period',
  gracePeriodMinutes: 5,
  endScreenUrl: null,
  endScreenDurationSeconds: 10,
  discoveryIntervalSeconds: 30,
  recovery: {
    maxRetries: 2,
    retryBackoffSeconds: 2,
    streamGapToleranceSeconds: 30,
  },
  devices: [],
  tailscale: {
    enabled: false,
  },
};

let config = null;

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig() {
  ensureDir(DATA_DIR);
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    // Ensure nested defaults
    config.recovery = { ...DEFAULT_CONFIG.recovery, ...config.recovery };
    config.tailscale = { ...DEFAULT_CONFIG.tailscale, ...config.tailscale };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
  return config;
}

export function getConfig() {
  if (!config) loadConfig();
  return config;
}

export function saveConfig(newConfig) {
  config = { ...config, ...newConfig };
  if (newConfig.recovery) {
    config.recovery = { ...config.recovery, ...newConfig.recovery };
  }
  if (newConfig.tailscale) {
    config.tailscale = { ...config.tailscale, ...newConfig.tailscale };
  }
  ensureDir(DATA_DIR);
  atomicWrite(CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, filePath);
}

export function writeMediamtxConfig(lanIp) {
  ensureDir(CONFIG_DIR);
  const cfg = getConfig();
  const yaml = `api: yes
apiAddress: :9997

rtmp: yes
rtmpAddress: :1935

hls: yes
hlsAddress: :8888
hlsAlwaysRemux: yes
hlsSegmentCount: 3
hlsSegmentDuration: 1s

paths:
  ~^${cfg.rtmpPath}:
    runOnReady: >
      curl -sf -X POST http://backend:3000/api/webhook/stream
      -H 'Content-Type: application/json'
      -d '{"event":"start","path":"$MTX_PATH"}'
    runOnNotReady: >
      curl -sf -X POST http://backend:3000/api/webhook/stream
      -H 'Content-Type: application/json'
      -d '{"event":"stop","path":"$MTX_PATH"}'
`;
  atomicWrite(join(CONFIG_DIR, 'mediamtx.yml'), yaml);
}

export function writeGo2rtcConfig(lanIp, tailscaleIp) {
  ensureDir(CONFIG_DIR);
  const cfg = getConfig();
  const candidates = [`    - ${lanIp || '127.0.0.1'}:${process.env.GO2RTC_ICE_PORT || 8555}`];
  if (tailscaleIp) {
    candidates.push(`    - ${tailscaleIp}:${process.env.GO2RTC_ICE_PORT || 8555}`);
  }

  const yaml = `api:
  listen: :1984

streams:
  ${cfg.rtmpPath}: http://mediamtx:8888/${cfg.rtmpPath}/index.m3u8

webrtc:
  listen: :8555
  candidates:
${candidates.join('\n')}
`;
  atomicWrite(join(CONFIG_DIR, 'go2rtc.yaml'), yaml);
}

export async function reloadMediamtx() {
  const url = process.env.MEDIAMTX_API_URL || 'http://mediamtx:9997';
  try {
    await fetch(`${url}/v3/config/global/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  } catch (err) {
    console.warn('Failed to reload MediaMTX:', err.message);
  }
}

export async function reloadGo2rtc() {
  const url = process.env.GO2RTC_API_URL || 'http://go2rtc:1984';
  try {
    await fetch(`${url}/api/restart`, { method: 'POST' });
  } catch (err) {
    console.warn('Failed to reload go2rtc:', err.message);
  }
}
