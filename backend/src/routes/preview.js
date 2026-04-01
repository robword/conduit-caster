import { Router } from 'express';

const router = Router();

const GO2RTC_URL = process.env.GO2RTC_API_URL || 'http://go2rtc:1984';
const MEDIAMTX_URL = process.env.MEDIAMTX_API_URL || 'http://mediamtx:8888';

// GET /api/preview/webrtc — proxy WebRTC signaling to go2rtc
router.get('/webrtc', async (req, res) => {
  try {
    const url = `${GO2RTC_URL}/api/webrtc?${new URLSearchParams(req.query)}`;
    const response = await fetch(url);
    const data = await response.text();
    res.set('Content-Type', response.headers.get('content-type') || 'application/sdp');
    res.send(data);
  } catch (err) {
    res.status(502).json({ error: 'go2rtc unavailable', details: err.message });
  }
});

// POST /api/preview/webrtc — proxy SDP offer to go2rtc
router.post('/webrtc', async (req, res) => {
  try {
    const url = `${GO2RTC_URL}/api/webrtc?${new URLSearchParams(req.query)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': req.headers['content-type'] || 'application/sdp' },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
    });
    const data = await response.text();
    res.set('Content-Type', response.headers.get('content-type') || 'application/sdp');
    res.status(response.status).send(data);
  } catch (err) {
    res.status(502).json({ error: 'go2rtc unavailable', details: err.message });
  }
});

// GET /api/preview/hls/* — proxy HLS from MediaMTX (used for Tailscale path)
router.get('/hls/*', async (req, res) => {
  try {
    const hlsPath = req.params[0];
    const url = `${MEDIAMTX_URL}/${hlsPath}`;
    const response = await fetch(url);

    res.set('Content-Type', response.headers.get('content-type') || 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-cache');

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(502).json({ error: 'MediaMTX unavailable', details: err.message });
  }
});

export default router;
