import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
let csrfRequest;
// Register once, before React mounts. Cookies remain HttpOnly; no tokens in storage.
axios.interceptors.request.use(async config => {
  const url = new URL(config.url, window.location.origin);
  if (!url.href.startsWith(`${API}/`)) return config;
  config.withCredentials = true;
  if (['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) return config;
  if (!csrfRequest) csrfRequest = axios.get(`${API}/auth/csrf`).then(r => r.data.csrf_token).finally(() => { csrfRequest = null; });
  config.headers = config.headers || {};
  config.headers['X-CSRF-Token'] = await csrfRequest;
  return config;
});
axios.interceptors.response.use(r => r, async error => {
  const config = error.config;
  if (error.response?.data?.code === 'CSRF_INVALID' && config && !config._csrfRetried) {
    config._csrfRetried = true;
    return axios(config); // Rejected before business logic; safe to refresh only this failure.
  }
  return Promise.reject(error);
});