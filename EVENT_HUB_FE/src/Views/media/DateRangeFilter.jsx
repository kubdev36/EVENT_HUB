import { useEffect, useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { addDays, formatDay } from '../dashboard/shared';

/** "YYYY-MM-DD" (lịch Việt Nam) <-> Date của datepicker (nửa đêm giờ máy, chỉ dùng ngày/tháng/năm). */
const toDate = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const full = (day) => formatDay(day, { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Các mốc chọn nhanh, tính đến hôm nay (giờ Việt Nam). */
function presets(today) {
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = addDays(monthStart, -1);
  return [
    { id: 'today', label: 'Hôm nay', range: { from: today, to: today } },
    { id: '7d', label: '7 ngày qua', range: { from: addDays(today, -6), to: today } },
    { id: '30d', label: '30 ngày qua', range: { from: addDays(today, -29), to: today } },
    { id: 'month', label: 'Tháng này', range: { from: monthStart, to: today } },
    { id: 'prev', label: 'Tháng trước', range: { from: `${prevMonthEnd.slice(0, 8)}01`, to: prevMonthEnd } },
    { id: 'all', label: 'Tất cả', range: null },
  ];
}

/**
 * Nút chọn khoảng ngày: mốc chọn nhanh + lịch chọn ngày bắt đầu / kết thúc.
 * value: { from, to } ("YYYY-MM-DD") hoặc null (tất cả). Không cho chọn ngày sau hôm nay.
 */
export default function DateRangeFilter({ value, onChange, today }) {
  const [open, setOpen] = useState(false);
  // Ngày đang chọn dở trên lịch (đã bấm ngày bắt đầu, chưa bấm ngày kết thúc).
  const [draft, setDraft] = useState([null, null]);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options = presets(today);
  const activePreset = options.find((p) =>
    p.range ? value && p.range.from === value.from && p.range.to === value.to : !value,
  );
  const label = !value
    ? 'Tất cả thời gian'
    : value.from === value.to
      ? full(value.from)
      : `${full(value.from)} – ${full(value.to)}`;

  const choose = (range) => {
    onChange(range);
    setDraft([null, null]);
    setOpen(false);
  };
  const toggle = () => {
    setDraft(value ? [toDate(value.from), toDate(value.to)] : [null, null]);
    setOpen((o) => !o);
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`h-9 inline-flex items-center gap-2 rounded-lg border bg-white pl-3 pr-2.5 text-xs shadow-2xs transition cursor-pointer ${
            value ? 'border-blue-300 text-blue-800' : 'border-slate-200 text-slate-700 hover:border-slate-300'
          }`}
        >
          <CalendarDays size={15} className={value ? 'text-blue-600' : 'text-slate-400'} />
          <span className="whitespace-nowrap font-medium">{label}</span>
          <ChevronDown size={14} className="text-slate-400" />
        </button>
        {value && (
          <button
            type="button"
            onClick={() => choose(null)}
            aria-label="Bỏ lọc ngày"
            title="Bỏ lọc ngày"
            className="ml-1 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute right-0 z-30 mt-2 flex flex-col sm:flex-row rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <ul className="flex sm:flex-col gap-1 p-2 sm:w-36 border-b sm:border-b-0 sm:border-r border-slate-100 overflow-x-auto">
            {options.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.range)}
                  className={`w-full whitespace-nowrap text-left px-2.5 py-1.5 rounded-md text-xs transition cursor-pointer ${
                    activePreset?.id === p.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="p-2 media-range-picker">
            <DatePicker
              inline
              selectsRange
              startDate={draft[0]}
              endDate={draft[1]}
              maxDate={toDate(today)}
              monthsShown={1}
              onChange={([start, end]) => {
                setDraft([start, end]);
                if (start && end) choose({ from: toDay(start), to: toDay(end) });
              }}
            />
            <p className="px-1 pt-1 text-[11px] text-slate-400">
              {draft[0] && !draft[1] ? 'Chọn ngày kết thúc' : 'Chọn ngày bắt đầu, rồi ngày kết thúc'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
