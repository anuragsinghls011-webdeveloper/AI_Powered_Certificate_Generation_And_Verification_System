// Auth context + axios interceptor for JWT (Bearer) with silent refresh.

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import axios, { API } from '../services/api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function storeTokens(data) {
  if (data?.access_token) localStorage.setItem('access_token', data.access_token);
  if (data?.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

function applySession(setters, data) {
  setters.setUser(data.user);
  setters.setMembership(data.membership || data.active_membership || null);
  setters.setMemberships(data.memberships || []);
  setters.setOrganization(
    data.organization || data.active_membership?.organization || null
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [membership, setMembership] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshingRef = useRef(null);
  const sessionSetters = { setUser, setMembership, setMemberships, setOrganization };

  const silentRefresh = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current;
    refreshingRef.current = (async () => {
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const resRefresh = await axios.post(`${API}/auth/refresh`, { refresh_token: refreshToken });
        storeTokens(resRefresh.data);
        const res = await axios.get(`${API}/auth/me`);
        applySession(sessionSetters, res.data);
        return true;
      } catch {
        return false;
      } finally {
        refreshingRef.current = null;
      }
    })();
    return refreshingRef.current;
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/auth/me`);
      applySession(sessionSetters, res.data);
    } catch (e) {
      if (e.response?.status === 401) {
        const refreshed = await silentRefresh();
        if (refreshed) return;
        clearTokens();
        setUser(null);
        setMembership(null);
        setMemberships([]);
        setOrganization(null);
      }
    } finally {
      setLoading(false);
    }
  }, [silentRefresh]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    const id = axios.interceptors.response.use(
      (r) => r,
      async (err) => {
        const cfg = err.config;
        if (!cfg || cfg._retried) return Promise.reject(err);
        const url = cfg.url || '';
        const isAuthCall = /\/auth\/(login|register|refresh|logout|logout-all|forgot-password|reset-password|verify-email|send-registration-otp)/.test(url);
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

  const login = async (email, password, organizationName) => {
    setError('');
    try {
      const payload = { email, password };
      const org = String(organizationName || '').trim();
      if (org) payload.organizationName = org;
      const res = await axios.post(`${API}/auth/login`, payload);
      storeTokens(res.data);
      applySession(sessionSetters, res.data);
      try {
        await bootstrap();
      } catch {
        /* session already applied from login body */
      }
      return { ok: true };
    } catch (e) {
      const message = formatErr(e);
      setError(message);
      return { ok: false, error: message };
    }
  };

  const sendRegistrationCode = async (email, name) => {
    try {
      const res = await axios.post(`${API}/auth/send-registration-otp`, { email, name });
      return { ok: true, data: res.data };
    } catch (err) {
      return { ok: false, error: err.response?.data?.error || 'Failed to send verification code' };
    }
  };

  const register = async (userData) => {
    setError('');
    try {
      const res = await axios.post(`${API}/auth/register`, userData);
      storeTokens(res.data);
      applySession(sessionSetters, res.data);
      try {
        await bootstrap();
      } catch {
        /* session already applied from register body */
      }
      return { ok: true, data: res.data };
    } catch (e) {
      const message = formatErr(e);
      setError(message);
      return { ok: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, { refresh_token: localStorage.getItem('refresh_token') });
    } catch (e) { /* ignore */ }
    clearTokens();
    setUser(null); setMembership(null); setMemberships([]); setOrganization(null);
  };

  const logoutAll = async () => {
    try { await axios.post(`${API}/auth/logout-all`); } catch (e) { /* ignore */ }
    clearTokens();
    setUser(null); setMembership(null); setMemberships([]); setOrganization(null);
  };

  const switchOrg = async (orgId) => {
    const res = await axios.post(`${API}/auth/switch-organization`, { organization_id: orgId });
    storeTokens(res.data);
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
      login, register, sendRegistrationCode, logout, logoutAll, switchOrg, hasPermission, bootstrap
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

function formatErr(e) {
  const detail = e.response?.data?.error || e.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((x) => x.msg || JSON.stringify(x)).join(' ');
  if (e.response?.status === 404) return 'Sign-in service was not found. Please refresh and try again.';
  return e.message || 'Something went wrong';
}
