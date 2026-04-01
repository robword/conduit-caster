import { Router } from 'express';
import { getStatus } from '../services/streamMonitor.js';

const router = Router();

// GET /api/stream/status
router.get('/status', (req, res) => {
  res.json(getStatus());
});

export default router;
