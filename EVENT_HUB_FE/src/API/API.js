import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      localStorage.removeItem('event-hub-auth');
      window.location.href = '/';
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
};

export const eventsApi = {
  list: (limit = 50) => api.get('/events', { params: { limit } }),
  latest: (limit = 20) => api.get('/events/latest', { params: { limit } }),
  overview: (limit = 500) => api.get('/events/overview', { params: { limit } }),
  byDate: (date, limit = 500) => api.get('/events/by-date', { params: { date, limit } }),
  create: (payload) => api.post('/events', payload),
};

export const settingsApi = {
  getAll: () => api.get('/settings'),
  getCrawlerSources: () =>
    api.get('/settings').then((response) => {
      const value = response.data?.crawler_sources;
      const sources = Array.isArray(value) ? value : value?.sources || value?.targets || [];
      return { ...response, data: sources };
    }),
  saveCrawlers: (payload) => api.post('/settings/crawlers', payload),
  saveTelegram: (payload) => api.post('/settings/telegram', payload),
  testTelegram: (payload) => api.post('/settings/telegram/test', payload),
  saveKeywords: (payload) => api.post('/settings/keywords', payload),
  saveDepartments: (payload) => api.post('/settings/departments', payload),
  runCrawler: (payload) => api.post('/settings/crawler/run', payload),
  runCrawlerById: (id) => api.post(`/settings/crawler/run/${id}`),
  runAllCrawlers: () => api.post('/crawlers/run'),
};

export const usersApi = {
  list: () => api.get('/users'),
  create: (payload) => api.post('/users', payload),
  update: (id, payload) => api.put(`/users/${id}`, payload),
  resetPassword: (id) => api.put(`/users/${id}/reset-password`),
  remove: (id) => api.delete(`/users/${id}`),
};

export default api;
