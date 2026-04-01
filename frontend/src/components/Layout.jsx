import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/devices', label: 'Devices' },
  { to: '/config/stream', label: 'Stream' },
  { to: '/config/cast', label: 'Cast Settings' },
  { to: '/config/tailscale', label: 'Tailscale' },
  { to: '/about', label: 'About' },
];

export default function Layout() {
  const { logout } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{
        width: '220px',
        background: '#1a1a2e',
        color: '#fff',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #333' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Conduit Caster</h2>
        </div>

        <div style={{ flex: 1, padding: '10px 0' }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                display: 'block',
                padding: '10px 20px',
                color: isActive ? '#fff' : '#aaa',
                background: isActive ? '#16213e' : 'transparent',
                textDecoration: 'none',
                fontSize: '14px',
                borderLeft: isActive ? '3px solid #4361ee' : '3px solid transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid #333' }}>
          <button
            onClick={logout}
            style={{
              background: 'none',
              border: '1px solid #555',
              color: '#aaa',
              padding: '6px 12px',
              cursor: 'pointer',
              width: '100%',
              borderRadius: '4px',
            }}
          >
            Logout
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, padding: '24px', background: '#f5f5f5' }}>
        <Outlet />
      </main>
    </div>
  );
}
