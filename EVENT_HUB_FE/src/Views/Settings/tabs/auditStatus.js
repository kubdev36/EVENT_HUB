/** Giải thích mã lỗi HTTP bằng tiếng Việt cho trang Nhật ký. */
const STATUS_LABELS = {
  400: 'Dữ liệu gửi lên không hợp lệ',
  401: 'Chưa đăng nhập hoặc sai thông tin đăng nhập',
  403: 'Không có quyền thực hiện',
  404: 'Không tìm thấy',
  409: 'Bị trùng hoặc xung đột dữ liệu',
  413: 'Dữ liệu gửi lên quá lớn',
  429: 'Quá số lần cho phép',
};

export function statusLabel(code) {
  const n = Number(code);
  if (STATUS_LABELS[n]) return STATUS_LABELS[n];
  if (n >= 500) return 'Lỗi hệ thống';
  if (n >= 400) return 'Yêu cầu bị từ chối';
  return '';
}
