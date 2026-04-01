import { Router } from 'express';
import { startCasting, stopCasting, getStatus } from '../services/castManager.js';

const router = Router();

// POST /api/cast/start
router.post('/start', async (req, res) => {
  try {
    await startCasting();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cast/stop
router.post('/stop', async (req, res) => {
  try {
    await stopCasting();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cast/status
router.get('/status', (req, res) => {
  res.json(getStatus());
});

export default router;
