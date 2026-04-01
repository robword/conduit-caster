import { broadcast } from './websocketService.js';
import { getConfig, saveConfig } from './configService.js';
import { v4 as uuidv4 } from 'uuid';
import Bonjour from 'bonjour-service';

let discoveryInterval = null;
let bonjourInstance = null;

function getBonjourInstance() {
  if (!bonjourInstance) {
    bonjourInstance = new Bonjour();
  }
  return bonjourInstance;
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
  return new Promise((resolve) => {
    const bonjour = getBonjourInstance();
    const devices = [];

    const browser = bonjour.find({ type: 'googlecast', protocol: 'tcp' }, (service) => {
      // Extract IPv4 address
      const ip = service.addresses?.find(a => a.match(/^\d+\.\d+\.\d+\.\d+$/));
      if (ip) {
        const name = service.txt?.fn || service.name || 'Chromecast';
        devices.push({ name, ip });
      }
    });

    // Give discovery 8 seconds to find devices
    setTimeout(() => {
      browser.stop();
      mergeDiscoveredDevices(devices);
      console.log(`Discovery found ${devices.length} device(s)`);
      resolve(devices);
    }, 8000);
  });
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
