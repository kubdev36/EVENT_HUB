import React, { useState, useMemo } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ChevronLeft, ChevronRight, ChevronDown, X, ExternalLink, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { CATEGORY_STYLES } from '../constants/eventStyles';
import { useEventsByDate } from '../API/useEventsByDate';

const DAYS_OF_WEEK = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MAX_SHOW_EVENTS = 2;

import { useFilterContext } from '../context/FilterContext';

export default function Month() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState(null);
  const { sources } = useEventsByDate();
  const { isEventVisible } = useFilterContext();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const events = useMemo(() => {
    return sources
      .flatMap((c) =>
        (c.events || []).map((e) => ({
          ...e,
          brand: c.name,
          logo: c.logo,
        }))
      )
      .filter(isEventVisible)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [sources, isEventVisible]);

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    const days = [];
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        day: daysInPrev - i,
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(daysInPrev - i).padStart(2, '0')}`,
        current: false,
      });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        current: true,
      });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        dateStr: `${year}-${String(month + 2).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        current: false,
      });
    }
    return days;
  }, [year, month]);

  const changeMonth = (offset) => {
    setCurrentDate(new Date(year, month + offset, 1));
  };

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-white text-gray-800 select-none overflow-hidden font-sans">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between px-3.5 sm:px-6 py-2.5 border-b border-gray-200 shrink-0 gap-2.5 bg-white">
        <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
          <DatePicker
            selected={currentDate}
            onChange={(date) => date && setCurrentDate(date)}
            showMonthYearPicker
            dateFormat="'Tháng' M/yyyy"
            customInput={
              <button className="px-3 py-1.5 text-xs sm:text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 sm:gap-2 transition cursor-pointer shadow-2xs">
                <span>Tháng {month + 1}/{year}</span>
                <ChevronDown size={15} className="text-gray-500" />
              </button>
            }
          />

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => changeMonth(-1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 cursor-pointer transition"
              title="Tháng trước"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => changeMonth(1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 cursor-pointer transition"
              title="Tháng sau"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-0 text-xs">
          {Object.entries(CATEGORY_STYLES).slice(0, 5).map(([key, style]) => (
            <div key={key} className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs text-gray-600 font-medium whitespace-nowrap">
              <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
              <span>{style.label}</span>
            </div>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-[11px] sm:text-xs font-semibold text-gray-500 py-1.5 sm:py-2 shrink-0">
        {DAYS_OF_WEEK.map((d, i) => (
          <div key={i} className={i === 0 || i === 6 ? 'text-gray-400' : ''}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0 border-b border-r border-gray-200 overflow-hidden">
        {calendarDays.map((item, idx) => {
          const dayEvents = events.filter((e) => e.date === item.dateStr);
          const visibleEvents = dayEvents.slice(0, MAX_SHOW_EVENTS);
          const extraEventsCount = dayEvents.length - MAX_SHOW_EVENTS;

          return (
            <div
              key={idx}
              className={`flex flex-col border-t border-l border-gray-200 p-1 sm:p-1.5 min-h-0 overflow-hidden ${
                item.current ? 'bg-white' : 'bg-gray-50/50 text-gray-400'
              }`}
            >
              <div className="text-[10px] sm:text-xs font-semibold text-center mb-0.5 sm:mb-1 shrink-0">
                {item.day === 1 && item.current ? `1 thg ${month + 1}` : item.day}
              </div>

              <div className="flex flex-col gap-1 min-h-0 overflow-hidden flex-1">
                {visibleEvents.map((ev) => {
                  const style = CATEGORY_STYLES[ev.type] || CATEGORY_STYLES.promo;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className={`w-full text-left px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] lg:text-[11px] font-medium flex items-center gap-1 min-w-0 shadow-2xs cursor-pointer transition ${style.pill}`}
                      title={`${ev.time} - ${ev.brand}: ${ev.title}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                      
                      {ev.logo && (
                        <img
                          src={ev.logo}
                          alt={ev.brand}
                          className="w-3 h-3 sm:w-3.5 sm:h-3.5 object-contain rounded-full bg-white shrink-0 border border-gray-200 shadow-2xs"
                        />
                      )}
                      
                      <span className="shrink-0 font-bold text-[8px] sm:text-[9px] lg:text-[10px] opacity-85">
                        {ev.time}
                      </span>
                      
                      <span className="truncate min-w-0 font-medium">
                        {ev.title}
                      </span>
                    </button>
                  );
                })}

                {extraEventsCount > 0 && (
                  <button
                    onClick={() => setSelectedDayEvents({ date: item.dateStr, events: dayEvents })}
                    className="text-left text-[9px] sm:text-[10px] lg:text-[11px] font-bold text-gray-500 hover:text-blue-600 px-1 hover:bg-gray-100 rounded transition truncate mt-auto cursor-pointer"
                  >
                    + {extraEventsCount} sự kiện nữa
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {selectedEvent.image && (
              <div className="relative w-full h-40 sm:h-48 bg-gray-100 overflow-hidden shrink-0 border-b border-gray-100">
                <img
                  src={selectedEvent.image}
                  alt={selectedEvent.title}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="p-4 sm:p-5 overflow-y-auto">
              {!selectedEvent.image && (
                <div className="flex justify-end mb-2">
                  <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                    <X size={18} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-md border border-gray-200">
                  {selectedEvent.logo && (
                    <img
                      src={selectedEvent.logo}
                      alt={selectedEvent.brand}
                      className="w-4 h-4 object-contain rounded-full bg-white"
                    />
                  )}
                  <span className="text-xs font-bold text-gray-700">{selectedEvent.brand}</span>
                </div>
                <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded font-medium ${CATEGORY_STYLES[selectedEvent.type]?.pill}`}>
                  {CATEGORY_STYLES[selectedEvent.type]?.label}
                </span>
              </div>

              <h3 className="font-bold text-gray-900 text-xs sm:text-sm mb-2 leading-snug">{selectedEvent.title}</h3>

              <div className="flex items-center gap-3 sm:gap-4 text-[11px] sm:text-xs text-gray-500 mb-3">
                <span className="flex items-center gap-1"><CalendarIcon size={13} /> {selectedEvent.date}</span>
                <span className="flex items-center gap-1"><Clock size={13} /> {selectedEvent.time}</span>
              </div>

              <p className="text-xs text-gray-600 mb-4 line-clamp-4 leading-relaxed">{selectedEvent.desc}</p>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition cursor-pointer font-medium"
                >
                  Đóng
                </button>
                {selectedEvent.url && (
                  <a
                    href={selectedEvent.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 px-3.5 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium shadow-2xs"
                  >
                    Xem chi tiết <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDayEvents && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-4 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center pb-2.5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-xs sm:text-sm">Sự kiện ngày {selectedDayEvents.date}</h3>
              <button onClick={() => setSelectedDayEvents(null)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer transition">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-3 flex flex-col gap-2">
              {selectedDayEvents.events.map((ev) => {
                const style = CATEGORY_STYLES[ev.type] || CATEGORY_STYLES.promo;
                return (
                  <div
                    key={ev.id}
                    onClick={() => {
                      setSelectedDayEvents(null);
                      setSelectedEvent(ev);
                    }}
                    className="p-2.5 border border-gray-200 rounded-xl hover:border-blue-400 cursor-pointer text-xs transition bg-white hover:bg-gray-50 shadow-2xs space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        {ev.logo && (
                          <img
                            src={ev.logo}
                            alt={ev.brand}
                            className="w-4 h-4 object-contain rounded-full bg-white border border-gray-200"
                          />
                        )}
                        <span className="font-bold text-gray-800">{ev.brand}</span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${style.pill}`}>{style.label}</span>
                    </div>

                    <div className="text-gray-700 leading-snug flex items-center gap-1.5">
                      <span className="font-bold text-gray-500 text-[10px] shrink-0">{ev.time}</span>
                      <span className="truncate font-medium">{ev.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setSelectedDayEvents(null)}
              className="w-full py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
