import { useState, useEffect } from 'react';

const statusColors = {
  active: '#27ae60',
  gap: '#f39c12',
  idle: '#95a5a6',
};

const statusLabels = {
  active: 'LIVE',
  gap: 'GAP',
  idle: 'WAITING',
};

export default function StreamStatus({ status }) {
  const [uptime, setUptime] = useState(null);

  useEffect(() => {
    if (!status?.active || !status?.startedAt) {
      setUptime(null);
      return;
    }

    function update() {
      const elapsed = Math.floor((Date.now() - new Date(status.startedAt).getTime()) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setUptime(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [status?.active, status?.startedAt]);

  const state = status?.state || 'idle';
  const color = statusColors[state] || '#95a5a6';
  const label = statusLabels[state] || state.toUpperCase();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{
        display: 'inline-block',
        padding: '4px 12px',
        background: color,
        color: '#fff',
        borderRadius: '4px',
        fontWeight: 'bold',
        fontSize: '14px',
        letterSpacing: '1px',
      }}>
        {label}
      </span>
      {uptime && (
        <span style={{ fontFamily: 'monospace', color: '#666', fontSize: '14px' }}>
          {uptime}
        </span>
      )}
      {status?.gapActive && status?.gapElapsed != null && (
        <span style={{ color: '#f39c12', fontSize: '13px' }}>
          Gap: {status.gapElapsed}s
        </span>
      )}
    </div>
  );
}
