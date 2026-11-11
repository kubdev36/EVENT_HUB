/** Số toast hiện cùng lúc; thêm nữa thì bỏ toast cũ nhất. */
export const MAX_TOASTS = 4;

/** Thời gian tự ẩn (ms): lỗi để lâu hơn cho kịp đọc. */
export const TOAST_DURATION = { success: 4000, error: 7000 };

/** Thêm toast mới vào cuối; giữ tối đa MAX_TOASTS (bỏ cái cũ nhất). */
export function addToast(list, toast) {
  const next = [...list, toast];
  return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
}

export function removeToast(list, id) {
  return list.filter((t) => t.id !== id);
}

/** Chuẩn hóa loại toast: chỉ 'success' hoặc 'error'. */
export function toastType(type) {
  return type === 'error' ? 'error' : 'success';
}
