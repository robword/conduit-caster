import { Router } from 'express';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getTailscaleIp } from '../services/networkService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', '..', 'data');

const router = Router();

// POST /api/tailscale/setup — write auth key
router.post('/setup', (req, res) => {
  const { authKey } = req.body;
  if (!authKey) {
    return res.status(400).json({ error: 'Auth key required' });
  }

  const tsDir = join(DATA_DIR, 'tailscale');
  if (!existsSync(tsDir)) {
    mkdirSync(tsDir, { recursive: true });
  }

  writeFileSync(join(tsDir, 'authkey'), authKey, 'utf-8');
  res.json({ ok: true });
});

// GET /api/tailscale/status
router.get('/status', (req, res) => {
  const tailscaleIp = getTailscaleIp();

  res.json({
    connected: !!tailscaleIp,
    ip: tailscaleIp,
    hostname: null, // Would need to query tailscale CLI for this
  });
});

export default router;
