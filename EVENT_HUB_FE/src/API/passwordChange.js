/** Mã lỗi backend trả khi tài khoản còn mật khẩu tạm (khớp PASSWORD_CHANGE_REQUIRED ở backend). */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/** Sự kiện trên window: API vừa báo phải đổi mật khẩu (vd. admin reset khi đang mở app). */
export const PASSWORD_CHANGE_EVENT = 'event-hub:password-change-required';

export function isPasswordChangeRequired(err) {
  return err?.response?.status === 403 && err?.response?.data?.code === PASSWORD_CHANGE_REQUIRED;
}

/** Kiểm tra trên giao diện trước khi gửi; backend vẫn kiểm tra lại. Trả '' khi hợp lệ. */
export function validateNewPassword({ current, next, confirm, email }) {
  if (!current) return 'Vui lòng nhập mật khẩu hiện tại.';
  if (!next || next.length < 8) return 'Mật khẩu mới phải có ít nhất 8 ký tự.';
  if (next.length > 128) return 'Mật khẩu mới tối đa 128 ký tự.';
  if (next === current) return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  if (email && next.trim().toLowerCase() === String(email).toLowerCase()) return 'Mật khẩu mới không được trùng email.';
  if (next !== confirm) return 'Nhập lại mật khẩu mới không khớp.';
  return '';
}
