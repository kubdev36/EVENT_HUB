/** Các tên loại sự kiện tương đương (dữ liệu cũ dùng cả hai tên). */
export function expandEventType(type: string): string[] {
  const normalized = type.trim();
  if (normalized === 'promo') return ['promo', 'sale'];
  if (normalized === 'sale') return ['sale', 'promo'];
  if (normalized === 'live') return ['live', 'livestream'];
  if (normalized === 'livestream') return ['livestream', 'live'];
  return [normalized];
}
