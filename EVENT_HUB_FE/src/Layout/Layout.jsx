import React, { useState } from 'react';
import { LogOut, Menu } from 'lucide-react';
import Sidebar from '../Components/Sidebar';

export default function Layout({ currentView, onNavigate, onLogout, user, children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans bg-[#f8fafc]">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        user={user}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
              title="Mở menu"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/img/mtm.jpg"
                alt="Logo"
                className="w-7 h-7 rounded-md object-contain border border-slate-100 shadow-2xs shrink-0"
              />
              <span className="text-sm font-bold text-slate-900 truncate">Event Hub</span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer shrink-0"
          >
            <LogOut size={14} />
            <span>Đăng xuất</span>
          </button>
        </header>

        {/* Thêm flex-1 min-h-0 và overflow-y-auto để kích hoạt thanh cuộn cho toàn bộ nội dung con */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-[#f8fafc]">
          {children}
        </main>
      </div>
    </div>
  );
}
