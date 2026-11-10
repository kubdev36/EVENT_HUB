import { AlertTriangle, CheckCircle2, Clock3, Loader2, X } from 'lucide-react';
import { summarizeProgress } from './crawlProgressState';

const STATE_ICON = {
  waiting: <Clock3 size={15} className="text-slate-400" />,
  running: <Loader2 size={15} className="text-blue-600 animate-spin" />,
  done: <CheckCircle2 size={15} className="text-emerald-600" />,
  error: <AlertTriangle size={15} className="text-amber-600" />,
};

function stateText(p) {
  if (p.state === 'waiting') return 'Chờ tới lượt';
  if (p.state === 'running') return 'Đang cào...';
  if (p.state === 'done')
    return `Xong · ${p.newItems} bài mới${p.partial ? ' · một số trang lỗi' : ''}`;
  if (p.blocked) return 'Bị web chặn, chưa lấy được dữ liệu';
  const reason = p.message.split(';')[0].slice(0, 90);
  return reason ? `Lỗi: ${reason}` : 'Lỗi, chưa lấy được dữ liệu';
}

/**
 * Bảng tiến độ sau khi bấm "Cào ngay" / "Cào tất cả". items: [{ id, name, progress }].
 * Khi tất cả đã xong thì thu gọn, chỉ giữ tóm tắt và các nguồn lỗi.
 */
export default function CrawlProgress({ items, onClose }) {
  const s = summarizeProgress(items);
  const pct = s.total ? Math.round((s.finished / s.total) * 100) : 0;
  const visible = s.allDone ? items.filter((i) => i.progress.state === 'error') : items;

  const title = s.allDone
    ? `Đã cào xong ${s.total} nguồn · ${s.newItems} bài mới${s.errors ? ` · ${s.errors} nguồn lỗi` : ''}`
    : `Đang cào ${s.total} nguồn · ${s.finished}/${s.total} xong`;

  return (
    <section
      aria-live="polite"
      className={`rounded-xl border bg-white shadow-2xs ${
        s.allDone && !s.errors ? 'border-emerald-200' : s.allDone ? 'border-amber-200' : 'border-blue-200'
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2.5">
        {s.allDone ? (s.errors ? STATE_ICON.error : STATE_ICON.done) : STATE_ICON.running}
        <h3 className="flex-1 text-[13px] font-semibold text-slate-900">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng tiến độ"
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {!s.allDone && (
        <div className="mx-4 h-1.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      {s.allDone && !s.errors ? (
        <p className="px-4 pb-3 text-xs text-slate-500">
          {items.map((i) => `${i.name} ${i.progress.newItems ?? 0}`).join(' · ')}
        </p>
      ) : (
        <ul className="px-2 py-2">
          {visible.map((i) => (
            <li key={i.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs">
              <span className="shrink-0">{STATE_ICON[i.progress.state]}</span>
              <span className="w-36 shrink-0 font-medium text-slate-800 truncate">{i.name}</span>
              <span className={i.progress.state === 'error' ? 'text-amber-700' : 'text-slate-600'}>
                {stateText(i.progress)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!s.allDone && s.waiting > 0 && (
        <p className="px-4 pb-3 -mt-1 text-[11px] text-slate-400">
          Hệ thống cào tối đa 4 nguồn cùng lúc; nguồn "Chờ tới lượt" sẽ tự chạy khi có chỗ trống.
        </p>
      )}
    </section>
  );
}
