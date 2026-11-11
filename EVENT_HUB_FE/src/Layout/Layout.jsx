import { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from '../Components/Sidebar';

export default function Layout({ currentView, onNavigate, onLogout, onChangePassword, user, children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans bg-[#f8fafc]">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        user={user}
        onLogout={onLogout}
        onChangePassword={onChangePassword}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Chỉ hiện trên điện thoại để mở menu; trên máy tính đã có sidebar. */}
        <header className="lg:hidden h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
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
                loading="lazy"
                referrerPolicy="no-referrer"
                src="/img/mtm.png"
                alt="Logo"
                className="w-7 h-7 rounded-md object-contain border border-slate-100 shadow-2xs shrink-0"
              />
              <span className="text-sm font-bold text-slate-900 truncate">Event Hub</span>
            </div>
          </div>

        </header>

        <main className="flex-1 min-h-0 overflow-y-auto bg-[#f8fafc]">
          {children}
        </main>
      </div>
    </div>
  );
}
