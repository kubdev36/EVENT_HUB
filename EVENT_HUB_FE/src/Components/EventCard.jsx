import React from 'react';
import { Clock, ChevronRight } from 'lucide-react';
import { CATEGORY_STYLES } from '../constants/eventStyles';
import { getBrandLogo } from '../constants/brandLogos';
import { getOptimizedImageUrl } from '../utils/imageOptimizer';

export default function EventCard({ data, onOpenDetail }) {
  const logoUrl = getBrandLogo(data?.id, data?.name, data?.logo);

  return (
    <div className="flex flex-col md:grid md:grid-cols-[160px_1fr_150px] bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:border-slate-300 transition-all">
      <div 
        onClick={() => onOpenDetail?.(data)}
        className="p-3 sm:p-3.5 border-b md:border-b-0 md:border-r border-slate-100 flex flex-row md:flex-col justify-between md:justify-center items-center md:items-start cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={logoUrl}
            alt={data.name}
            onError={(e) => {
              e.currentTarget.src = getBrandLogo(data?.id, data?.name);
            }}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-contain border border-slate-200 p-0.5 bg-white shrink-0 shadow-xs"
          />
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 leading-snug truncate">{data.name}</div>
            <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">{data.totalEvents} sự kiện</div>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail?.(data);
          }}
          className="md:hidden text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 shrink-0"
        >
          <span>Chi tiết</span>
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="p-2.5 sm:p-3 flex-1 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
          {data.events.map((event) => {
            const style = CATEGORY_STYLES[event.type] || CATEGORY_STYLES.release;
            return (
              <div
                key={event.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (event.url) {
                    window.open(event.url, '_blank');
                  } else {
                    onOpenDetail?.(data);
                  }
                }}
                title="Bấm để xem chi tiết sự kiện của hãng"
                className="group text-left rounded-lg border border-slate-200/90 bg-white p-2 hover:border-[#1877f2] hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] mb-1.5 gap-1">
                    <span className="flex items-center gap-1 text-slate-500 font-medium shrink-0">
                      <Clock size={11} className="text-slate-400" />
                      <span>{event.time}</span>
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none shrink-0 ${style.pill}`}
                    >
                      {style.label}
                    </span>
                  </div>

                  <div className="text-[11px] font-bold text-slate-800 line-clamp-2 min-h-[28px] mb-2 group-hover:text-blue-600 transition-colors leading-tight">
                    {event.title}
                  </div>
                </div>

                <div className="h-24 sm:h-20 w-full rounded-md overflow-hidden bg-slate-50 border border-slate-100 shrink-0 select-none flex items-center justify-center">
                  {event.image ? (
                    <img
                      src={getOptimizedImageUrl(event.image, 300)}
                      alt={event.title}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = logoUrl;
                        e.currentTarget.className = "w-9 h-9 object-contain opacity-60 p-0.5 bg-white rounded";
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <img
                      src={logoUrl}
                      alt={data.name}
                      className="w-9 h-9 object-contain opacity-50 p-0.5 bg-white rounded"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="hidden md:flex p-3.5 border-l border-slate-100 flex-col justify-between bg-slate-50/20">
        <div>
          <div className="text-xs font-bold text-slate-900 mb-2">
            {data.totalEvents} sự kiện
          </div>
          <div className="space-y-1.5 text-[11px] font-medium text-slate-600">
            {Object.entries(data.stats || {}).map(([key, count]) => {
              if (!count) return null;
              const style = CATEGORY_STYLES[key];
              if (!style) return null;
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                  <span className="truncate">{style.label}: {count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => onOpenDetail?.(data)}
          className="mt-2 text-[11px] font-semibold text-[#1877f2] hover:text-blue-700 flex items-center gap-1 self-start cursor-pointer"
        >
          <span>Xem chi tiết</span>
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
