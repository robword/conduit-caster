import { Router } from 'express';
import { handleStreamEvent } from '../services/streamMonitor.js';

const router = Router();

// POST /api/webhook/stream — unauthenticated (called by MediaMTX)
router.post('/stream', (req, res) => {
  const { event, path } = req.body;

  console.log(`Webhook: ${event} ${path} from ${req.ip}`);

  if (!event || !path) {
    return res.status(400).json({ error: 'Missing event or path' });
  }

  if (event !== 'start' && event !== 'stop') {
    return res.status(400).json({ error: 'Invalid event type' });
  }

  handleStreamEvent(event, path);
  res.json({ ok: true });
});

export default router;
