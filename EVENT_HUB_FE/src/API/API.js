import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

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

/** API dashboard mới: số liệu tính sẵn bằng SQL (Tổng quan, Báo cáo). */
export const dashboardApi = {
  summary: (params) => api.get('/dashboard/summary', { params }),
  timeseries: (params) => api.get('/dashboard/timeseries', { params }),
  breakdown: (params) => api.get('/dashboard/breakdown', { params }),
  events: (params) => api.get('/dashboard/events', { params }),
  sources: () => api.get('/dashboard/sources'),
};

export const eventsApi = {
  create: (payload) => api.post('/events', payload),
};

/** crawler_sources trong DB có thể là mảng hoặc { targets } / { sources }; luôn trả mảng. */
export function toCrawlerList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.targets)) return value.targets;
  if (Array.isArray(value?.sources)) return value.sources;
  return [];
}

export const settingsApi = {
  getAll: () => api.get('/settings'),
  getCrawlerSources: () =>
    api.get('/settings').then((response) => {
      return { ...response, data: toCrawlerList(response.data?.crawler_sources) };
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
