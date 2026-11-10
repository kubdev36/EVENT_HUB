const pad = (n) => String(n).padStart(2, '0');

/**
 * 42 ô (6 tuần, bắt đầu Chủ nhật) của lịch tháng `month` (0-11) năm `year`.
 * Ngày của từng ô tính bằng phép cộng ngày của Date, nên ô thuộc tháng trước/sau đúng cả khi
 * qua năm (tháng 1 -> tháng 12 năm trước, tháng 12 -> tháng 1 năm sau).
 * dateStr là ngày theo lịch "YYYY-MM-DD", khớp trường date của sự kiện.
 */
export function buildCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(year, month, 1 - first.getDay() + i);
    days.push({
      day: d.getDate(),
      dateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      current: d.getMonth() === month,
    });
  }
  return days;
}
