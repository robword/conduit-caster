import { Router } from 'express';
import { readFileSync, writeFileSync, chmodSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { isFirstRun, getCredentials } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..', '..', 'data');
const CREDENTIALS_PATH = join(DATA_DIR, 'credentials.json');

const router = Router();

// GET /api/auth/status — unauthenticated
router.get('/status', (req, res) => {
  res.json({ firstRun: isFirstRun() });
});

// POST /api/auth/setup — first-run only
router.post('/setup', async (req, res) => {
  if (!isFirstRun()) {
    return res.status(409).json({ error: 'Credentials already configured' });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const jwtSecret = crypto.randomBytes(32).toString('hex');

  const credentials = { username, passwordHash, jwtSecret };

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), 'utf-8');
  try {
    chmodSync(CREDENTIALS_PATH, 0o600);
  } catch {
    // chmod may fail on some systems (Windows)
  }

  const token = jwt.sign({ username }, jwtSecret, { expiresIn: '7d' });
  res.json({ token });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const creds = getCredentials();
  if (!creds) {
    return res.status(401).json({ error: 'Not configured', firstRun: true });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (username !== creds.username) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, creds.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ username }, creds.jwtSecret, { expiresIn: '7d' });
  res.json({ token });
});

// POST /api/auth/logout — stateless JWT, just a placeholder
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

export default router;
