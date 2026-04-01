import { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [firstRun, setFirstRun] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const { firstRun: fr } = await api('/auth/status');
      setFirstRun(fr);

      const token = localStorage.getItem('token');
      if (token && !fr) {
        setUser({ token });
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }

  async function login(username, password) {
    const { token } = await api('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    setToken(token);
    setUser({ token });
    setFirstRun(false);
    return token;
  }

  async function setup(username, password) {
    const { token } = await api('/auth/setup', {
      method: 'POST',
      body: { username, password },
    });
    setToken(token);
    setUser({ token });
    setFirstRun(false);
    return token;
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, firstRun, loading, login, setup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
