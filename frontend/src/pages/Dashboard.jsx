import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useWebSocket } from '../context/WebSocketContext';
import StreamPreview from '../components/StreamPreview';
import StreamStatus from '../components/StreamStatus';
import DeviceCard from '../components/DeviceCard';

export default function Dashboard() {
  const [streamStatus, setStreamStatus] = useState(null);
  const [castStatus, setCastStatus] = useState([]);
  const [casting, setCasting] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [stream, cast] = await Promise.all([
        api('/stream/status'),
        api('/cast/status'),
      ]);
      setStreamStatus(stream);
      setCastStatus(cast);
    } catch {
      // API may be unavailable
    }
  }

  const handleWsEvent = useCallback((payload, msg) => {
    if (msg.type.startsWith('stream_') || msg.type.startsWith('cast_') || msg.type === 'grace_countdown') {
      loadData();
    }
  }, []);

  useWebSocket('*', handleWsEvent);

  async function handleStartCast() {
    setCasting(true);
    try {
      await api('/cast/start', { method: 'POST' });
      await loadData();
    } catch (err) {
      alert(err.message);
    }
    setCasting(false);
  }

  async function handleStopCast() {
    setCasting(true);
    try {
      await api('/cast/stop', { method: 'POST' });
      await loadData();
    } catch (err) {
      alert(err.message);
    }
    setCasting(false);
  }

  async function handleDiscover() {
    try {
      await api('/devices/discover', { method: 'POST' });
      await loadData();
    } catch {
      // ignore
    }
  }

  const anyCasting = castStatus.some(d => d.castState === 'casting');

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>

      <StreamStatus status={streamStatus} />

      <div style={{ margin: '20px 0' }}>
        <StreamPreview active={streamStatus?.active} />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={handleStartCast}
          disabled={casting || !streamStatus?.active}
          style={{
            padding: '10px 20px',
            background: '#27ae60',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: casting ? 'wait' : 'pointer',
            opacity: !streamStatus?.active ? 0.5 : 1,
          }}
        >
          Start Casting
        </button>
        <button
          onClick={handleStopCast}
          disabled={casting || !anyCasting}
          style={{
            padding: '10px 20px',
            background: '#e74c3c',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: casting ? 'wait' : 'pointer',
            opacity: !anyCasting ? 0.5 : 1,
          }}
        >
          Stop Casting
        </button>
        <button
          onClick={handleDiscover}
          style={{
            padding: '10px 20px',
            background: '#fff',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Re-discover
        </button>
      </div>

      <h3>Devices</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {castStatus.filter(d => d.isTarget).map(device => (
          <DeviceCard key={device.deviceId} device={device} />
        ))}
        {castStatus.filter(d => d.isTarget).length === 0 && (
          <p style={{ color: '#999' }}>No target devices selected. Go to Devices to select targets.</p>
        )}
      </div>
    </div>
  );
}
