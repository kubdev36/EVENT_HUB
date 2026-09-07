import React from 'react';
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
import { getBrandLogo } from '../constants/brandLogos';

const MENU_ITEMS = [
  { id: 'overview', label: 'Tổng quan', icon: Home },
  { id: 'month', label: 'Lịch tháng', icon: Calendar },
  { id: 'daily', label: 'Xem theo ngày', icon: CalendarDays },
  { id: 'marketing', label: 'MKT', icon: Megaphone },
  { id: 'sale', label: 'Kinh doanh', icon: Store },
  { id: 'competitors', label: 'Đối thủ', icon: Users },
  { id: 'private-events', label: 'Sự kiện nội bộ', icon: Building2 },
  { id: 'media-library', label: 'Thư viện ảnh', icon: ImageIcon },
  { id: 'reports', label: 'Báo cáo', icon: FileText },
  { id: 'setting', label: 'Cài đặt', icon: Settings },
];

const QUICK_FILTERS = [
  { id: 'all', label: 'Tất cả', color: 'bg-blue-600 border-blue-600' },
  { id: 'mkt', label: 'MKT', color: 'bg-emerald-500 border-emerald-500' },
  { id: 'sale', label: 'Kinh doanh', color: 'bg-cyan-500 border-cyan-500' },
  { id: 'competitor', label: 'Đối thủ', color: 'bg-orange-500 border-orange-500' },
  { id: 'internal', label: 'Sự kiện nội bộ', color: 'bg-purple-600 border-purple-600' },
];

import { useFilterContext } from '../context/FilterContext';

const MENU_DEPARTMENTS = {
  marketing: 'mkt',
  sale: 'kinh_doanh',
};

const FILTER_DEPARTMENTS = {
  mkt: 'mkt',
  sale: 'kinh_doanh',
};

function normalizeDepartment(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (['marketing', 'marketting', 'mkt'].includes(normalized)) return 'mkt';
  if (['sale', 'sales', 'kinh_doanh', 'kinhdoanh', 'kd'].includes(normalized)) return 'kinh_doanh';

  return normalized;
}

export default function Sidebar({ currentView = 'overview', onNavigate, isOpen, onClose, user }) {
  const { data: sources } = useEventHubData();
  const { checkedFilters, toggleFilter } = useFilterContext();
  const department = normalizeDepartment(user?.department);
  const menuItems = user?.role === 'admin'
    ? MENU_ITEMS
    : MENU_ITEMS.filter((item) => item.id !== 'setting' && (!MENU_DEPARTMENTS[item.id] || MENU_DEPARTMENTS[item.id] === department));
  const quickFilters = user?.role === 'admin'
    ? QUICK_FILTERS
    : QUICK_FILTERS.filter((item) => !FILTER_DEPARTMENTS[item.id] || FILTER_DEPARTMENTS[item.id] === department);

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
                    src={getBrandLogo(item.id, item.name, item.logo)}
                    alt={item.name}
                    onError={(e) => { e.currentTarget.src = getBrandLogo(item.id, item.name); }}
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
