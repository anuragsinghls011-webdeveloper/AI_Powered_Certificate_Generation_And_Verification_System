import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// Pre-configured axios instance (optional usage)
const apiClient = axios.create({
  baseURL: API,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

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
