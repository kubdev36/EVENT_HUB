/**
 * Danh sách loại sự kiện lấy từ cấu hình keyword_rules (admin thêm được loại mới).
 * Loại gốc không xóa được vì báo cáo, dashboard và bộ lọc dựa vào chúng.
 */

/** Màu cho phép (frontend map sang class Tailwind cố định; không nhận class tùy ý). */
export const EVENT_TYPE_COLORS = [
  'orange',
  'purple',
  'blue',
  'emerald',
  'slate',
  'violet',
  'rose',
  'amber',
  'cyan',
  'pink',
  'lime',
  'teal',
] as const;
export type EventTypeColor = (typeof EVENT_TYPE_COLORS)[number];

/** Mã loại: chữ thường, số, gạch dưới; bắt đầu bằng chữ. */
export const EVENT_TYPE_CODE = /^[a-z][a-z0-9_]{1,29}$/;

export type EventTypeInfo = {
  type: string;
  label: string;
  color: EventTypeColor;
  builtin: boolean;
};

/** Loại gốc có từ khóa (nằm trong keyword_rules). */
export const BUILTIN_KEYWORD_TYPES: ReadonlyArray<Omit<EventTypeInfo, 'builtin'>> = [
  { type: 'promo', label: 'Khuyến mãi', color: 'orange' },
  { type: 'release', label: 'Ra mắt / Mở bán', color: 'purple' },
  { type: 'live', label: 'Livestream', color: 'blue' },
  { type: 'ads', label: 'Quảng cáo', color: 'emerald' },
  { type: 'other', label: 'Khác', color: 'slate' },
];

/** Loại chỉ nhập tay, không phân loại tự động. */
export const INTERNAL_TYPE: Omit<EventTypeInfo, 'builtin'> = {
  type: 'internal',
  label: 'Sự kiện nội bộ',
  color: 'violet',
};

/** Tên cũ còn trong dữ liệu, vẫn nhận khi tạo sự kiện (expandEventType gộp với tên mới). */
export const LEGACY_TYPE_ALIASES = ['sale', 'livestream'];

const BUILTIN_CODES = new Set([
  ...BUILTIN_KEYWORD_TYPES.map((t) => t.type),
  INTERNAL_TYPE.type,
]);

export function isBuiltinType(type: string): boolean {
  return BUILTIN_CODES.has(type);
}

function isColor(value: unknown): value is EventTypeColor {
  return (EVENT_TYPE_COLORS as readonly string[]).includes(value as string);
}

/**
 * Danh sách loại để hiển thị: theo thứ tự trong keyword_rules, thêm loại gốc còn thiếu,
 * cuối cùng là "Sự kiện nội bộ". Bỏ mục không hợp lệ.
 */
export function eventTypesFromRules(rules: unknown): EventTypeInfo[] {
  const out: EventTypeInfo[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(rules) ? rules : [];
  for (const raw of list) {
    const r = raw as { type?: unknown; label?: unknown; color?: unknown };
    const type = typeof r?.type === 'string' ? r.type.trim() : '';
    if (!EVENT_TYPE_CODE.test(type) || seen.has(type) || type === INTERNAL_TYPE.type) continue;
    const builtin = BUILTIN_KEYWORD_TYPES.find((b) => b.type === type);
    seen.add(type);
    out.push({
      type,
      label:
        typeof r.label === 'string' && r.label.trim() ? r.label.trim() : (builtin?.label ?? type),
      color: isColor(r.color) ? r.color : (builtin?.color ?? 'slate'),
      builtin: Boolean(builtin),
    });
  }
  for (const b of BUILTIN_KEYWORD_TYPES)
    if (!seen.has(b.type)) out.push({ ...b, builtin: true });
  out.push({ ...INTERNAL_TYPE, builtin: true });
  return out;
}

/** Loại được phép khi tạo sự kiện: mọi loại đang cấu hình và tên cũ tương đương. */
export function allowedEventTypes(rules: unknown): Set<string> {
  return new Set([
    ...eventTypesFromRules(rules).map((t) => t.type),
    ...LEGACY_TYPE_ALIASES,
  ]);
}

/**
 * Kiểm tra danh sách luật trước khi lưu. Trả về thông báo lỗi, hoặc null nếu hợp lệ.
 * Không trùng mã; không bỏ loại gốc; không tự đặt luật cho "internal".
 */
export function validateKeywordRules(
  rules: Array<{ type: string }>,
): string | null {
  const seen = new Set<string>();
  for (const r of rules) {
    if (r.type === INTERNAL_TYPE.type)
      return 'Loại "internal" chỉ dùng cho sự kiện nhập tay, không đặt từ khóa.';
    if (seen.has(r.type)) return `Mã loại "${r.type}" bị trùng.`;
    seen.add(r.type);
  }
  const missing = BUILTIN_KEYWORD_TYPES.filter((b) => !seen.has(b.type));
  if (missing.length)
    return `Không xóa được loại gốc: ${missing.map((m) => m.label).join(', ')}.`;
  return null;
}
