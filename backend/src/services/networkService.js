import os from 'os';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import ipaddr from 'ipaddr.js';

const exec = promisify(execCb);

const TAILSCALE_CGNAT = ipaddr.parseCIDR('100.64.0.0/10');

let cachedLanIp = null;
let cachedTailscaleIp = null;

export async function getLanIp() {
  // Allow override via env var (useful for macOS dev)
  if (process.env.HOST_IP) return process.env.HOST_IP;

  try {
    const { stdout } = await exec('ip route get 1');
    const match = stdout.match(/src (\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      cachedLanIp = match[1];
      return cachedLanIp;
    }
  } catch {
    // Fallback for macOS or systems without `ip` command
  }

  // Fallback: scan network interfaces
  const interfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (name === 'lo' || name === 'lo0' || name.startsWith('tailscale')) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        cachedLanIp = addr.address;
        return cachedLanIp;
      }
    }
  }

  return cachedLanIp || '127.0.0.1';
}

export function getTailscaleIp() {
  const interfaces = os.networkInterfaces();
  const tsIface = Object.entries(interfaces)
    .find(([name]) => name === 'tailscale0');

  cachedTailscaleIp = tsIface
    ?.[1]?.find(i => i.family === 'IPv4' && !i.internal)?.address ?? null;

  return cachedTailscaleIp;
}

export function isTailscaleRequest(ip) {
  try {
    const addr = ipaddr.parse(ip);
    // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:100.100.1.1)
    const v4 = addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()
      ? addr.toIPv4Address()
      : addr;
    if (v4.kind() !== 'ipv4') return false;
    return v4.match(TAILSCALE_CGNAT);
  } catch {
    return false;
  }
}

export async function getNetworkContext(reqIp) {
  const lanIp = await getLanIp();
  const tailscaleIp = getTailscaleIp();

  return {
    lanIp,
    tailscaleIp,
    tailscaleHostname: null, // populated when Tailscale status is checked
    isTailscale: isTailscaleRequest(reqIp || ''),
  };
}
