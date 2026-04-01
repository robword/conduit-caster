import { broadcast } from './websocketService.js';
import { getConfig } from './configService.js';
import { getTargetDevices } from './discoveryService.js';
import { getLanIp } from './networkService.js';

// Map<deviceId, { client, retryCount, retryTimer, status }>
const sessions = new Map();
let graceTimer = null;
let graceInterval = null;

let Client, DefaultMediaReceiver;

async function loadCastv2() {
  if (Client) return true;
  try {
    const mod = await import('castv2-client');
    Client = mod.Client;
    DefaultMediaReceiver = mod.DefaultMediaReceiver;
    return true;
  } catch {
    console.warn('castv2-client not available — casting disabled');
    return false;
  }
}

export async function startCasting(devices) {
  if (!await loadCastv2()) return;

  const targets = devices || getTargetDevices();
  const config = getConfig();
  const lanIp = await getLanIp();
  const hlsUrl = `http://${lanIp}:8888/${config.rtmpPath}/index.m3u8`;

  console.log(`Starting cast to ${targets.length} device(s): ${hlsUrl}`);

  for (const device of targets) {
    castToDevice(device, hlsUrl);
  }
}

function castToDevice(device, hlsUrl) {
  const client = new Client();
  const session = { client, retryCount: 0, retryTimer: null, status: 'connecting' };
  sessions.set(device.id, session);

  client.connect(device.ip, () => {
    session.status = 'casting';
    console.log(`Connected to ${device.name} (${device.ip})`);

    client.launch(DefaultMediaReceiver, (err, player) => {
      if (err) {
        console.error(`Failed to launch on ${device.name}:`, err.message);
        handleCastError(device, session);
        return;
      }

      const media = {
        contentId: hlsUrl,
        contentType: 'application/x-mpegURL',
        streamType: 'LIVE',
      };

      player.load(media, { autoplay: true }, (err) => {
        if (err) {
          console.error(`Failed to load media on ${device.name}:`, err.message);
          handleCastError(device, session);
          return;
        }

        console.log(`Casting to ${device.name}`);
        broadcast('cast_start', { deviceId: device.id, deviceName: device.name });
      });
    });
  });

  client.on('error', (err) => {
    console.error(`Cast error on ${device.name}:`, err.message);
    handleCastError(device, session);
  });

  client.on('close', () => {
    if (session.status === 'casting') {
      console.log(`Connection lost to ${device.name}`);
      handleCastError(device, session);
    }
  });
}

function handleCastError(device, session) {
  const config = getConfig();
  const maxRetries = config.recovery?.maxRetries ?? 2;
  const backoffSeconds = config.recovery?.retryBackoffSeconds ?? 2;

  if (session.retryCount >= maxRetries) {
    session.status = 'errored';
    broadcast('cast_error', { deviceId: device.id, error: 'Max retries exceeded' });
    cleanupSession(device.id);
    return;
  }

  session.retryCount++;
  session.status = 'retrying';
  const delay = backoffSeconds * Math.pow(2, session.retryCount - 1) * 1000;

  broadcast('cast_retrying', {
    deviceId: device.id,
    attempt: session.retryCount,
    maxRetries,
  });

  console.log(`Retrying ${device.name} in ${delay / 1000}s (attempt ${session.retryCount}/${maxRetries})`);

  // Clear any existing retry timer
  if (session.retryTimer) clearTimeout(session.retryTimer);

  session.retryTimer = setTimeout(async () => {
    const lanIp = await getLanIp();
    const config = getConfig();
    const hlsUrl = `http://${lanIp}:8888/${config.rtmpPath}/index.m3u8`;
    cleanupSession(device.id);
    castToDevice(device, hlsUrl);
  }, delay);
}

export async function stopCasting(stopBehavior) {
  const config = getConfig();
  const behavior = stopBehavior || config.stopBehavior || 'immediate';

  clearGraceTimers();

  switch (behavior) {
    case 'immediate':
      disconnectAll('stream_ended');
      break;

    case 'grace_period': {
      const minutes = config.gracePeriodMinutes || 5;
      const totalSeconds = minutes * 60;
      let remaining = totalSeconds;

      console.log(`Grace period: ${minutes} minutes before disconnect`);

      graceInterval = setInterval(() => {
        remaining -= 10;
        if (remaining > 0) {
          broadcast('grace_countdown', { secondsRemaining: remaining });
        }
      }, 10000);

      graceTimer = setTimeout(() => {
        clearGraceTimers();
        disconnectAll('stream_ended');
      }, totalSeconds * 1000);
      break;
    }

    case 'end_screen': {
      const endScreenUrl = config.endScreenUrl;
      const duration = config.endScreenDurationSeconds || 10;

      if (endScreenUrl) {
        // Load end screen on all active casts
        for (const [deviceId, session] of sessions) {
          if (session.client && session.status === 'casting') {
            try {
              session.client.launch(DefaultMediaReceiver, (err, player) => {
                if (!err) {
                  player.load({
                    contentId: endScreenUrl,
                    contentType: 'text/html',
                    streamType: 'NONE',
                  }, { autoplay: true }, () => {});
                }
              });
            } catch {
              // ignore errors during end screen
            }
          }
        }
      }

      graceTimer = setTimeout(() => {
        clearGraceTimers();
        disconnectAll('stream_ended');
      }, duration * 1000);
      break;
    }

    default:
      disconnectAll('stream_ended');
  }
}

function disconnectAll(reason) {
  for (const [deviceId, session] of sessions) {
    if (session.retryTimer) clearTimeout(session.retryTimer);
    try {
      session.client.close();
    } catch {
      // ignore close errors
    }
    broadcast('cast_stop', { deviceId, reason });
  }
  sessions.clear();
  console.log(`All cast sessions disconnected (${reason})`);
}

function cleanupSession(deviceId) {
  const session = sessions.get(deviceId);
  if (session) {
    if (session.retryTimer) clearTimeout(session.retryTimer);
    try { session.client.close(); } catch {}
    sessions.delete(deviceId);
  }
}

function clearGraceTimers() {
  if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
  if (graceInterval) { clearInterval(graceInterval); graceInterval = null; }
}

export function getStatus() {
  const statuses = [];
  const config = getConfig();
  const devices = config.devices || [];

  for (const device of devices) {
    const session = sessions.get(device.id);
    statuses.push({
      deviceId: device.id,
      deviceName: device.name,
      ip: device.ip,
      isTarget: device.isTarget,
      castState: session?.status || 'idle',
      retryCount: session?.retryCount || 0,
    });
  }
  return statuses;
}

export function cancelGracePeriod() {
  clearGraceTimers();
}

// Reset all devices to idle (called on next stream start)
export function resetStates() {
  for (const [, session] of sessions) {
    if (session.retryTimer) clearTimeout(session.retryTimer);
    try { session.client.close(); } catch {}
  }
  sessions.clear();
  clearGraceTimers();
}
