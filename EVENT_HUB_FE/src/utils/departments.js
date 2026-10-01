export function normalizeDepartment(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (['marketing', 'marketting', 'mkt'].includes(normalized)) return 'mkt';
  if (['sale', 'sales', 'kinh_doanh', 'kinhdoanh', 'kd'].includes(normalized)) return 'kinh_doanh';
  if (['internal', 'noi_bo', 'noibo', 'private_events', 'private-events'].includes(normalized)) return 'internal';

  return normalized;
}

export const DEFAULT_DEPARTMENTS = [
  { code: 'mkt', name: 'Marketing', desc: 'Quảng cáo, Sự kiện, Minigame' },
  { code: 'kinh_doanh', name: 'Kinh doanh', desc: 'Khuyến mãi, Ra mắt, Mở bán' },
  { code: 'internal', name: 'Sự kiện nội bộ', desc: 'Nội bộ Minh Tuấn Mobile' },
];
