import axios from 'axios';

const RENDER_URL = 'https://ai-powered-certificate-generation-and.onrender.com';
const API = (process.env.REACT_APP_BACKEND_URL || RENDER_URL).replace(/\/+$/, '') + '/api';
const BACKEND_URL = API.replace(/\/api$/, '');

axios.defaults.headers.common['Content-Type'] = 'application/json';

const apiClient = axios.create({
  baseURL: API,
  headers: { 'Content-Type': 'application/json' }
});

const tokenInterceptor = (config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

axios.interceptors.request.use(tokenInterceptor);
apiClient.interceptors.request.use(tokenInterceptor);

export async function downloadCertificatePdf(certId) {
  try {
    const response = await axios.get(`${API}/verify/${encodeURIComponent(certId)}/download-pdf`, {
      responseType: 'blob',
      timeout: 30000
    });
    if (!(response.data instanceof Blob) || !response.data.size) throw new Error('Empty download');
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Certificate_${certId}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) {
    console.error('Download failed', error);
    alert('Failed to download certificate PDF. Please try again.');
  }
}

export { API, BACKEND_URL, apiClient };
export default axios;
