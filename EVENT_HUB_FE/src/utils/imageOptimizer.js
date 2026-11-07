/**
 * Link ảnh dùng trong thẻ <img>. Không gửi link qua dịch vụ ngoài (trước đây là wsrv.nl):
 * ảnh đã lưu trên máy chủ (/images/...) dùng trực tiếp; ảnh chưa lưu tải thẳng từ web nguồn.
 * Chỉ nhận http(s); link khác (javascript:, data: lạ...) trả chuỗi rỗng.
 */
export function getOptimizedImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return /^https?:\/\//i.test(url) ? url : '';
}
