import React, { useState } from 'react';
import { X, Clock, FileEdit, ExternalLink } from 'lucide-react';
import { CATEGORY_STYLES } from '../constants/eventStyles';
import { getBrandLogo } from '../constants/brandLogos';

export default function EventDetail({ data, onClose }) {
  const [activeTab, setActiveTab] = useState('events');

  if (!data) return null;

  const logoUrl = getBrandLogo(data?.id, data?.name, data?.logo);

  const getFormattedDate = () => {
    const dateStr = data.events?.[0]?.date;
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const weekdays = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return `${d}/${m}/${y} (${weekdays[date.getDay()]})`;
  };

  const formattedDate = getFormattedDate();

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden transition-opacity"
      />

      <aside className="fixed lg:static top-0 right-0 z-50 w-full sm:w-[380px] xl:w-[420px] shrink-0 bg-white border-l border-slate-200 h-screen flex flex-col justify-between shadow-2xl lg:shadow-lg select-none overflow-hidden transition-transform duration-300 animate-in slide-in-from-right">
        <div className="shrink-0 bg-white">
          <div className="h-14 px-3.5 sm:px-4 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">{data.name}</h2>
              <span className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-orange-50 text-orange-600 border border-orange-200 shrink-0">
                {data.tag || 'Đối thủ'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 flex items-center gap-3">
            <img
              src={logoUrl}
              alt={data.name}
              onError={(e) => { e.currentTarget.src = getBrandLogo(data?.id, data?.name); }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-contain border border-slate-200 shrink-0 shadow-2xs p-0.5 bg-white"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">{data.name}</div>
              <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5 truncate">
                <Clock size={11} className="text-slate-400 shrink-0" />
                <span className="truncate">{formattedDate} – {data.totalEvents} sự kiện</span>
              </div>
            </div>
          </div>

          <div className="px-3.5 sm:px-4 border-b border-slate-200 flex items-center gap-3 sm:gap-4 text-xs font-medium bg-slate-50/50 overflow-x-auto">
            {[
              { id: 'overview', label: 'Tổng quan' },
              { id: 'events', label: `Các sự kiện (${data.totalEvents})` },
              { id: 'media', label: 'Ảnh & Tài liệu' },
              { id: 'notes', label: 'Ghi chú' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2.5 border-b-2 transition-colors relative cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-5 sm:space-y-6">
          {data.events.map((event) => {
            const style = CATEGORY_STYLES[event.type] || CATEGORY_STYLES.release;
            return (
              <div key={event.id} className="relative pl-4 sm:pl-5 border-l-2 border-slate-200">
                <span
                  className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ring-4 ring-white ${style.dot}`}
                />

                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-500 font-medium">
                    <Clock size={12} className="text-slate-400" />
                    <span>{event.time}</span>
                  </span>
                  <span
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold leading-none ${style.pill}`}
                  >
                    {style.label}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900 leading-snug flex-1">
                    {event.fullTitle || event.title}
                  </div>
                  {event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 shrink-0 transition"
                    >
                      <span>Chi tiết</span>
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>

                {event.desc && (
                  <div className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                    {event.desc}
                  </div>
                )}

                {event.image && (
                  <div
                    onClick={() => event.url && window.open(event.url, '_blank')}
                    title="Bấm để xem bài viết gốc"
                    className="mt-2.5 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-2xs cursor-pointer hover:border-blue-400 hover:shadow-xs transition group"
                  >
                    <img
                      src={event.image}
                      alt={event.title}
                      className="w-full max-h-48 sm:max-h-56 object-contain rounded-lg transition duration-200 group-hover:scale-[1.01]"
                      loading="lazy"
                    />
                  </div>
                )}

                {event.thumbs && event.thumbs.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 sm:grid-cols-5 gap-1.5 select-none">
                    {event.thumbs.map((thumbUrl, idx) => (
                      <div
                        key={idx}
                        className="h-8 sm:h-9 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                      >
                        <img
                          src={thumbUrl}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))}
                    {event.extraThumbs > 0 && (
                      <div className="h-8 sm:h-9 rounded-lg border border-slate-200 bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shadow-2xs">
                        +{event.extraThumbs}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-200 bg-white shrink-0">
          <button className="w-full h-9 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors cursor-pointer">
            <FileEdit size={14} className="text-slate-500" />
            <span>Xem ghi chú về đối thủ này</span>
          </button>
        </div>
      </aside>
    </>
  );
}
