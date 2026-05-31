import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15_000,
});

// Attach session token to every request
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('session_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear token and reload
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('session_token');
      window.location.reload();
    }
    return Promise.reject(err);
  },
);

export default api;
