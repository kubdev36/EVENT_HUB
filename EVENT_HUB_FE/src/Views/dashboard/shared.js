import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Màu theo hãng: 4 slot đầu của bảng màu chuẩn, đã kiểm tra mù màu (validate_palette.js).
 * Màu gắn theo thứ tự nguồn trong cài đặt (ổn định), không theo thứ hạng, để lọc hãng không đổi màu.
 * Aqua và vàng có tương phản thấp trên nền sáng: luôn kèm nhãn chữ, không dùng màu một mình.
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#8b5cd6'];
export const OTHER_COLOR = '#8a8f98';

export function makeBrandColor(sourceIds) {
  const order = [...sourceIds];
  return (id) => {
    const i = order.indexOf(id);
    return i >= 0 && i < SERIES_COLORS.length ? SERIES_COLORS[i] : OTHER_COLOR;
  };
}

/** Thang một màu (xanh) cho bảng nhiệt: nhạt = ít, đậm = nhiều. */
const SEQ = ['#f1f5fb', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
export function heatColor(value, max) {
  const k = value <= 0 || max <= 0 ? 0 : Math.min(6, 1 + Math.floor((value / max) * 5.99));
  return { background: SEQ[k], color: k >= 4 ? '#ffffff' : '#0b0b0b' };
}

export const TYPE_LABELS = {
  promo: 'Khuyến mãi',
  sale: 'Khuyến mãi',
  release: 'Ra mắt',
  product_launch: 'Ra mắt',
  ads: 'Quảng cáo',
  live: 'Livestream',
  livestream: 'Livestream',
  minigame: 'Minigame',
  internal: 'Nội bộ',
  other: 'Khác',
};
export const typeLabel = (t) => TYPE_LABELS[t] || 'Khác';
/** Cột của bảng "Loại bài theo hãng"; loại hiếm gộp vào "Khác". */
export const TYPE_COLUMNS = [
  ['promo', 'Khuyến mãi', ['promo', 'sale']],
  ['release', 'Ra mắt', ['release', 'product_launch']],
  ['ads', 'Quảng cáo', ['ads']],
  ['live', 'Livestream', ['live', 'livestream']],
];
export const TYPE_FILTERS = [
  ['all', 'Tất cả loại'],
  ['promo', 'Khuyến mãi'],
  ['release', 'Ra mắt'],
  ['ads', 'Quảng cáo'],
];

// ---------- Ngày theo lịch Việt Nam ----------
const VN_OFFSET_MS = 7 * 3600 * 1000;
export function vnToday(now = new Date()) {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}
export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function formatDay(day, opts = { day: '2-digit', month: '2-digit' }) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('vi-VN', { timeZone: 'UTC', ...opts });
}
/** Kỳ báo cáo: tuần (từ thứ Hai), tháng, quý; tính đến hôm nay. */
export function periodRange(period, today = vnToday()) {
  const d = new Date(`${today}T12:00:00Z`);
  if (period === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (period === 'quarter') {
    const qm = Math.floor(d.getUTCMonth() / 3) * 3 + 1;
    return { from: `${today.slice(0, 4)}-${String(qm).padStart(2, '0')}-01`, to: today };
  }
  const dow = (d.getUTCDay() + 6) % 7; // 0 = thứ Hai
  return { from: addDays(today, -dow), to: today };
}

export function relativeTime(day, time, now = new Date()) {
  if (!day) return '';
  const today = vnToday(now);
  if (day === today) return time ? `Hôm nay ${time}` : 'Hôm nay';
  if (day === addDays(today, -1)) return time ? `Hôm qua ${time}` : 'Hôm qua';
  return formatDay(day) + (time ? ` ${time}` : '');
}

export const pctChange = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

// ---------- Bộ lọc lưu trên URL (gửi link là mở đúng bộ lọc) ----------
function readParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}
export function useUrlState(defaults) {
  const [state, setState] = useState(() => ({ ...defaults, ...pick(readParams(), Object.keys(defaults)) }));
  const update = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const params = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(next)) {
        if (v === defaults[k] || v === '' || v == null) params.delete(k);
        else params.set(k, String(v));
      }
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
      return next;
    });
    // defaults là hằng số do trang truyền vào
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [state, update];
}
function pick(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k)));
}

/** Bề rộng thật của phần tử, cập nhật khi đổi kích thước (biểu đồ SVG co giãn). */
export function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setWidth(ref.current.clientWidth);
  }, []);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function safeHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
}

/** Xuất CSV an toàn: chặn công thức Excel (=, +, -, @) từ nội dung crawl. */
export function downloadCsv(filename, header, rows) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const text = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
