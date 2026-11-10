import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { CATEGORY_STYLES } from '../../constants/eventStyles';
import { safeHttpUrl } from '../dashboard/shared';

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** "2026-11-07" -> "Thứ Bảy, 07/11/2026" (tính theo lịch, không phụ thuộc múi giờ máy). */
function formatDayTitle(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** Bài có giờ thật xếp theo giờ; bài chỉ có ngày ("Cả ngày") xếp cuối. */
const byTime = (a, b) => {
  if (!a.time && !b.time) return 0;
  if (!a.time) return 1;
  if (!b.time) return -1;
  return a.time.localeCompare(b.time);
};

/**
 * Danh sách sự kiện của một ngày trong lịch tháng: lọc nhanh theo hãng, ảnh thu nhỏ,
 * tiêu đề 2 dòng, mở bài gốc trực tiếp. Bấm ra ngoài hoặc Esc để đóng.
 */
export default function DayEventsModal({ date, events, onClose, onSelect }) {
  const [brand, setBrand] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const brands = [];
  for (const ev of events) {
    const found = brands.find((b) => b.name === ev.brand);
    if (found) found.count += 1;
    else brands.push({ name: ev.brand, logo: ev.logo, count: 1 });
  }
  brands.sort((a, b) => b.count - a.count);

  const shown = events.filter((ev) => !brand || ev.brand === brand).sort(byTime);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Sự kiện ${formatDayTitle(date)}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-[560px] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[80vh]"
      >
        {/* Đầu: ngày, số lượng, lọc theo hãng */}
        <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{formatDayTitle(date)}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {events.length} sự kiện · {brands.length} hãng
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {brands.length > 1 && (
            <div className="flex gap-1.5 mt-3 overflow-x-auto pb-0.5 -mx-1 px-1">
              <FilterChip active={!brand} onClick={() => setBrand(null)} label="Tất cả" count={events.length} />
              {brands.map((b) => (
                <FilterChip
                  key={b.name}
                  active={brand === b.name}
                  onClick={() => setBrand(brand === b.name ? null : b.name)}
                  label={b.name}
                  count={b.count}
                  logo={b.logo}
                />
              ))}
            </div>
          )}
        </div>

        {/* Danh sách */}
        <ul className="flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-100">
          {shown.map((ev) => (
            <EventRow key={ev.id} ev={ev} onSelect={() => onSelect(ev)} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, logo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border text-xs font-medium transition cursor-pointer ${
        active
          ? 'bg-slate-900 border-slate-900 text-white'
          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
      }`}
    >
      {logo && (
        <img
          loading="lazy"
          referrerPolicy="no-referrer"
          src={logo}
          alt=""
          className="w-4 h-4 rounded-full object-contain bg-white"
        />
      )}
      <span className="whitespace-nowrap">{label}</span>
      <span className={active ? 'text-slate-300' : 'text-slate-400'}>{count}</span>
    </button>
  );
}

function EventRow({ ev, onSelect }) {
  const style = CATEGORY_STYLES[ev.type] || CATEGORY_STYLES.promo;
  const href = safeHttpUrl(ev.url);
  return (
    <li className="group flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 transition">
      <button type="button" onClick={onSelect} className="flex items-start gap-3 min-w-0 flex-1 text-left cursor-pointer">
        <Thumb image={ev.image} logo={ev.logo} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-700">
            {ev.title}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
            <span className="font-medium text-slate-700">{ev.brand}</span>
            <span aria-hidden="true">·</span>
            <span className={`px-1.5 py-px rounded ${style.pill}`}>{style.label}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{ev.time || 'Cả ngày'}</span>
          </div>
        </div>
      </button>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title="Mở bài gốc"
          aria-label={`Mở bài gốc: ${ev.title}`}
          className="shrink-0 mt-0.5 p-1.5 rounded-lg text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition"
        >
          <ExternalLink size={15} />
        </a>
      )}
    </li>
  );
}

/** Ảnh thu nhỏ của bài; không có ảnh hoặc ảnh lỗi thì hiện logo hãng. */
function Thumb({ image, logo }) {
  const [failed, setFailed] = useState(false);
  const src = !failed && safeHttpUrl(image);
  return (
    <div className="shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
      {src ? (
        <img
          loading="lazy"
          referrerPolicy="no-referrer"
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : logo ? (
        <img loading="lazy" referrerPolicy="no-referrer" src={logo} alt="" className="w-7 h-7 object-contain opacity-70" />
      ) : null}
    </div>
  );
}
