import React, { useState, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import Calendar from '../Components/Calendar';
import EventCard from '../Components/EventCard';
import EventDetail from '../Components/EventDetail';
import AddEventModal from '../Components/AddEventModal';
import { useEventHubData } from '../API/useEventHubData';

import { useFilterContext } from '../context/FilterContext';

export default function Daily() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCompetitor, setSelectedCompetitor] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const { data: eventHubData, refetch } = useEventHubData();
  const { isEventVisible } = useFilterContext();

  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

  const displayCompetitors = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return eventHubData.map((comp) => {
      const events = (comp.events || [])
        .filter(
          (ev) =>
            ev.date === dateStr &&
            isEventVisible(ev) &&
            (q === '' || comp.name.toLowerCase().includes(q) || ev.title.toLowerCase().includes(q))
        )
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      return {
        ...comp,
        events,
        totalEvents: events.length,
      };
    }).filter((comp) => comp.totalEvents > 0);
  }, [dateStr, searchQuery, eventHubData, isEventVisible]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-slate-50 text-slate-800 font-sans">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Xem theo ngày</h1>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Hiển thị toàn bộ sự kiện và hoạt động trong ngày
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60 lg:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm thương hiệu, sự kiện..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-blue-500 shadow-2xs transition"
              />
            </div>
            
            <button
              onClick={() => setShowAddModal(true)}
              className="h-9 px-3 sm:px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer shrink-0"
            >
              <Plus size={15} />
              <span className="hidden xs:inline">Thêm sự kiện</span>
            </button>
          </div>
        </div>

        <Calendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-3.5 sm:px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                Ngày {selectedDate.toLocaleDateString('vi-VN')}
              </h2>
              <span className="text-[11px] sm:text-xs text-slate-500">
                {displayCompetitors.length} thương hiệu • {displayCompetitors.reduce((acc, c) => acc + c.totalEvents, 0)} sự kiện
              </span>
            </div>
          </div>

          <div className="hidden md:grid grid-cols-[160px_1fr_150px] px-4 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100">
            <div>Thương hiệu</div>
            <div>Các sự kiện trong ngày (nhấn để xem chi tiết)</div>
            <div>Tổng quan</div>
          </div>

          <div className="p-2.5 sm:p-3 space-y-3">
            {displayCompetitors.length > 0 ? (
              displayCompetitors.map((item) => (
                <EventCard
                  key={item.id}
                  data={item}
                  onOpenDetail={setSelectedCompetitor}
                />
              ))
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                Không có sự kiện nào trong ngày này
              </div>
            )}
          </div>
        </div>

      </div>

      {selectedCompetitor && (
        <EventDetail
          data={selectedCompetitor}
          onClose={() => setSelectedCompetitor(null)}
        />
      )}

      {showAddModal && (
        <AddEventModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => refetch?.()}
        />
      )}
    </div>
  );
}
