import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { useEventHubData } from '../API/useEventHubData';
import { settingsApi } from '../API/API';
import { normalizeDepartment } from '../utils/helpers';
import { useFilterContext } from '../context/FilterContext';

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

export default function Sidebar({ currentView = 'overview', onNavigate, isOpen, onClose, user }) {
  const { data: sources } = useEventHubData();
  const { checkedFilters, toggleFilter } = useFilterContext();
  const [departments, setDepartments] = useState([]);
  const userDept = normalizeDepartment(user?.department);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let active = true;
    settingsApi.getAll()
      .then((res) => {
        if (!active) return;
        const list = res.data?.departments_list;
        if (Array.isArray(list) && list.length > 0) {
          setDepartments(list);
        }
      })
      .catch(() => {});
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
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/img/mtm.jpg" alt="Logo" className="w-9 h-9 rounded-lg object-contain border border-slate-100 shadow-2xs" />
            <div>
              <div className="text-[14px] font-bold text-slate-900 leading-tight">Event Hub</div>
              <div className="text-[10px] font-medium text-slate-400 leading-tight">Intelligence Center</div>
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
                  className={`w-full h-9 rounded-lg px-3 flex items-center gap-3 text-[13px] font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-[#1877f2] text-white shadow-xs font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-white' : 'text-slate-500'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-2 border-t border-slate-100">
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 px-1">
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
            <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 px-1">
              Đối thủ nổi bật
            </div>
            <div className="space-y-1">
              {sources.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 px-1 py-1 rounded-md hover:bg-slate-50 cursor-pointer text-xs font-medium text-slate-700 transition"
                >
                  <img
                    src={item.logo || '/img/mtm.jpg'}
                    alt={item.name}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/img/mtm.jpg';
                    }}
                    className="w-4 h-4 rounded object-contain border border-slate-100 bg-white"
                  />
                  <span className="truncate">{item.name}</span>
                </div>
              ))}
              <button className="w-full text-left flex items-center gap-1.5 px-1 py-1.5 text-xs font-semibold text-[#1877f2] hover:text-blue-700 mt-1 cursor-pointer">
                <Plus size={14} />
                <span>Thêm đối thủ</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
