import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let versions = null;

export function getVersions() {
  if (versions) return versions;

  // Try Docker path first (/app/versions.json), then dev path (repo root)
  const paths = [
    join(process.cwd(), 'versions.json'),
    join(__dirname, '..', '..', '..', 'versions.json'),
  ];

  for (const p of paths) {
    try {
      versions = JSON.parse(readFileSync(p, 'utf-8'));
      return versions;
    } catch {
      // try next path
    }
  }

  versions = { app: 'unknown', mediamtx: 'unknown', go2rtc: 'unknown', node: process.version };
  return versions;
}
