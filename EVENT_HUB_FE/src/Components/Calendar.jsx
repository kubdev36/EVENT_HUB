import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEventsByDate } from '../API/useEventsByDate';

const DAYS_OF_WEEK = ['Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'CN'];

const LEGEND_MAP = {
  ads: { label: 'MKT (Quảng cáo)', dot: 'bg-emerald-500' },
  promo: { label: 'Kinh doanh (Khuyến mãi)', dot: 'bg-orange-500' },
  live: { label: 'Livestream', dot: 'bg-blue-600' },
  release: { label: 'Ra mắt', dot: 'bg-purple-600' },
  internal: { label: 'Sự kiện nội bộ', dot: 'bg-violet-600' },
};

const EVENT_TEXT_COLORS = {
  ads: 'text-emerald-600 font-extrabold',
  promo: 'text-orange-500 font-extrabold',
  live: 'text-blue-600 font-extrabold',
  release: 'text-purple-600 font-extrabold',
  internal: 'text-violet-600 font-extrabold',
  multiple: 'text-red-600 font-extrabold',
};

import { useFilterContext } from '../context/FilterContext';

export default function Calendar({
  selectedDate,
  onSelectDate,
  allowedTypes = null,
  competitorId = null,
  excludeCompetitorId = null,
}) {
  const [viewDate, setViewDate] = useState(selectedDate || new Date());
  const monthKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const { sources } = useEventsByDate();
  const { isEventVisible } = useFilterContext();

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const filteredEvents = useMemo(() => {
    return sources
      .filter((comp) => {
        if (competitorId) return comp.id === competitorId;
        if (excludeCompetitorId) return comp.id !== excludeCompetitorId;
        return true;
      })
      .flatMap((comp) => comp.events || [])
      .filter((ev) => {
        if (!isEventVisible(ev)) return false;
        if (!allowedTypes || allowedTypes.length === 0) return true;
        return allowedTypes.includes(ev.type) && String(ev.date || '').startsWith(monthKey);
      });
  }, [allowedTypes, competitorId, excludeCompetitorId, sources, monthKey, isEventVisible]);

  const eventsByDate = useMemo(() => {
    const map = {};
    filteredEvents.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev.type);
    });
    return map;
  }, [filteredEvents]);

  const calendarDays = useMemo(() => {
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        dayNum: i,
        dateStr,
        dateObj: new Date(year, month, i),
        eventTypes: eventsByDate[dateStr] || [],
      });
    }
    return days;
  }, [year, month, eventsByDate]);

  const activeLegends = useMemo(() => {
    if (!allowedTypes || allowedTypes.length === 0) {
      return Object.entries(LEGEND_MAP);
    }
    return Object.entries(LEGEND_MAP).filter(([key]) => allowedTypes.includes(key));
  }, [allowedTypes]);

  const changeMonth = (offset) => {
    setViewDate(new Date(year, month + offset, 1));
  };

  const isSelected = (dayItem) => {
    if (!dayItem || !selectedDate) return false;
    return (
      dayItem.dateObj.getDate() === selectedDate.getDate() &&
      dayItem.dateObj.getMonth() === selectedDate.getMonth() &&
      dayItem.dateObj.getFullYear() === selectedDate.getFullYear()
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs flex flex-col md:flex-row gap-4 md:gap-6 justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-xs sm:text-sm font-bold text-slate-900">
            Tháng {month + 1} năm {year}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => changeMonth(-1)}
              className="p-1 sm:p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => changeMonth(1)}
              className="p-1 sm:p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-[10px] sm:text-xs font-semibold text-slate-400 mb-1 sm:mb-2">
          {DAYS_OF_WEEK.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
          {calendarDays.map((item, idx) => {
            if (!item) return <div key={idx} />;

            const selected = isSelected(item);
            const hasEvents = item.eventTypes.length > 0;
            const isMultiple = item.eventTypes.length > 1;

            let numberColorClass = 'text-slate-700 font-medium hover:bg-slate-100';

            if (selected) {
              numberColorClass = 'bg-blue-600 text-white font-extrabold shadow-2xs';
            } else if (isMultiple) {
              numberColorClass = `${EVENT_TEXT_COLORS.multiple} hover:bg-red-50`;
            } else if (hasEvents) {
              const singleType = item.eventTypes[0];
              const color = EVENT_TEXT_COLORS[singleType] || 'text-purple-600 font-extrabold';
              numberColorClass = `${color} hover:bg-slate-50`;
            }

            return (
              <div key={idx} className="flex items-center justify-center p-0.5">
                <button
                  onClick={() => onSelectDate(item.dateObj)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-xs transition cursor-pointer ${numberColorClass}`}
                >
                  {item.dayNum}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-full md:w-48 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-5 flex flex-col justify-center">
        <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 sm:mb-2.5">
          Chú thích
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-1 gap-2">
          {activeLegends.map(([key, info]) => (
            <div key={key} className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-600 font-medium truncate">
              <span className={`w-2 h-2 rounded-full shrink-0 ${info.dot}`} />
              <span className="truncate">{info.label}</span>
            </div>
          ))}

          {activeLegends.length > 1 && (
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-600 font-medium truncate">
              <span className="w-2 h-2 rounded-full shrink-0 bg-red-500" />
              <span className="truncate">Nhiều sự kiện</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
