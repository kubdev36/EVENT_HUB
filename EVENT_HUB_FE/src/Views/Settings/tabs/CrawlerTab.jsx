import React from 'react';
import { Bot, Plus, Play, Loader2, Edit2, Trash2, Clock } from 'lucide-react';

export default function CrawlerTab({
  crawlers = [],
  crawlLoading = false,
  onRunAll,
  onAddCrawler,
  onOpenCrawlPopup,
  onEditCrawler,
  onDeleteCrawler,
  onToggleCrawler,
}) {
  return (
    <div className="space-y-3 w-full">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">Danh sách Crawler ({crawlers.length})</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onRunAll}
            disabled={crawlLoading}
            className="h-8 px-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
            title="Cào ngay toàn bộ các trang đối thủ"
          >
            {crawlLoading ? (
              <>
                <Loader2 size={13} className="animate-spin text-blue-600" />
                <span>Đang cào tất cả...</span>
              </>
            ) : (
              <>
                <Play size={12} className="text-blue-600 fill-blue-600" />
                <span>Cào tất cả</span>
              </>
            )}
          </button>
          <button
            onClick={onAddCrawler}
            className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Plus size={14} />
            <span className="hidden xs:inline">Thêm đối thủ</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {crawlers.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <img
                  src={c.logo || '/img/mtm.jpg'}
                  alt={c.name}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/img/mtm.jpg';
                  }}
                  className="w-8 h-8 rounded-lg object-contain border border-slate-200 p-0.5 bg-white shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{c.name}</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                    <Clock size={10} className="shrink-0" />
                    <span className="truncate">Quét {c.interval}/lần • {c.lastRun}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  onClick={() => onOpenCrawlPopup(c)}
                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-medium flex items-center gap-1 transition cursor-pointer border border-blue-200"
                >
                  <Play size={11} /> Cào ngay
                </button>
                <button
                  onClick={() => onEditCrawler(c)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md transition cursor-pointer"
                  title="Sửa"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => onDeleteCrawler(c)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition cursor-pointer"
                  title="Xóa"
                >
                  <Trash2 size={13} />
                </button>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={() => onToggleCrawler(c.id)}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                />
              </div>
            </div>

            <div className="text-[11px] space-y-1">
              <div className="font-semibold text-slate-600">Link theo dõi:</div>
              {c.targetUrls?.map((url, idx) => (
                <div
                  key={idx}
                  className="w-full p-2 bg-slate-50 rounded border border-slate-100 text-slate-600 font-mono text-[10px] sm:text-[11px] break-all"
                >
                  {url}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
