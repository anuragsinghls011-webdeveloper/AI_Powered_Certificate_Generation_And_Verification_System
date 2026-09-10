// Reuse the global Axios client so cookie auth and silent refresh remain intact.
import axios, { API } from './api';

const config = (organizationId, signal) => ({ headers: { 'x-organization-id': organizationId }, signal });
export const loadReportEvents = (organizationId, signal) => axios.get(`${API}/reports/events`, config(organizationId, signal));
export const loadEventSummary = (id, organizationId, signal) => axios.get(`${API}/reports/events/${encodeURIComponent(id)}/summary`, config(organizationId, signal));

export async function downloadEventReport(id, format, organizationId, signal) {
  const response = await axios.get(`${API}/reports/events/${encodeURIComponent(id)}`, {
    ...config(organizationId, signal), params: { format }, responseType: 'blob', timeout: 150000
  });
  if (!(response.data instanceof Blob) || !response.data.size) throw new Error('The download was empty. Please try again.');
  const disposition = response.headers['content-disposition'] || '';
  const filename = disposition.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] || `event-report-${id}.${format}`;
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = filename;
    anchor.dataset.testid = 'report-download-link';
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Let the browser consume the object URL before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

export async function reportError(error) {
  let data = error.response?.data;
  if (data instanceof Blob) {
    try { data = JSON.parse(await data.text()); } catch { data = null; }
  }
  if (error.response?.status === 401) return 'Your session expired. Please sign in again.';
  if (error.response?.status === 403) return 'You do not have permission to view these event reports.';
  if (typeof data?.error === 'string' && error.response?.status < 500) return data.error;
  if (error.response?.status >= 500) return 'Unable to generate the event report. Please try again.';
  if (error.code === 'ECONNABORTED') return 'The report request timed out. Please try again.';
  if (!error.response) return 'Could not download the report. Check your connection and try again.';
  return 'Unable to load the report. Please try again.';
}