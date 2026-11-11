/** Nguồn của chính công ty; backend luôn nhận (OWN_SOURCE trong events.service), dù không nằm trong cấu hình crawl. */
export const OWN_BRAND = { id: 'minhtuan', name: 'Minh Tuấn Mobile' };

/**
 * Danh sách thương hiệu cho form tạo sự kiện, lấy từ /dashboard/sources (cấu hình crawl).
 * Nguồn nhà đứng đầu, sau đó các nguồn theo thứ tự cấu hình; không có tên nào cố định ngoài nguồn nhà.
 */
export function buildBrandOptions(sources) {
  const list = (Array.isArray(sources) ? sources : [])
    .filter((s) => s && typeof s.id === 'string' && s.id)
    .map((s) => ({ id: s.id, name: s.name || s.id }));
  const own = list.find((s) => s.id === OWN_BRAND.id) ?? OWN_BRAND;
  return [own, ...list.filter((s) => s.id !== OWN_BRAND.id)];
}

/** Giữ lựa chọn nếu còn trong danh sách, không thì chọn mục đầu tiên. */
export function pickBrand(options, wanted) {
  return options.some((o) => o.id === wanted) ? wanted : options[0]?.id ?? OWN_BRAND.id;
}
