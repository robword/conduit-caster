import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function About() {
  const [versions, setVersions] = useState(null);

  useEffect(() => {
    api('/version').then(setVersions).catch(() => {});
  }, []);

  if (!versions) return <div>Loading...</div>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>About</h1>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', maxWidth: '500px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['Conduit Caster', `v${versions.app}`],
              ['MediaMTX', `v${versions.mediamtx}`],
              ['go2rtc', `v${versions.go2rtc}`],
              ['Node.js', `v${versions.node}`],
            ].map(([name, version]) => (
              <tr key={name} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px 0', fontWeight: 'bold' }}>{name}</td>
                <td style={{ padding: '10px 0', fontFamily: 'monospace', textAlign: 'right' }}>{version}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '20px', color: '#999', fontSize: '13px' }}>
          MIT License
        </div>
      </div>
    </div>
  );
}
