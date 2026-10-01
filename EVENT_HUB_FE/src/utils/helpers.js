/**
 * Utility helper functions for formatting and normalizing strings across the application.
 */

export function normalizeDepartment(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[\s-]+/g, '_');

  if (['marketing', 'marketting', 'mkt'].includes(normalized)) return 'mkt';
  if (['sale', 'sales', 'kinh_doanh', 'kinhdoanh', 'kd'].includes(normalized)) return 'kinh_doanh';
  if (['internal', 'noi_bo', 'noibo', 'private_events', 'private-events'].includes(normalized)) return 'internal';

  return normalized;
}

export function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
