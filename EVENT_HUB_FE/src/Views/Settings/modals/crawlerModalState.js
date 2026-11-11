/** Nút Lưu chỉ bật khi không đang lưu, không đang tải logo và cấu hình nâng cao hợp lệ. */
export function canSaveCrawler({ saving = false, uploading = false, advancedError } = {}) {
  return !saving && !uploading && !advancedError;
}
