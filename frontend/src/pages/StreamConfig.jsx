import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function StreamConfig() {
  const [config, setConfig] = useState(null);
  const [network, setNetwork] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      api('/config'),
      api('/network/context'),
    ]).then(([c, n]) => { setConfig(c); setNetwork(n); }).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await api('/config', { method: 'PUT', body: { rtmpPath: config.rtmpPath } });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
  }

  if (!config) return <div>Loading...</div>;

  const lanIp = network?.lanIp || config.hostIp || 'detecting...';
  const rtmpUrl = `rtmp://${lanIp}:1935/${config.rtmpPath}`;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Stream Configuration</h1>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', maxWidth: '600px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>RTMP Path</label>
        <input
          type="text"
          value={config.rtmpPath}
          onChange={e => setConfig({ ...config, rtmpPath: e.target.value })}
          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '16px' }}
        />

        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Host LAN IP</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input type="text" value={lanIp} readOnly
            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px', background: '#f8f9fa', fontFamily: 'monospace' }} />
          <button onClick={() => copyToClipboard(lanIp)}
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}>Copy</button>
        </div>

        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>ATEM Destination</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <input type="text" value={rtmpUrl} readOnly
            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px', background: '#f8f9fa', fontFamily: 'monospace' }} />
          <button onClick={() => copyToClipboard(rtmpUrl)}
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fff' }}>Copy</button>
        </div>

        <button onClick={handleSave} disabled={saving}
          style={{ padding: '10px 24px', background: '#4361ee', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span style={{ color: '#27ae60', marginLeft: '12px' }}>Saved!</span>}
      </div>
    </div>
  );
}
