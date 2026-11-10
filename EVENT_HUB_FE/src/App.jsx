import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import Layout from './Layout/Layout';
import Login from './Views/Login';
import { authApi, clearStoredAuth } from './API/API';

const Daily = lazy(() => import('./Views/Daily'));
const Month = lazy(() => import('./Views/Month'));
const OverView = lazy(() => import('./Views/OverView'));
const Competitors = lazy(() => import('./Views/Competitors'));
const DepartmentView = lazy(() => import('./Views/DepartmentView'));
const MediaLibrary = lazy(() => import('./Views/MediaLibrary'));
const Reports = lazy(() => import('./Views/Reports'));
const Setting = lazy(() => import('./Views/Setting'));

import { normalizeDepartment } from './utils/helpers';

const AUTH_KEY = 'event-hub-auth';
const USER_KEY = 'user';
const VIEW_KEY = 'event-hub-view';
const VIEW_PATHS = {
  '/overview': 'overview',
  '/month': 'month',
  '/daily': 'daily',
  '/marketing': 'marketing',
  '/sale': 'sale',
  '/competitors': 'competitors',
  '/private-events': 'private-events',
  '/media-library': 'media-library',
  '/reports': 'reports',
  '/setting': 'setting',
};

const VIEW_TO_PATH = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([path, view]) => [view, path])
);

const VIEW_DEPARTMENTS = {
  marketing: 'mkt',
  sale: 'kinh_doanh',
  'private-events': 'internal',
};

function canAccessView(user, view) {
  if (user?.role === 'admin') return true;
  if (view === 'setting') return false;

  if (view.startsWith('dept-')) {
    const deptCode = view.replace('dept-', '');
    return normalizeDepartment(user?.department) === normalizeDepartment(deptCode);
  }

  const requiredDepartment = VIEW_DEPARTMENTS[view];
  if (!requiredDepartment) return true;

  return normalizeDepartment(user?.department) === requiredDepartment;
}

function getInitialAuth() {
  // Token cũ trong localStorage (trước khi chuyển sang cookie httpOnly) không dùng nữa: xóa đi.
  localStorage.removeItem('accessToken');
  return localStorage.getItem(AUTH_KEY) === 'true';
}

function getInitialUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getViewFromLocation() {
  const path = window.location.pathname;
  if (path.startsWith('/department/')) {
    const code = path.replace('/department/', '');
    return `dept-${code}`;
  }
  return VIEW_PATHS[path] || localStorage.getItem(VIEW_KEY) || 'overview';
}

export default function App() {
  const [isAuthed, setIsAuthed] = useState(getInitialAuth);
  const [user, setUser] = useState(getInitialUser);
  const [currentView, setCurrentView] = useState(getViewFromLocation);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const onPopState = () => {
      setCurrentView(getViewFromLocation());
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Kiểm tra cookie phiên còn hợp lệ khi mở app; hết hạn hoặc chưa có thì về trang đăng nhập.
  useEffect(() => {
    if (!isAuthed) return;
    let active = true;
    authApi
      .me()
      .then((res) => {
        if (!active || !res.data?.user) return;
        localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
        setUser(res.data.user);
      })
      .catch((err) => {
        if (!active || err.response?.status !== 401) return;
        clearStoredAuth();
        setIsAuthed(false);
        setUser(null);
      });
    return () => {
      active = false;
    };
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
  }, [isAuthed]);

  const navigate = (view) => {
    if (!canAccessView(user, view)) {
      view = 'overview';
    }

    const path = VIEW_TO_PATH[view] || (view.startsWith('dept-') ? `/department/${view.replace('dept-', '')}` : '/overview');
    setCurrentView(view);
    localStorage.setItem(VIEW_KEY, view);
    window.history.pushState({}, '', path);
  };

  // Trang không có quyền xem thì hiện Tổng quan (tính khi render, không đặt state trong effect).
  const view = isAuthed && !canAccessView(user, currentView) ? 'overview' : currentView;
  // Đồng bộ địa chỉ trên thanh URL và trang đã lưu (hệ thống bên ngoài React).
  useEffect(() => {
    if (view === currentView) return;
    window.history.replaceState({}, '', VIEW_TO_PATH.overview || '/overview');
    localStorage.setItem(VIEW_KEY, 'overview');
  }, [view, currentView]);

  const handleLogin = (nextUser) => {
    localStorage.setItem(AUTH_KEY, 'true');
    if (nextUser) {
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      setUser(nextUser);
    }
    setIsAuthed(true);
    navigate('overview');
  };

  const handleLogout = () => {
    // Xóa cookie phiên ở backend; lỗi mạng vẫn đăng xuất phía giao diện.
    authApi.logout().catch((err) => console.warn('Đăng xuất phía server lỗi:', err));
    clearStoredAuth();
    setIsAuthed(false);
    setUser(null);
    setCurrentView('overview');
    localStorage.setItem(VIEW_KEY, 'overview');
    window.history.pushState({}, '', '/');
  };

  const renderView = useMemo(() => {
    switch (view) {
      case 'daily':
        return <Daily />;
      case 'month':
        return <Month />;
      case 'overview':
        return <OverView />;
      case 'competitors':
        return <Competitors />;
      case 'marketing':
        return <DepartmentView departmentCode="mkt" />;
      case 'sale':
        return <DepartmentView departmentCode="kinh_doanh" />;
      case 'private-events':
        return <DepartmentView departmentCode="internal" />;
      case 'media-library':
        return <MediaLibrary />;
      case 'reports':
        return <Reports />;
      case 'setting':
        return isAdmin ? <Setting /> : <OverView />;
      default:
        if (view.startsWith('dept-')) {
          const dept = view.replace('dept-', '');
          return <DepartmentView departmentCode={dept} />;
        }
        return <OverView />;
    }
  }, [view, isAdmin]);

  if (!isAuthed) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Layout
      currentView={view}
      onNavigate={navigate}
      onLogout={handleLogout}
      user={user}
    >
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center p-8 text-slate-400 text-sm font-medium">
            Đang tải dữ liệu...
          </div>
        }
      >
        {renderView}
      </Suspense>
    </Layout>
  );
}
