import { broadcast } from './websocketService.js';
import { getConfig } from './configService.js';

// Stream states: 'idle', 'active', 'gap'
let state = 'idle';
let currentPath = null;
let startedAt = null;
let gapTimer = null;
let gapInterval = null;
let gapStartedAt = null;

// Callbacks wired by index.js
let onStreamStart = null;
let onStreamStop = null;

export function setCallbacks({ onStart, onStop }) {
  onStreamStart = onStart;
  onStreamStop = onStop;
}

export function handleStreamEvent(event, path) {
  if (event === 'start') {
    handleStart(path);
  } else if (event === 'stop') {
    handleStop(path);
  }
}

function handleStart(path) {
  if (state === 'gap') {
    // Stream resumed within tolerance window
    clearGapTimers();
    const gapSeconds = gapStartedAt ? Math.floor((Date.now() - gapStartedAt) / 1000) : 0;
    state = 'active';
    currentPath = path;
    console.log(`Stream resumed after ${gapSeconds}s gap`);
    broadcast('stream_resume', { gapSeconds });
    return;
  }

  // Fresh start
  state = 'active';
  currentPath = path;
  startedAt = Date.now();
  console.log(`Stream started: ${path}`);
  broadcast('stream_start', { path, timestamp: new Date().toISOString() });

  if (onStreamStart) {
    onStreamStart(path);
  }
}

function handleStop(path) {
  if (state !== 'active') return;

  const config = getConfig();
  const toleranceSeconds = config.recovery?.streamGapToleranceSeconds ?? 30;

  state = 'gap';
  gapStartedAt = Date.now();
  console.log(`Stream stopped, entering gap tolerance (${toleranceSeconds}s)`);

  // Broadcast gap progress every second
  gapInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - gapStartedAt) / 1000);
    broadcast('stream_gap', {
      secondsElapsed: elapsed,
      toleranceSeconds,
    });
  }, 1000);

  // Gap expiry timer
  gapTimer = setTimeout(() => {
    clearGapTimers();
    state = 'idle';
    currentPath = null;
    const stoppedAt = new Date().toISOString();
    console.log('Stream gap expired — treating as genuine stop');
    broadcast('stream_stop', { path, timestamp: stoppedAt });

    if (onStreamStop) {
      onStreamStop(path);
    }
  }, toleranceSeconds * 1000);
}

function clearGapTimers() {
  if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
  if (gapInterval) { clearInterval(gapInterval); gapInterval = null; }
  gapStartedAt = null;
}

export function getStatus() {
  return {
    active: state === 'active',
    state,
    path: currentPath,
    startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    uptime: startedAt && state === 'active' ? Math.floor((Date.now() - startedAt) / 1000) : null,
    gapActive: state === 'gap',
    gapElapsed: state === 'gap' && gapStartedAt ? Math.floor((Date.now() - gapStartedAt) / 1000) : null,
  };
}
