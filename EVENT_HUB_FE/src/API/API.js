import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Phiên đăng nhập nằm trong cookie httpOnly do backend đặt; trình duyệt tự gửi kèm (withCredentials).
// X-Requested-With: backend bắt buộc header này với request ghi dữ liệu (chống CSRF).
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

/** Xóa thông tin đăng nhập cũ trong trình duyệt (token cũ từng lưu ở localStorage). */
export function clearStoredAuth() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  localStorage.removeItem('event-hub-auth');
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Hết phiên: về trang đăng nhập. Bỏ qua khi đang ở trang đăng nhập để không tải lại vô hạn.
    if (error.response?.status === 401 && window.location.pathname !== '/') {
      clearStoredAuth();
      window.location.href = '/';
    } else if (error.response?.status === 401) {
      clearStoredAuth();
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
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

/** Nhật ký thao tác (chỉ admin). */
export const auditApi = {
  list: (params) => api.get('/audit-logs', { params }),
};

export const usersApi = {
  list: () => api.get('/users'),
  create: (payload) => api.post('/users', payload),
  update: (id, payload) => api.put(`/users/${id}`, payload),
  resetPassword: (id) => api.put(`/users/${id}/reset-password`),
  remove: (id) => api.delete(`/users/${id}`),
};

export default api;
