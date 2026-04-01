import { broadcast } from './websocketService.js';
import { getConfig, saveConfig } from './configService.js';
import { v4 as uuidv4 } from 'uuid';

let discoveryInterval = null;
let Client;

// Lazy-load castv2-client (may not be available in all environments)
async function loadCastv2() {
  if (Client) return;
  try {
    const mod = await import('castv2-client');
    Client = mod.Client;
  } catch {
    console.warn('castv2-client not available — mDNS discovery disabled');
  }
}

export function startDiscovery() {
  const config = getConfig();
  const intervalMs = (config.discoveryIntervalSeconds || 30) * 1000;

  stopDiscovery();
  discoveryInterval = setInterval(() => discoverNow(), intervalMs);
  console.log(`Discovery started (every ${config.discoveryIntervalSeconds || 30}s)`);
}

export function stopDiscovery() {
  if (discoveryInterval) {
    clearInterval(discoveryInterval);
    discoveryInterval = null;
  }
}

export async function discoverNow() {
  await loadCastv2();

  // Use mdns-based discovery if available
  try {
    const mdns = await import('mdns');
    return discoverViaMdns(mdns.default || mdns);
  } catch {
    // mdns not available — try dns-sd or bonjour alternatives
  }

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Try avahi-browse on Linux
    const { stdout } = await execAsync(
      'avahi-browse _googlecast._tcp --resolve --parsable --terminate 2>/dev/null',
      { timeout: 10000 }
    );

    const devices = parseAvahiBrowse(stdout);
    mergeDiscoveredDevices(devices);
    return devices;
  } catch {
    console.warn('mDNS discovery failed — add devices manually via API');
    return [];
  }
}

function parseAvahiBrowse(output) {
  const devices = [];
  const lines = output.split('\n').filter(l => l.startsWith('='));

  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 8) continue;

    const name = parts[3];
    const ip = parts[7];

    if (ip && !ip.includes(':')) { // IPv4 only
      devices.push({ name, ip });
    }
  }

  return devices;
}

function mergeDiscoveredDevices(discovered) {
  const config = getConfig();
  const existing = config.devices || [];
  let changed = false;

  for (const dev of discovered) {
    const existingDev = existing.find(d => d.ip === dev.ip);
    if (existingDev) {
      existingDev.lastSeen = new Date().toISOString();
      if (dev.name && dev.name !== existingDev.name && existingDev.source === 'discovered') {
        existingDev.name = dev.name;
      }
      changed = true;
    } else {
      const newDevice = {
        id: uuidv4(),
        name: dev.name,
        ip: dev.ip,
        source: 'discovered',
        isTarget: false,
        lastSeen: new Date().toISOString(),
      };
      existing.push(newDevice);
      changed = true;
      broadcast('device_discovered', { id: newDevice.id, ip: newDevice.ip, name: newDevice.name });
    }
  }

  if (changed) {
    saveConfig({ devices: existing });
  }
}

export function addDevice(name, ip) {
  const config = getConfig();
  const existing = config.devices || [];

  if (existing.find(d => d.ip === ip)) {
    throw new Error('Device with this IP already exists');
  }

  const device = {
    id: uuidv4(),
    name,
    ip,
    source: 'manual',
    isTarget: false,
    lastSeen: new Date().toISOString(),
  };
  existing.push(device);
  saveConfig({ devices: existing });
  return device;
}

export function removeDevice(id) {
  const config = getConfig();
  const device = config.devices?.find(d => d.id === id);
  if (!device) throw new Error('Device not found');
  if (device.source !== 'manual') throw new Error('Can only remove manually added devices');

  const devices = config.devices.filter(d => d.id !== id);
  saveConfig({ devices });
}

export function updateDevice(id, updates) {
  const config = getConfig();
  const device = config.devices?.find(d => d.id === id);
  if (!device) throw new Error('Device not found');

  if (updates.name !== undefined) device.name = updates.name;
  if (updates.isTarget !== undefined) device.isTarget = updates.isTarget;

  saveConfig({ devices: config.devices });
  return device;
}

export function getDevices() {
  const config = getConfig();
  return config.devices || [];
}

export function getTargetDevices() {
  return getDevices().filter(d => d.isTarget);
}
