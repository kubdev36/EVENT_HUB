import { useEffect, useState, lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import Layout from './Layout/Layout';
import Login from './Views/Login';
import ErrorBoundary from './Components/ErrorBoundary';
import { authApi, clearStoredAuth } from './API/API';
import { PASSWORD_CHANGE_EVENT } from './API/passwordChange';
import ChangePassword from './Views/ChangePassword';
import { VIEW_PATHS, canAccessView, pathToView, viewToPath } from './routes';

const Daily = lazy(() => import('./Views/Daily'));
const Month = lazy(() => import('./Views/Month'));
const OverView = lazy(() => import('./Views/OverView'));
const Competitors = lazy(() => import('./Views/Competitors'));
const DepartmentView = lazy(() => import('./Views/DepartmentView'));
const MediaLibrary = lazy(() => import('./Views/MediaLibrary'));
const Reports = lazy(() => import('./Views/Reports'));
const Setting = lazy(() => import('./Views/Setting'));

const AUTH_KEY = 'event-hub-auth';
const USER_KEY = 'user';
/** Trang mở gần nhất, để vào "/" thì quay lại đúng trang đó. */
const VIEW_KEY = 'event-hub-view';

/** Nội dung của từng trang cố định. */
const PAGES = {
  overview: <OverView />,
  month: <Month />,
  daily: <Daily />,
  marketing: <DepartmentView departmentCode="mkt" />,
  sale: <DepartmentView departmentCode="kinh_doanh" />,
  competitors: <Competitors />,
  'private-events': <DepartmentView departmentCode="internal" />,
  'media-library': <MediaLibrary />,
  reports: <Reports />,
  setting: <Setting />,
};

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

/** Chặn trang không có quyền xem: chuyển về Tổng quan. */
function Guard({ user, view, children }) {
  return canAccessView(user, view) ? children : <Navigate to={VIEW_PATHS.overview} replace />;
}

/** Trang phòng ban động "/department/:code". */
function DepartmentRoute({ user }) {
  const { code } = useParams();
  return (
    <Guard user={user} view={`dept-${code}`}>
      <DepartmentView departmentCode={code} />
    </Guard>
  );
}

/** "/" -> trang mở gần nhất (nếu còn quyền xem), không thì Tổng quan. */
function homePath(user) {
  const saved = localStorage.getItem(VIEW_KEY);
  return saved && canAccessView(user, saved) ? viewToPath(saved) : VIEW_PATHS.overview;
}

export default function App() {
  const [isAuthed, setIsAuthed] = useState(getInitialAuth);
  const [user, setUser] = useState(getInitialUser);
  // Người dùng tự mở màn hình đổi mật khẩu từ sidebar (không bắt buộc, có nút Hủy).
  const [changingPassword, setChangingPassword] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const view = pathToView(location.pathname);

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

  // API báo phải đổi mật khẩu (vd. admin vừa đặt lại khi đang mở app): chuyển sang màn hình đổi mật khẩu.
  useEffect(() => {
    const onRequired = () => setUser((u) => (u ? { ...u, mustChangePassword: true } : u));
    window.addEventListener(PASSWORD_CHANGE_EVENT, onRequired);
    return () => window.removeEventListener(PASSWORD_CHANGE_EVENT, onRequired);
  }, []);

  // Nhớ trang đang xem (hệ thống ngoài React).
  useEffect(() => {
    if (isAuthed && view && canAccessView(user, view)) localStorage.setItem(VIEW_KEY, view);
  }, [isAuthed, user, view]);

  const handleLogin = (nextUser) => {
    localStorage.setItem(AUTH_KEY, 'true');
    if (nextUser) {
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      setUser(nextUser);
    }
    setIsAuthed(true);
    // Giữ nguyên địa chỉ đang mở (link được gửi cho): đăng nhập xong vào đúng trang đó.
  };

  const handleLogout = () => {
    // Xóa cookie phiên ở backend; lỗi mạng vẫn đăng xuất phía giao diện.
    authApi.logout().catch((err) => console.warn('Đăng xuất phía server lỗi:', err));
    clearStoredAuth();
    localStorage.removeItem(VIEW_KEY);
    setIsAuthed(false);
    setUser(null);
    setChangingPassword(false);
    navigate('/', { replace: true });
  };

  if (!isAuthed) {
    return <Login onLogin={handleLogin} />;
  }

  // Còn mật khẩu tạm: chỉ hiện màn hình đổi mật khẩu (backend cũng chặn mọi API khác).
  if (user?.mustChangePassword || changingPassword) {
    return (
      <ChangePassword
        user={user}
        required={Boolean(user?.mustChangePassword)}
        onDone={(nextUser) => {
          localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
          setUser(nextUser);
          setChangingPassword(false);
        }}
        onCancel={() => setChangingPassword(false)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <Layout
      currentView={view ?? 'overview'}
      onNavigate={(id) => navigate(viewToPath(id))}
      onLogout={handleLogout}
      onChangePassword={() => setChangingPassword(true)}
      user={user}
    >
      {/* key theo đường dẫn: chuyển trang thì Error Boundary bắt đầu lại, lỗi trang cũ không đi theo. */}
      <ErrorBoundary key={location.pathname}>
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center p-8 text-slate-400 text-sm font-medium">
              Đang tải dữ liệu...
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to={homePath(user)} replace />} />
            {Object.entries(PAGES).map(([id, page]) => (
              <Route
                key={id}
                path={VIEW_PATHS[id]}
                element={
                  <Guard user={user} view={id}>
                    {page}
                  </Guard>
                }
              />
            ))}
            <Route path="/department/:code" element={<DepartmentRoute user={user} />} />
            <Route path="*" element={<Navigate to={VIEW_PATHS.overview} replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
