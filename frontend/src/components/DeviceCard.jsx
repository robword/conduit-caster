const stateColors = {
  idle: '#95a5a6',
  casting: '#27ae60',
  connecting: '#3498db',
  retrying: '#f39c12',
  errored: '#e74c3c',
};

export default function DeviceCard({ device }) {
  const color = stateColors[device.castState] || '#95a5a6';

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '16px',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{device.deviceName}</strong>
        <span style={{
          fontSize: '12px',
          padding: '2px 8px',
          background: color,
          color: '#fff',
          borderRadius: '12px',
          textTransform: 'uppercase',
        }}>
          {device.castState}
        </span>
      </div>
      <div style={{ color: '#999', fontSize: '13px', marginTop: '4px' }}>
        {device.ip}
      </div>
      {device.castState === 'retrying' && (
        <div style={{ color: '#f39c12', fontSize: '13px', marginTop: '4px' }}>
          Retry attempt {device.retryCount}
        </div>
      )}
    </div>
  );
}
