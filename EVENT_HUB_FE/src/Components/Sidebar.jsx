import { useEffect, useState } from 'react';
import {
  Home,
  Calendar,
  CalendarDays,
  Megaphone,
  Store,
  Users,
  Building2,
  Image as ImageIcon,
  FileText,
  Settings,
  Plus,
  Check,
  X,
  LogOut,
} from 'lucide-react';
import { useSources } from '../API/useDashboardEvents';
import { settingsApi } from '../API/API';
import { useQueryClient } from '@tanstack/react-query';
import { addCrawlerSource } from '../API/crawlerSources';
import CrawlerModal from '../Views/Settings/modals/CrawlerModal';

const EMPTY_CRAWLER_FORM = { name: '', logo: '', interval: '6h', targetUrls: [''] };
import { normalizeDepartment } from '../utils/helpers';
import { useFilterContext } from '../context/useFilterContext';

const BASE_MENU_TOP = [
  { id: 'overview', label: 'Tổng quan', icon: Home },
  { id: 'month', label: 'Lịch tháng', icon: Calendar },
  { id: 'daily', label: 'Xem theo ngày', icon: CalendarDays },
];

const BASE_MENU_BOTTOM = [
  { id: 'competitors', label: 'Đối thủ', icon: Users },
  { id: 'media-library', label: 'Thư viện ảnh', icon: ImageIcon },
  { id: 'reports', label: 'Báo cáo', icon: FileText },
  { id: 'setting', label: 'Cài đặt', icon: Settings },
];

const FILTER_COLORS = [
  'bg-emerald-500 border-emerald-500',
  'bg-cyan-500 border-cyan-500',
  'bg-purple-600 border-purple-600',
  'bg-indigo-500 border-indigo-500',
  'bg-amber-500 border-amber-500',
  'bg-rose-500 border-rose-500',
];

function getDepartmentIcon(code) {
  const norm = normalizeDepartment(code);
  if (norm === 'mkt') return Megaphone;
  if (norm === 'kinh_doanh') return Store;
  return Building2;
}

function getDepartmentViewId(code) {
  const norm = normalizeDepartment(code);
  if (norm === 'mkt') return 'marketing';
  if (norm === 'kinh_doanh') return 'sale';
  if (norm === 'internal') return 'private-events';
  return `dept-${norm}`;
}

export default function Sidebar({ currentView = 'overview', onNavigate, isOpen, onClose, user, onLogout }) {
  // Chỉ cần tên và logo của đối thủ: gọi API nhẹ, không tải toàn bộ bài viết.
  const { sources: allSources } = useSources();
  const sources = allSources.filter((s) => !s.own);
  const { checkedFilters, toggleFilter } = useFilterContext();
  const [departments, setDepartments] = useState([]);
  const userDept = normalizeDepartment(user?.department);
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  // Popup "Thêm đối thủ" (cùng popup và cách lưu với Cài đặt > Cấu hình Crawler).
  const [crawlerForm, setCrawlerForm] = useState(null);
  const [crawlerSaving, setCrawlerSaving] = useState(false);
  const [crawlerError, setCrawlerError] = useState('');

  const openAddCrawler = () => {
    setCrawlerError('');
    setCrawlerForm(EMPTY_CRAWLER_FORM);
  };
  const saveCrawler = async () => {
    setCrawlerSaving(true);
    setCrawlerError('');
    try {
      await addCrawlerSource(crawlerForm);
      setCrawlerForm(null);
      // Cập nhật danh sách đối thủ ở thanh bên và các trang dùng danh sách nguồn.
      await queryClient.invalidateQueries({ queryKey: ['dash', 'sources'] });
    } catch (err) {
      setCrawlerError(err.response?.data?.message || err.message || 'Thêm đối thủ thất bại.');
    } finally {
      setCrawlerSaving(false);
    }
  };

  useEffect(() => {
    let active = true;
    settingsApi.getDepartments()
      .then((res) => {
        if (!active) return;
        if (Array.isArray(res.data)) setDepartments(res.data);
      })
      .catch((err) => {
        // Không chặn trang: menu vẫn có các mục chung, chỉ thiếu mục phòng ban.
        console.error('Không tải được danh sách phòng ban:', err);
      });
    return () => { active = false; };
  }, []);

  // Construct dynamic department menu items
  const deptMenuItems = departments
    .filter((dept) => isAdmin || normalizeDepartment(dept.code) === userDept)
    .map((dept) => ({
      id: getDepartmentViewId(dept.code),
      label: dept.name,
      icon: getDepartmentIcon(dept.code),
      code: dept.code,
    }));

  const menuItems = [
    ...BASE_MENU_TOP,
    ...deptMenuItems,
    ...BASE_MENU_BOTTOM.filter((item) => (item.id === 'setting' ? isAdmin : true)),
  ];

  // Quick filters
  const quickFilters = [
    { id: 'all', label: 'Tất cả', color: 'bg-blue-600 border-blue-600' },
    ...departments
      .filter((dept) => isAdmin || normalizeDepartment(dept.code) === userDept)
      .map((dept, idx) => ({
        id: normalizeDepartment(dept.code) === 'kinh_doanh' ? 'sale' : normalizeDepartment(dept.code),
        label: dept.name,
        color: FILTER_COLORS[idx % FILTER_COLORS.length],
      })),
    { id: 'competitor', label: 'Đối thủ', color: 'bg-orange-500 border-orange-500' },
  ];

  const handleItemClick = (id) => {
    onNavigate?.(id);
    onClose?.();
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      <aside
        className={`fixed lg:static top-0 left-0 z-50 w-60 shrink-0 border-r border-slate-200 bg-white flex h-full flex-col select-none transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Header của Sidebar (Cố định chiều cao, không bị cuộn) */}
        <div className="h-20 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/img/mtm.png" alt="Logo" className="w-14 h-14 rounded-xl object-contain border border-slate-100" />
            <div>
              <div className="text-[16px] font-bold text-slate-900 leading-tight">Event Hub</div>
              <div className="text-[11px] font-medium text-slate-400 leading-tight">Intelligence Center</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Phần nội dung bên trong có thể cuộn dọc (overflow-y-auto) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-5">
          <nav className="space-y-0.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`relative w-full h-9 rounded-lg px-3 flex items-center gap-3 text-[13px] font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-50 text-blue-700 font-semibold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-blue-600'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-blue-600' : 'text-slate-500'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-2 border-t border-slate-100">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
              Bộ lọc nhanh
            </div>
            <div className="space-y-1.5 px-1">
              {quickFilters.map((item) => {
                const isChecked = checkedFilters[item.id];
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleFilter(item.id)}
                    className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 py-0.5 hover:text-slate-900 select-none"
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center text-white border transition-colors ${
                        isChecked ? item.color : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isChecked && <Check size={10} strokeWidth={3} />}
                    </div>
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
              Đối thủ nổi bật
            </div>
            <div className="space-y-1">
              {sources.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 px-1 py-1 rounded-md hover:bg-slate-50 cursor-pointer text-xs font-medium text-slate-700 transition"
                >
                  <img
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={item.logo || '/img/mtm.png'}
                    alt={item.name}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/img/mtm.png';
                    }}
                    className="w-4 h-4 rounded object-contain border border-slate-100 bg-white"
                  />
                  <span className="truncate">{item.name}</span>
                </div>
              ))}
              {/* Chỉ admin được lưu cấu hình nguồn. */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={openAddCrawler}
                  className="w-full text-left flex items-center gap-1.5 px-1 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 mt-1 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Thêm đối thủ</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tài khoản và đăng xuất, luôn nằm cuối sidebar. */}
        <div className="shrink-0 border-t border-slate-100 p-3">
          {user?.email && (
            <div className="px-1 pb-2 text-[11px] text-slate-500 truncate" title={user.email}>
              {user.email}
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="w-full h-9 rounded-lg px-3 flex items-center gap-3 text-[13px] font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition cursor-pointer"
          >
            <LogOut size={16} className="text-slate-500" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      <CrawlerModal
        isOpen={Boolean(crawlerForm)}
        mode="add"
        formData={crawlerForm ?? EMPTY_CRAWLER_FORM}
        setFormData={setCrawlerForm}
        onClose={() => setCrawlerForm(null)}
        onSave={saveCrawler}
        saving={crawlerSaving}
        error={crawlerError}
      />
    </>
  );
}
