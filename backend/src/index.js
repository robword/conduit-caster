import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadConfig, getConfig, writeMediamtxConfig, writeGo2rtcConfig } from './services/configService.js';
import { getLanIp, getTailscaleIp } from './services/networkService.js';
import { getVersions } from './services/versionService.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import webhookRoutes from './routes/webhook.js';
import streamRoutes from './routes/stream.js';
import { initWebSocket } from './services/websocketService.js';
import { setCallbacks as setStreamCallbacks, startPolling as startStreamPolling } from './services/streamMonitor.js';
import { startDiscovery } from './services/discoveryService.js';
import { startCasting, stopCasting, resetStates, cancelGracePeriod } from './services/castManager.js';
import devicesRoutes from './routes/devices.js';
import castRoutes from './routes/cast.js';
import configRoutes from './routes/config.js';
import previewRoutes from './routes/preview.js';
import tailscaleRoutes from './routes/tailscale.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- Unauthenticated routes ---

// Health check
const startTime = Date.now();
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor((Date.now() - startTime) / 1000) });
});

// Version
app.get('/api/version', (req, res) => {
  res.json(getVersions());
});

// Auth routes
app.use('/api/auth', authRoutes);

// Webhook (unauthenticated — called by MediaMTX)
app.use('/api/webhook', webhookRoutes);

// Network context (unauthenticated — frontend needs before login)
app.get('/api/network/context', async (req, res) => {
  const { getNetworkContext } = await import('./services/networkService.js');
  res.json(await getNetworkContext(req.ip));
});

// --- Authenticated routes ---
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/version' || req.path.startsWith('/auth') || req.path.startsWith('/webhook') || req.path === '/network/context') {
    return next();
  }
  requireAuth(req, res, next);
});

// Stream status
app.use('/api/stream', streamRoutes);

// Devices
app.use('/api/devices', devicesRoutes);

// Cast
app.use('/api/cast', castRoutes);

// Config
app.use('/api/config', configRoutes);

// Preview (WebRTC signaling + HLS proxy)
app.use('/api/preview', previewRoutes);

// Tailscale
app.use('/api/tailscale', tailscaleRoutes);

// --- Static files & SPA fallback ---

app.use(express.static(join(__dirname, '..', 'public')));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Initialize and start
async function start() {
  loadConfig();
  const config = getConfig();

  const lanIp = await getLanIp();
  const tailscaleIp = getTailscaleIp();

  if (!config.hostIp) {
    config.hostIp = lanIp;
  }

  writeMediamtxConfig(lanIp);
  writeGo2rtcConfig(lanIp, tailscaleIp);

  console.log(`Network: LAN IP ${lanIp}, Tailscale IP ${tailscaleIp || 'not detected'}`);

  // Initialize WebSocket
  initWebSocket(server);

  // Wire stream monitor to cast manager
  setStreamCallbacks({
    onStart: (path) => {
      const cfg = getConfig();
      resetStates();
      cancelGracePeriod();
      if (cfg.autoCastOnStreamStart) {
        startCasting();
      }
    },
    onStop: (path) => {
      const cfg = getConfig();
      stopCasting(cfg.stopBehavior);
    },
  });

  // Start device discovery
  startDiscovery();

  // Poll MediaMTX for stream status (webhook curl not available in scratch image)
  startStreamPolling();

  server.listen(PORT, () => {
    console.log(`Conduit Caster backend listening on port ${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
