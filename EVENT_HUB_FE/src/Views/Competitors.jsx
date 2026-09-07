import React, { useState, useMemo } from 'react';
import { Search, Plus, RefreshCw, Loader2, Clock } from 'lucide-react';
import Calendar from '../Components/Calendar';
import EventCard from '../Components/EventCard';
import EventDetail from '../Components/EventDetail';
import AddEventModal from '../Components/AddEventModal';
import { useEventsByDate } from '../API/useEventsByDate';
import { settingsApi } from '../API/API';

const COMPETITOR_TYPES = ['promo', 'ads', 'live', 'release', 'sale', 'other'];

export default function Competitor() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCompetitor, setSelectedCompetitor] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState('');

  const dateStr = selectedDate.toLocaleDateString('en-CA');
  const { sources, refetch } = useEventsByDate(dateStr);

  const handleCrawlAll = async () => {
    setCrawlLoading(true);
    setCrawlMessage('');
    try {
      await settingsApi.runAllCrawlers();
      await refetch?.();
      setCrawlMessage('Đã cào dữ liệu mới nhất thành công!');
      setTimeout(() => setCrawlMessage(''), 4000);
    } catch {
      setCrawlMessage('Có lỗi khi cào dữ liệu đối thủ');
      setTimeout(() => setCrawlMessage(''), 4000);
    } finally {
      setCrawlLoading(false);
    }
  };

  const displayCompetitors = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return sources
      .filter((comp) => comp.id !== 'minhtuan')
      .map((comp) => {
        const events = (comp.events || [])
          .filter(
            (ev) =>
              ev.date === dateStr &&
              COMPETITOR_TYPES.includes(ev.type) &&
              (q === '' || comp.name.toLowerCase().includes(q) || ev.title.toLowerCase().includes(q))
          )
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        return {
          ...comp,
          events,
          totalEvents: events.length,
        };
      })
      .filter((comp) => comp.totalEvents > 0);
  }, [dateStr, searchQuery, sources]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-slate-50 text-slate-800 font-sans">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Đối thủ</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                <Clock size={11} />
                <span>Auto cào 6h/lần</span>
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Hiển thị toàn bộ sự kiện và hoạt động của các đối thủ cạnh tranh</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm đối thủ, sự kiện..."
                className="h-9 w-full sm:w-60 lg:w-72 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-blue-500 shadow-2xs"
              />
            </div>
            <button
              onClick={handleCrawlAll}
              disabled={crawlLoading}
              className="h-9 px-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
              title="Cào ngay toàn bộ các trang đối thủ"
            >
              {crawlLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  <span>Đang cào tất cả...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={14} className="text-blue-600" />
                  <span>Cào tất cả</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer shrink-0"
            >
              <Plus size={15} />
              <span>Thêm sự kiện</span>
            </button>
          </div>
        </div>

        {crawlMessage && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between animate-in fade-in duration-200">
            <span>{crawlMessage}</span>
          </div>
        )}

        <Calendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          allowedTypes={COMPETITOR_TYPES}
          excludeCompetitorId="minhtuan"
        />

        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-3 sm:px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Ngày {selectedDate.toLocaleDateString('vi-VN')}
              </h2>
              <span className="text-[11px] sm:text-xs text-slate-500">
                {displayCompetitors.length} đối thủ • {displayCompetitors.reduce((acc, c) => acc + c.totalEvents, 0)} sự kiện
              </span>
            </div>
          </div>

          <div className="hidden md:grid grid-cols-[160px_1fr_150px] px-4 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100">
            <div>Đối thủ</div>
            <div>Sự kiện trong ngày</div>
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
                Không có sự kiện nào của đối thủ trong ngày này
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
          defaultBrandId="cellphones"
          defaultType="promo"
        />
      )}
    </div>
  );
}
