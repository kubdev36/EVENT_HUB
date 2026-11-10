/**
 * Vai trò của tiến trình, đặt bằng PROCESS_ROLE:
 * - api: chỉ phục vụ HTTP, đẩy việc crawl vào hàng đợi; không chạy lịch và không xử lý việc.
 * - worker: chỉ chạy lịch, xử lý việc crawl và gửi thông báo; không mở cổng HTTP (src/worker.ts).
 * - all (mặc định): làm cả hai trong một tiến trình, tiện cho dev (`npm run start:dev`).
 */
export type ProcessRole = 'api' | 'worker' | 'all';

export function processRole(
  value: string | undefined = process.env.PROCESS_ROLE,
): ProcessRole {
  const v = (value || 'all').trim().toLowerCase();
  if (v === 'api' || v === 'worker' || v === 'all') return v;
  throw new Error(`PROCESS_ROLE không hợp lệ: ${value} (api | worker | all)`);
}

/** Tiến trình này có chạy lịch, xử lý việc crawl và gửi thông báo không. */
export function runsWorker(role: ProcessRole = processRole()): boolean {
  return role === 'worker' || role === 'all';
}
