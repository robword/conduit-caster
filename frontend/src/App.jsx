import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';

// Lazy-loaded pages
import { lazy, Suspense } from 'react';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Devices = lazy(() => import('./pages/Devices'));
const StreamConfig = lazy(() => import('./pages/StreamConfig'));
const CastSettings = lazy(() => import('./pages/CastSettings'));
const Tailscale = lazy(() => import('./pages/Tailscale'));
const About = lazy(() => import('./pages/About'));

function ProtectedRoute({ children }) {
  const { user, firstRun, loading } = useAuth();

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  if (firstRun) return <Navigate to="/setup" />;
  if (!user) return <Navigate to="/login" />;

  return children;
}

function AppRoutes() {
  const { firstRun, loading } = useAuth();

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={firstRun ? <Setup /> : <Navigate to="/" />} />

      <Route element={
        <ProtectedRoute>
          <WebSocketProvider>
            <Layout />
          </WebSocketProvider>
        </ProtectedRoute>
      }>
        <Route index element={
          <Suspense fallback={<div>Loading...</div>}>
            <Dashboard />
          </Suspense>
        } />
        <Route path="devices" element={
          <Suspense fallback={<div>Loading...</div>}>
            <Devices />
          </Suspense>
        } />
        <Route path="config/stream" element={
          <Suspense fallback={<div>Loading...</div>}>
            <StreamConfig />
          </Suspense>
        } />
        <Route path="config/cast" element={
          <Suspense fallback={<div>Loading...</div>}>
            <CastSettings />
          </Suspense>
        } />
        <Route path="config/tailscale" element={
          <Suspense fallback={<div>Loading...</div>}>
            <Tailscale />
          </Suspense>
        } />
        <Route path="about" element={
          <Suspense fallback={<div>Loading...</div>}>
            <About />
          </Suspense>
        } />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
