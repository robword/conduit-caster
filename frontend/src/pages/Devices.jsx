import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useWebSocket } from '../context/WebSocketContext';

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [error, setError] = useState('');
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => { loadDevices(); }, []);

  async function loadDevices() {
    try {
      setDevices(await api('/devices'));
    } catch {}
  }

  const handleWs = useCallback(() => { loadDevices(); }, []);
  useWebSocket('device_discovered', handleWs);
  useWebSocket('device_lost', handleWs);

  async function handleDiscover() {
    setDiscovering(true);
    try {
      await api('/devices/discover', { method: 'POST' });
      await loadDevices();
    } catch {}
    setDiscovering(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/devices', { method: 'POST', body: { name, ip } });
      setName(''); setIp('');
      await loadDevices();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleTarget(id, current) {
    await api(`/devices/${id}`, { method: 'PATCH', body: { isTarget: !current } });
    await loadDevices();
  }

  async function handleRemove(id) {
    try {
      await api(`/devices/${id}`, { method: 'DELETE' });
      await loadDevices();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginTop: 0 }}>Devices</h1>
        <button
          onClick={handleDiscover}
          disabled={discovering}
          style={{ padding: '8px 16px', background: '#4361ee', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {discovering ? 'Scanning...' : 'Re-scan'}
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
            <th style={{ padding: '12px' }}>Target</th>
            <th style={{ padding: '12px' }}>Name</th>
            <th style={{ padding: '12px' }}>IP</th>
            <th style={{ padding: '12px' }}>Source</th>
            <th style={{ padding: '12px' }}>Cast State</th>
            <th style={{ padding: '12px' }}>Last Seen</th>
            <th style={{ padding: '12px' }}></th>
          </tr>
        </thead>
        <tbody>
          {devices.map(d => (
            <tr key={d.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: '12px' }}>
                <input type="checkbox" checked={d.isTarget} onChange={() => toggleTarget(d.id, d.isTarget)} />
              </td>
              <td style={{ padding: '12px' }}>{d.name}</td>
              <td style={{ padding: '12px', fontFamily: 'monospace' }}>{d.ip}</td>
              <td style={{ padding: '12px' }}>
                <span style={{ fontSize: '12px', color: d.source === 'discovered' ? '#27ae60' : '#3498db' }}>{d.source}</span>
              </td>
              <td style={{ padding: '12px' }}>
                <span style={{ fontSize: '12px' }}>{d.castState || 'idle'}</span>
              </td>
              <td style={{ padding: '12px', fontSize: '12px', color: '#999' }}>
                {d.lastSeen ? new Date(d.lastSeen).toLocaleString() : '-'}
              </td>
              <td style={{ padding: '12px' }}>
                {d.source === 'manual' && (
                  <button onClick={() => handleRemove(d.id)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>Remove</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '24px', background: '#fff', padding: '20px', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0 }}>Add Device Manually</h3>
        {error && <div style={{ color: '#e74c3c', marginBottom: '8px' }}>{error}</div>}
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px' }}>
          <input type="text" placeholder="Device name" value={name} onChange={e => setName(e.target.value)} required
            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
          <input type="text" placeholder="IP address" value={ip} onChange={e => setIp(e.target.value)} required
            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
          <button type="submit" style={{ padding: '8px 16px', background: '#4361ee', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Add</button>
        </form>
      </div>
    </div>
  );
}
