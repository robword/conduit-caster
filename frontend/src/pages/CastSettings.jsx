import { useState, useEffect } from 'react';
import { api } from '../api/client';

const inputStyle = {
  width: '100%',
  padding: '8px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  boxSizing: 'border-box',
  marginBottom: '16px',
};

export default function CastSettings() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/config').then(setConfig).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await api('/config', {
        method: 'PUT',
        body: {
          autoCastOnStreamStart: config.autoCastOnStreamStart,
          stopBehavior: config.stopBehavior,
          gracePeriodMinutes: config.gracePeriodMinutes,
          endScreenUrl: config.endScreenUrl,
          endScreenDurationSeconds: config.endScreenDurationSeconds,
          recovery: config.recovery,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  }

  if (!config) return <div>Loading...</div>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Cast Settings</h1>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', maxWidth: '600px' }}>
        <label style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.autoCastOnStreamStart}
            onChange={e => setConfig({ ...config, autoCastOnStreamStart: e.target.checked })}
            style={{ marginRight: '8px' }}
          />
          <strong>Auto-cast when stream starts</strong>
        </label>

        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Stop Behavior</label>
        <select
          value={config.stopBehavior}
          onChange={e => setConfig({ ...config, stopBehavior: e.target.value })}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="immediate">Immediate</option>
          <option value="grace_period">Grace Period</option>
          <option value="end_screen">End Screen</option>
        </select>

        {config.stopBehavior === 'grace_period' && (
          <>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>
              Grace Period: {config.gracePeriodMinutes} min
            </label>
            <input
              type="range"
              min="1"
              max="30"
              value={config.gracePeriodMinutes}
              onChange={e => setConfig({ ...config, gracePeriodMinutes: parseInt(e.target.value) })}
              style={{ width: '100%', marginBottom: '16px' }}
            />
          </>
        )}

        {config.stopBehavior === 'end_screen' && (
          <>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>End Screen URL</label>
            <input
              type="url"
              value={config.endScreenUrl || ''}
              onChange={e => setConfig({ ...config, endScreenUrl: e.target.value || null })}
              placeholder="https://example.com/end-screen"
              style={inputStyle}
            />
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>End Screen Duration (seconds)</label>
            <input
              type="number"
              min="5"
              max="60"
              value={config.endScreenDurationSeconds}
              onChange={e => setConfig({ ...config, endScreenDurationSeconds: parseInt(e.target.value) })}
              style={inputStyle}
            />
          </>
        )}

        <h3>Recovery Settings</h3>

        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Max Retries</label>
        <input
          type="number"
          min="0"
          max="10"
          value={config.recovery.maxRetries}
          onChange={e => setConfig({ ...config, recovery: { ...config.recovery, maxRetries: parseInt(e.target.value) } })}
          style={inputStyle}
        />

        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Retry Backoff (seconds)</label>
        <input
          type="number"
          min="1"
          max="30"
          value={config.recovery.retryBackoffSeconds}
          onChange={e => setConfig({ ...config, recovery: { ...config.recovery, retryBackoffSeconds: parseInt(e.target.value) } })}
          style={inputStyle}
        />

        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>Stream Gap Tolerance (seconds)</label>
        <input
          type="number"
          min="5"
          max="120"
          value={config.recovery.streamGapToleranceSeconds}
          onChange={e => setConfig({ ...config, recovery: { ...config.recovery, streamGapToleranceSeconds: parseInt(e.target.value) } })}
          style={inputStyle}
        />

        <div style={{ marginTop: '8px' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '10px 24px', background: '#4361ee', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && <span style={{ color: '#27ae60', marginLeft: '12px' }}>Saved!</span>}
        </div>
      </div>
    </div>
  );
}
