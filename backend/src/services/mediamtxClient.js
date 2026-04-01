const MEDIAMTX_URL = process.env.MEDIAMTX_API_URL || 'http://mediamtx:9997';

export async function getPaths() {
  const res = await fetch(`${MEDIAMTX_URL}/v3/paths/list`);
  return res.json();
}

export async function patchConfig(patch) {
  await fetch(`${MEDIAMTX_URL}/v3/config/global/patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}
