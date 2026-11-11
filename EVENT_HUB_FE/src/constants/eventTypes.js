import { CATEGORY_STYLES } from './eventStyles';

/**
 * Màu cho loại sự kiện (khớp EVENT_TYPE_COLORS ở backend). Class viết đầy đủ để Tailwind giữ lại khi build.
 */
export const COLOR_STYLES = {
  orange: { dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-700 border border-orange-200', text: 'text-orange-700' },
  purple: { dot: 'bg-purple-600', pill: 'bg-purple-50 text-purple-700 border border-purple-200', text: 'text-purple-700' },
  blue: { dot: 'bg-blue-600', pill: 'bg-blue-50 text-blue-700 border border-blue-200', text: 'text-blue-700' },
  emerald: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200', text: 'text-emerald-700' },
  slate: { dot: 'bg-slate-500', pill: 'bg-slate-50 text-slate-700 border border-slate-200', text: 'text-slate-700' },
  violet: { dot: 'bg-violet-600', pill: 'bg-violet-50 text-violet-700 border border-violet-200', text: 'text-violet-700' },
  rose: { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 border border-rose-200', text: 'text-rose-700' },
  amber: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 border border-amber-200', text: 'text-amber-700' },
  cyan: { dot: 'bg-cyan-500', pill: 'bg-cyan-50 text-cyan-700 border border-cyan-200', text: 'text-cyan-700' },
  pink: { dot: 'bg-pink-500', pill: 'bg-pink-50 text-pink-700 border border-pink-200', text: 'text-pink-700' },
  lime: { dot: 'bg-lime-500', pill: 'bg-lime-50 text-lime-700 border border-lime-200', text: 'text-lime-700' },
  teal: { dot: 'bg-teal-500', pill: 'bg-teal-50 text-teal-700 border border-teal-200', text: 'text-teal-700' },
};
export const COLOR_NAMES = Object.keys(COLOR_STYLES);

/** Loại gốc: không xóa được (khớp BUILTIN ở backend). */
export const BUILTIN_TYPES = ['promo', 'release', 'live', 'ads', 'other', 'internal'];

/** Tên cũ trong dữ liệu -> loại hiện tại. */
const ALIASES = { sale: 'promo', livestream: 'live', product_launch: 'release' };

/** Mã loại hợp lệ (khớp EVENT_TYPE_CODE ở backend). */
export const TYPE_CODE = /^[a-z][a-z0-9_]{1,29}$/;

const UNKNOWN = { label: 'Khác', ...COLOR_STYLES.slate };

/** Nhãn và màu của một loại theo danh sách đang cấu hình; loại lạ hiện "Khác" màu xám. */
export function styleForType(type, types = []) {
  const key = ALIASES[type] ?? type;
  const info = types.find((t) => t.type === key);
  if (info) return { label: info.label, ...(COLOR_STYLES[info.color] ?? COLOR_STYLES.slate) };
  return CATEGORY_STYLES[key] ?? UNKNOWN;
}

/** Gợi ý mã loại từ tên: bỏ dấu, chữ thường, khoảng trắng thành "_". */
export function suggestTypeCode(label) {
  return String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '')
    .slice(0, 30);
}

/** Kiểm tra form thêm loại trên giao diện (backend vẫn kiểm tra lại). Trả '' khi hợp lệ. */
export function validateNewType({ type, label }, existing = []) {
  if (!String(label || '').trim()) return 'Vui lòng nhập tên loại.';
  if (!TYPE_CODE.test(type || '')) return 'Mã loại chỉ gồm chữ thường không dấu, số và "_" (2–30 ký tự), bắt đầu bằng chữ.';
  if (type === 'internal' || existing.some((r) => r.type === type)) return `Mã loại "${type}" đã tồn tại.`;
  return '';
}
