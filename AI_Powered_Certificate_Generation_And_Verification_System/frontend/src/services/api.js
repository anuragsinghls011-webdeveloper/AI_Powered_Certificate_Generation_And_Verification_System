import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// Pre-configured axios instance (optional usage)
const apiClient = axios.create({
  baseURL: API,
  headers: {
    'Content-Type': 'application/json'
  }
});

export { API, BACKEND_URL, apiClient };
export default axios;
