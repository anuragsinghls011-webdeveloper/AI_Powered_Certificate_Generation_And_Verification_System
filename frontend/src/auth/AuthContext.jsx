// Auth context + axios interceptor for cookie-based JWT with silent refresh.

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// Global axios: send cookies with every request
axios.defaults.withCredentials = true;

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [membership, setMembership] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshingRef = useRef(null);

  // Fetch current user on boot
  const bootstrap = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/auth/me`);
      setUser(res.data.user);
      setMembership(res.data.active_membership);
      setMemberships(res.data.memberships);
      setOrganization(res.data.active_membership?.organization || null);
    } catch (e) {
      // Try silent refresh once
      if (e.response?.status === 401) {
        const refreshed = await silentRefresh();
        if (refreshed) return; // bootstrap already re-runs on refresh success
      }
      setUser(null); setMembership(null); setMemberships([]); setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const silentRefresh = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current;
    refreshingRef.current = (async () => {
      try {
        await axios.post(`${API}/auth/refresh`);
        // Re-fetch me
        const res = await axios.get(`${API}/auth/me`);
        setUser(res.data.user);
        setMembership(res.data.active_membership);
        setMemberships(res.data.memberships);
        setOrganization(res.data.active_membership?.organization || null);
        return true;
      } catch {
        return false;
      } finally {
        refreshingRef.current = null;
      }
    })();
    return refreshingRef.current;
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // Global axios interceptor: on 401 for /api/* (except /auth/login|register|refresh),
  // try a single silent refresh then replay the original request.
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (r) => r,
      async (err) => {
        const cfg = err.config;
        if (!cfg || cfg._retried) return Promise.reject(err);
        const url = cfg.url || '';
        const isAuthCall = /\/api\/auth\/(login|register|refresh|logout|logout-all|forgot-password|reset-password|verify-email)/.test(url);
        if (err.response?.status === 401 && !isAuthCall) {
          cfg._retried = true;
          const ok = await silentRefresh();
          if (ok) return axios(cfg);
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [silentRefresh]);

  const login = async (email, password) => {
    setError('');
    try {
      const res = await axios.post(`${API}/auth/login`, { email, password });
      setUser(res.data.user);
      setMembership(res.data.membership);
      setOrganization(res.data.organization);
      await bootstrap();
      return { ok: true };
    } catch (e) {
      setError(formatErr(e));
      return { ok: false, error: formatErr(e) };
    }
  };

  const register = async (payload) => {
    setError('');
    try {
      const res = await axios.post(`${API}/auth/register`, payload);
      setUser(res.data.user);
      setMembership(res.data.membership);
      setOrganization(res.data.organization);
      await bootstrap();
      return { ok: true, data: res.data };
    } catch (e) {
      setError(formatErr(e));
      return { ok: false, error: formatErr(e) };
    }
  };

  const logout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) { /* ignore */ }
    setUser(null); setMembership(null); setMemberships([]); setOrganization(null);
  };

  const logoutAll = async () => {
    try { await axios.post(`${API}/auth/logout-all`); } catch (e) { /* ignore */ }
    setUser(null); setMembership(null); setMemberships([]); setOrganization(null);
  };

  const switchOrg = async (orgId) => {
    const res = await axios.post(`${API}/auth/switch-organization`, { organization_id: orgId });
    await bootstrap();
    return res.data;
  };

  const hasPermission = (perm) => {
    const perms = membership?.permissions || [];
    if (perms.includes('*')) return true;
    if (perms.includes(perm)) return true;
    const ns = perm.split('.')[0];
    if (ns && perms.includes(`${ns}.*`)) return true;
    return false;
  };

  return (
    <AuthCtx.Provider value={{
      user, membership, memberships, organization, loading, error,
      login, register, logout, logoutAll, switchOrg, hasPermission, bootstrap
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

function formatErr(e) {
  const detail = e.response?.data?.error || e.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((x) => x.msg || JSON.stringify(x)).join(' ');
  return e.message || 'Something went wrong';
}
