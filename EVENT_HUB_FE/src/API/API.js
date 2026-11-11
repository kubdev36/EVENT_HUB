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

/**
 * Hết phiên hẳn: xóa thông tin đăng nhập rồi tải lại đúng trang đang xem. App thấy chưa đăng nhập nên hiện
 * trang đăng nhập; đăng nhập xong quay lại trang đó. Chỉ tải lại khi trước đó đang đăng nhập (không lặp vô hạn).
 */
function endSession() {
  const wasAuthed = localStorage.getItem('event-hub-auth') === 'true';
  clearStoredAuth();
  if (wasAuthed) window.location.reload();
}

// Access token sống 15 phút. Gặp 401 thì làm mới bằng refresh token (cookie httpOnly) rồi gửi lại
// request một lần. Nhiều request cùng 401 dùng chung một lần làm mới.
let refreshing = null;
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthCall = AUTH_PATHS.some((p) => original?.url?.endsWith(p));
    if (error.response?.status !== 401 || !original || isAuthCall || original._retried) {
      if (error.response?.status === 401 && original?._retried) endSession();
      return Promise.reject(error);
    }
    original._retried = true;
    refreshing ??= api.post('/auth/refresh').finally(() => {
      refreshing = null;
    });
    try {
      await refreshing;
    } catch (refreshError) {
      // Tab khác có thể vừa làm mới (token cũ không dùng lại được): cookie mới đã có, thử lại một lần.
      if (refreshError.response?.status !== 401) return Promise.reject(error);
    }
    return api(original);
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
  products: (params) => api.get('/dashboard/products', { params }),
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

/** Ảnh tải lên máy chủ (logo đối thủ). */
export const imagesApi = {
  /** Gửi file logo; trả về { url: "/images/<tên>.webp" }. */
  uploadLogo: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/images/logo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

/** Logo lưu trên máy chủ (/images/...) cần ghép địa chỉ API; link khác dùng nguyên. */
export function logoSrc(logo, fallback = '/img/mtm.png') {
  if (!logo) return fallback;
  if (logo.startsWith('/images/')) return `${API_URL}${logo}`;
  return logo;
}

export const settingsApi = {
  getAll: () => api.get('/settings'),
  /** Mã và tên phòng ban; nhân viên cũng gọi được (GET /settings chỉ dành cho admin). */
  getDepartments: () => api.get('/settings/departments'),
  getCrawlerSources: () =>
    api.get('/settings').then((response) => {
      return { ...response, data: toCrawlerList(response.data?.crawler_sources) };
    }),
  saveCrawlers: (payload) => api.post('/settings/crawlers', payload),
  saveTelegram: (payload) => api.post('/settings/telegram', payload),
  testTelegram: (payload) => api.post('/settings/telegram/test', payload),
  saveKeywords: (payload) => api.post('/settings/keywords', payload),
  saveProducts: (payload) => api.post('/settings/products', payload),
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
