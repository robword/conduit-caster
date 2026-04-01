import { Router } from 'express';
import { getConfig, saveConfig, writeMediamtxConfig, writeGo2rtcConfig, reloadMediamtx, reloadGo2rtc } from '../services/configService.js';
import { getLanIp, getTailscaleIp } from '../services/networkService.js';
import { startDiscovery, stopDiscovery } from '../services/discoveryService.js';

const router = Router();

// GET /api/config
router.get('/', (req, res) => {
  res.json(getConfig());
});

// PUT /api/config
router.put('/', async (req, res) => {
  const oldConfig = getConfig();
  const newConfig = saveConfig(req.body);

  const lanIp = await getLanIp();
  const tailscaleIp = getTailscaleIp();

  // Rewrite service configs if relevant settings changed
  const pathChanged = req.body.rtmpPath !== undefined && req.body.rtmpPath !== oldConfig.rtmpPath;
  if (pathChanged || req.body.hostIp !== undefined) {
    writeMediamtxConfig(lanIp);
    writeGo2rtcConfig(lanIp, tailscaleIp);
    await Promise.all([reloadMediamtx(), reloadGo2rtc()]);
  }

  // Restart discovery if interval changed
  if (req.body.discoveryIntervalSeconds !== undefined && req.body.discoveryIntervalSeconds !== oldConfig.discoveryIntervalSeconds) {
    stopDiscovery();
    startDiscovery();
  }

  res.json(newConfig);
});

export default router;
