import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import Layout from './Layout/Layout';
import Login from './Views/Login';

const Daily = lazy(() => import('./Views/Daily'));
const Month = lazy(() => import('./Views/Month'));
const OverView = lazy(() => import('./Views/OverView'));
const Competitors = lazy(() => import('./Views/Competitors'));
const Marketting = lazy(() => import('./Views/Marketting'));
const Sale = lazy(() => import('./Views/Sale'));
const PrivateEvents = lazy(() => import('./Views/PrivateEvents'));
const MediaLibrary = lazy(() => import('./Views/MediaLibrary'));
const Reports = lazy(() => import('./Views/Reports'));
const Setting = lazy(() => import('./Views/Setting'));

const AUTH_KEY = 'event-hub-auth';
const TOKEN_KEY = 'accessToken';
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
};

function normalizeDepartment(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (['marketing', 'marketting', 'mkt'].includes(normalized)) return 'mkt';
  if (['sale', 'sales', 'kinh_doanh', 'kinhdoanh', 'kd'].includes(normalized)) return 'kinh_doanh';

  return normalized;
}

function canAccessView(user, view) {
  if (user?.role === 'admin') return true;
  if (view === 'setting') return false;

  const requiredDepartment = VIEW_DEPARTMENTS[view];
  if (!requiredDepartment) return true;

  return normalizeDepartment(user?.department) === requiredDepartment;
}

function getInitialAuth() {
  return localStorage.getItem(AUTH_KEY) === 'true' && !!localStorage.getItem(TOKEN_KEY);
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

  useEffect(() => {
    if (!isAuthed && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
  }, [isAuthed]);

  useEffect(() => {
    if (isAuthed && !canAccessView(user, currentView)) {
      navigate('overview');
    }
  }, [currentView, isAdmin, isAuthed, user]);

  const navigate = (view) => {
    if (!canAccessView(user, view)) {
      view = 'overview';
    }

    const path = VIEW_TO_PATH[view] || '/overview';
    setCurrentView(view);
    localStorage.setItem(VIEW_KEY, view);
    window.history.pushState({}, '', path);
  };

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
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setIsAuthed(false);
    setUser(null);
    setCurrentView('overview');
    localStorage.setItem(VIEW_KEY, 'overview');
    window.history.pushState({}, '', '/');
  };

  const renderView = useMemo(() => {
    switch (currentView) {
      case 'daily':
        return <Daily />;
      case 'month':
        return <Month />;
      case 'overview':
        return <OverView />;
      case 'competitors':
        return <Competitors />;
      case 'marketing':
        return <Marketting />;
      case 'sale':
        return <Sale />;
      case 'private-events':
        return <PrivateEvents />;
      case 'media-library':
        return <MediaLibrary />;
      case 'reports':
        return <Reports />;
      case 'setting':
        return isAdmin ? <Setting /> : <OverView />;
      default:
        return <OverView />;
    }
  }, [currentView, isAdmin]);

  if (!isAuthed) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Layout
      currentView={currentView}
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
