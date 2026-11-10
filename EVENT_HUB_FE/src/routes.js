import { normalizeDepartment } from './utils/helpers';

/** Đường dẫn của từng trang (id trang dùng trong Sidebar/Layout). */
export const VIEW_PATHS = {
  overview: '/overview',
  month: '/month',
  daily: '/daily',
  marketing: '/marketing',
  sale: '/sale',
  competitors: '/competitors',
  'private-events': '/private-events',
  'media-library': '/media-library',
  reports: '/reports',
  setting: '/setting',
};

/** Trang chỉ phòng ban này (và admin) được xem. */
const VIEW_DEPARTMENTS = {
  marketing: 'mkt',
  sale: 'kinh_doanh',
  'private-events': 'internal',
};

/** Đường dẫn -> id trang; trang phòng ban động "/department/<mã>" -> "dept-<mã>". Không khớp -> null. */
export function pathToView(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  const dept = path.match(/^\/department\/([a-z0-9_-]+)$/i);
  if (dept) return `dept-${dept[1]}`;
  return Object.keys(VIEW_PATHS).find((view) => VIEW_PATHS[view] === path) ?? null;
}

/** id trang -> đường dẫn. */
export function viewToPath(view) {
  if (view?.startsWith('dept-')) return `/department/${encodeURIComponent(view.slice(5))}`;
  return VIEW_PATHS[view] ?? VIEW_PATHS.overview;
}

/** Quyền xem trang: admin xem hết; Cài đặt chỉ admin; trang phòng ban chỉ người thuộc phòng ban đó. */
export function canAccessView(user, view) {
  if (!view) return false;
  if (user?.role === 'admin') return true;
  if (view === 'setting') return false;
  if (view.startsWith('dept-'))
    return normalizeDepartment(user?.department) === normalizeDepartment(view.slice(5));
  const required = VIEW_DEPARTMENTS[view];
  return !required || normalizeDepartment(user?.department) === required;
}
