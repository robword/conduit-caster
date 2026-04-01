import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function Tailscale() {
  const [status, setStatus] = useState(null);
  const [authKey, setAuthKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/tailscale/status').then(setStatus).catch(() => {});
  }, []);

  async function handleSetup() {
    setSaving(true);
    setSaved(false);
    try {
      await api('/tailscale/setup', { method: 'POST', body: { authKey } });
      setAuthKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Refresh status
      const s = await api('/tailscale/status');
      setStatus(s);
    } catch {}
    setSaving(false);
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Tailscale</h1>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', maxWidth: '600px' }}>
        <h3 style={{ marginTop: 0 }}>Connection Status</h3>
        {status ? (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: status.connected ? '#27ae60' : '#95a5a6',
              }} />
              <strong>{status.connected ? 'Connected' : 'Not connected'}</strong>
            </div>
            {status.connected && (
              <>
                {status.ip && <div style={{ fontSize: '14px', color: '#666' }}>IP: <code>{status.ip}</code></div>}
                {status.hostname && <div style={{ fontSize: '14px', color: '#666' }}>Hostname: <code>{status.hostname}</code></div>}
              </>
            )}
          </div>
        ) : (
          <p style={{ color: '#999' }}>Loading...</p>
        )}

        <h3>Auth Key</h3>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Enter your Tailscale auth key. This is write-only and will not be displayed again.
        </p>
        <input
          type="password"
          value={authKey}
          onChange={e => setAuthKey(e.target.value)}
          placeholder="tskey-auth-..."
          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '16px' }}
        />

        <div>
          <button onClick={handleSetup} disabled={saving || !authKey}
            style={{ padding: '10px 24px', background: '#4361ee', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: !authKey ? 0.5 : 1 }}>
            {saving ? 'Saving...' : 'Save Auth Key'}
          </button>
          {saved && <span style={{ color: '#27ae60', marginLeft: '12px' }}>Saved!</span>}
        </div>

        <div style={{ marginTop: '24px', padding: '12px', background: '#f8f9fa', borderRadius: '4px', fontSize: '13px', color: '#666' }}>
          <strong>To enable Tailscale:</strong>
          <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d
          </pre>
        </div>
      </div>
    </div>
  );
}
