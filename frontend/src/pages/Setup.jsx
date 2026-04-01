import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const formStyle = {
  background: '#fff',
  padding: '40px',
  borderRadius: '8px',
  maxWidth: '500px',
  margin: '40px auto',
};

const inputStyle = {
  width: '100%',
  padding: '8px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  boxSizing: 'border-box',
  marginBottom: '16px',
};

const btnStyle = {
  padding: '10px 24px',
  background: '#4361ee',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
};

const btnSecondary = {
  ...btnStyle,
  background: '#6c757d',
  marginRight: '8px',
};

export default function Setup() {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [rtmpPath, setRtmpPath] = useState('live');
  const [lanIp, setLanIp] = useState('');
  const [devices, setDevices] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [config, setConfig] = useState({});
  const [error, setError] = useState('');
  const { setup } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api('/network/context').then(ctx => setLanIp(ctx.lanIp)).catch(() => {});
  }, []);

  async function handleSetup() {
    setError('');
    try {
      await setup(username, password);
      setStep(2);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveStream() {
    try {
      await api('/config', { method: 'PUT', body: { rtmpPath } });
      setStep(3);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    try {
      await api('/devices/discover', { method: 'POST' });
      const devs = await api('/devices');
      setDevices(devs);
    } catch {
      // Discovery may fail on macOS
    }
    setDiscovering(false);
  }

  async function handleAddManual() {
    if (!manualName || !manualIp) return;
    try {
      await api('/devices', { method: 'POST', body: { name: manualName, ip: manualIp } });
      setManualName('');
      setManualIp('');
      const devs = await api('/devices');
      setDevices(devs);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleTarget(id, isTarget) {
    await api(`/devices/${id}`, { method: 'PATCH', body: { isTarget: !isTarget } });
    const devs = await api('/devices');
    setDevices(devs);
  }

  async function handleSaveCast() {
    try {
      await api('/config', { method: 'PUT', body: config });
      setStep(5);
    } catch (err) {
      setError(err.message);
    }
  }

  const steps = [
    // Step 0: Welcome
    <div key="welcome" style={formStyle}>
      <h1 style={{ marginTop: 0 }}>Welcome to Conduit Caster</h1>
      <p>This wizard will guide you through initial setup:</p>
      <ul>
        <li>Create admin credentials</li>
        <li>Configure your stream source</li>
        <li>Discover Chromecast devices</li>
        <li>Set cast behavior</li>
      </ul>
      <button onClick={() => setStep(1)} style={btnStyle}>Get Started</button>
    </div>,

    // Step 1: Credentials
    <div key="creds" style={formStyle}>
      <h2 style={{ marginTop: 0 }}>Create Admin Account</h2>
      {error && <div style={{ color: '#e74c3c', marginBottom: '16px' }}>{error}</div>}
      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Username</label>
      <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} />
      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Password</label>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="At least 6 characters" />
      <div>
        <button onClick={handleSetup} style={btnStyle} disabled={!username || password.length < 6}>Create Account</button>
      </div>
    </div>,

    // Step 2: Stream Config
    <div key="stream" style={formStyle}>
      <h2 style={{ marginTop: 0 }}>Stream Configuration</h2>
      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>RTMP Path</label>
      <input type="text" value={rtmpPath} onChange={e => setRtmpPath(e.target.value)} style={inputStyle} />
      <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontFamily: 'monospace', fontSize: '14px' }}>
        <div style={{ marginBottom: '4px', color: '#666' }}>Point your ATEM Mini Pro to:</div>
        <strong>rtmp://{lanIp || '<detecting...>'}:1935/{rtmpPath}</strong>
      </div>
      <div>
        <button onClick={() => setStep(1)} style={btnSecondary}>Back</button>
        <button onClick={handleSaveStream} style={btnStyle}>Next</button>
      </div>
    </div>,

    // Step 3: Discover Devices
    <div key="devices" style={formStyle}>
      <h2 style={{ marginTop: 0 }}>Discover Chromecast Devices</h2>
      <button onClick={handleDiscover} style={{ ...btnStyle, marginBottom: '16px' }} disabled={discovering}>
        {discovering ? 'Scanning...' : 'Scan for Devices'}
      </button>

      {devices.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          {devices.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', padding: '8px', borderBottom: '1px solid #eee' }}>
              <input type="checkbox" checked={d.isTarget} onChange={() => toggleTarget(d.id, d.isTarget)} style={{ marginRight: '8px' }} />
              <span style={{ flex: 1 }}>{d.name}</span>
              <span style={{ color: '#999', fontSize: '13px' }}>{d.ip}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid #eee', paddingTop: '16px', marginTop: '8px' }}>
        <h4 style={{ marginTop: 0 }}>Add Manually</h4>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="text" placeholder="Name" value={manualName} onChange={e => setManualName(e.target.value)} style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
          <input type="text" placeholder="IP Address" value={manualIp} onChange={e => setManualIp(e.target.value)} style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
          <button onClick={handleAddManual} style={btnStyle}>Add</button>
        </div>
      </div>

      {error && <div style={{ color: '#e74c3c', marginTop: '8px' }}>{error}</div>}

      <div style={{ marginTop: '16px' }}>
        <button onClick={() => setStep(2)} style={btnSecondary}>Back</button>
        <button onClick={() => setStep(4)} style={btnStyle}>Next</button>
      </div>
    </div>,

    // Step 4: Cast Settings
    <div key="cast" style={formStyle}>
      <h2 style={{ marginTop: 0 }}>Cast Behavior</h2>

      <label style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={config.autoCastOnStreamStart !== false}
          onChange={e => setConfig({ ...config, autoCastOnStreamStart: e.target.checked })}
          style={{ marginRight: '8px' }}
        />
        Auto-cast when stream starts
      </label>

      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Stop Behavior</label>
      <select
        value={config.stopBehavior || 'grace_period'}
        onChange={e => setConfig({ ...config, stopBehavior: e.target.value })}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="immediate">Immediate</option>
        <option value="grace_period">Grace Period</option>
        <option value="end_screen">End Screen</option>
      </select>

      {(config.stopBehavior || 'grace_period') === 'grace_period' && (
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Grace Period (minutes): {config.gracePeriodMinutes || 5}</label>
          <input
            type="range"
            min="1"
            max="30"
            value={config.gracePeriodMinutes || 5}
            onChange={e => setConfig({ ...config, gracePeriodMinutes: parseInt(e.target.value) })}
            style={{ width: '100%', marginBottom: '16px' }}
          />
        </div>
      )}

      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Max Retries</label>
      <input
        type="number"
        min="0"
        max="10"
        value={config.recovery?.maxRetries ?? 2}
        onChange={e => setConfig({ ...config, recovery: { ...config.recovery, maxRetries: parseInt(e.target.value) } })}
        style={inputStyle}
      />

      <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Stream Gap Tolerance (seconds)</label>
      <input
        type="number"
        min="5"
        max="120"
        value={config.recovery?.streamGapToleranceSeconds ?? 30}
        onChange={e => setConfig({ ...config, recovery: { ...config.recovery, streamGapToleranceSeconds: parseInt(e.target.value) } })}
        style={inputStyle}
      />

      <div>
        <button onClick={() => setStep(3)} style={btnSecondary}>Back</button>
        <button onClick={handleSaveCast} style={btnStyle}>Save & Finish</button>
      </div>
    </div>,

    // Step 5: Done
    <div key="done" style={formStyle}>
      <h2 style={{ marginTop: 0 }}>Setup Complete!</h2>
      <p>Conduit Caster is ready. Here's a summary:</p>
      <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontFamily: 'monospace', fontSize: '14px' }}>
        <div>RTMP Input: rtmp://{lanIp}:1935/{rtmpPath}</div>
        <div>Devices: {devices.filter(d => d.isTarget).length} target(s) selected</div>
      </div>
      <button onClick={() => navigate('/')} style={btnStyle}>Go to Dashboard</button>
    </div>,
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', padding: '20px' }}>
      <div style={{ textAlign: 'center', color: '#666', marginBottom: '8px', fontSize: '13px' }}>
        Step {step + 1} of {steps.length}
      </div>
      {steps[step]}
    </div>
  );
}
