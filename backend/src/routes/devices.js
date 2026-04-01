import { Router } from 'express';
import { getDevices, discoverNow, addDevice, removeDevice, updateDevice } from '../services/discoveryService.js';
import { getStatus as getCastStatus } from '../services/castManager.js';

const router = Router();

// GET /api/devices
router.get('/', (req, res) => {
  const devices = getDevices();
  const castStatuses = getCastStatus();

  // Merge cast state into device list
  const merged = devices.map(device => {
    const cast = castStatuses.find(s => s.deviceId === device.id);
    return {
      ...device,
      castState: cast?.castState || 'idle',
      retryCount: cast?.retryCount || 0,
    };
  });

  res.json(merged);
});

// POST /api/devices/discover
router.post('/discover', async (req, res) => {
  try {
    const discovered = await discoverNow();
    res.json({ ok: true, found: discovered.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devices — add manually
router.post('/', (req, res) => {
  const { name, ip } = req.body;
  if (!name || !ip) {
    return res.status(400).json({ error: 'Name and IP required' });
  }

  try {
    const device = addDevice(name, ip);
    res.status(201).json(device);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// DELETE /api/devices/:id
router.delete('/:id', (req, res) => {
  try {
    removeDevice(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/devices/:id
router.patch('/:id', (req, res) => {
  try {
    const device = updateDevice(req.params.id, req.body);
    res.json(device);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
