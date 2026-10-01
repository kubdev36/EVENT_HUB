import React from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ArrowRight, Clock, ExternalLink } from 'lucide-react';
import { CATEGORY_STYLES } from '../../../constants/eventStyles';

export default function CrawlPreviewModal({
  crawlTarget,
  crawlLoading,
  crawlResult,
  onClose,
  onRunCrawl,
}) {
  if (!crawlTarget) return null;

  const formatEventDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-blue-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-[46rem] max-h-[90vh] overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl flex flex-col my-auto">
        <div className="relative flex items-center justify-center px-4 py-3 bg-white border-b border-slate-100 shrink-0">
          <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center p-1 shadow-xs border border-slate-200">
            <img src={crawlTarget.logo} alt={crawlTarget.name} className="h-full w-full object-contain" />
          </div>
          <button
            onClick={onClose}
            className="absolute right-3 shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!crawlResult ? (
            <>
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                <div className="text-sm font-semibold text-blue-900">Bắt đầu cào dữ liệu?</div>
                <div className="mt-1 text-[11px] leading-5 text-blue-700/80">
                  Hệ thống sẽ quét {crawlTarget.targetUrls.length} URL và cập nhật sự kiện mới.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {crawlTarget.targetUrls.map((url) => (
                    <div
                      key={url}
                      className="max-w-full rounded-full border border-blue-200 bg-white px-3 py-1 text-[10px] text-blue-800 truncate"
                    >
                      {url}
                    </div>
                  ))}
                </div>
              </div>

              {crawlLoading ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                    <Loader2 size={15} className="animate-spin" />
                    <span>Đang cào dữ liệu từ nguồn...</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                    <div className="h-full w-2/3 rounded-full bg-blue-600 animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={onClose}
                    className="h-9 px-3.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={onRunCrawl}
                    className="h-9 px-4 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ArrowRight size={13} />
                    Bắt đầu cào
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-5 p-2 max-h-[58vh] overflow-y-auto pr-1">
                {crawlResult.items.map((event) => {
                  const style = CATEGORY_STYLES[event.type] || CATEGORY_STYLES.release;
                  const formattedDate = formatEventDate(event.date);
                  return (
                    <div key={event.id} className="relative pl-4 sm:pl-5 border-l-2 border-blue-200">
                      <span className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ring-4 ring-white ${style.dot}`} />

                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-500 font-medium">
                          <Clock size={12} className="text-blue-500" />
                          <span>
                            {formattedDate} {event.time ? `• ${event.time}` : ''}
                          </span>
                        </span>
                        <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold leading-none ${style.pill}`}>
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
                            className="w-full max-h-48 object-contain rounded-lg transition duration-200 group-hover:scale-[1.01]"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  onClick={onClose}
                  className="h-9 px-4 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  Đóng
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
