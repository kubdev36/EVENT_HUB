/**
 * Danh sách "loại -> phòng ban được xem" để hiển thị ở tab Phòng ban: mỗi loại đang cấu hình
 * (kể cả loại mới thêm) có một dòng, giữ phòng ban đã gán. Bỏ loại đã xóa và loại "nội bộ"
 * (sự kiện nội bộ xem ở trang phòng ban "Nội bộ").
 * Chưa tải được danh sách loại thì giữ nguyên rules cũ.
 */
export function mergeDepartmentRules(rules, types) {
  const current = Array.isArray(rules) ? rules : [];
  if (!Array.isArray(types) || types.length === 0) return current;
  return types
    .filter((t) => t.type !== 'internal')
    .map((t) => {
      const existing = current.find((r) => r.type === t.type);
      return { type: t.type, label: t.label, departments: existing?.departments ?? [] };
    });
}
