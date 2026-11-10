import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { auditApi } from '../../../API/API';

const PAGE_SIZE = 50;

/** Tên dễ đọc cho các thao tác thường gặp; thao tác khác hiện nguyên "METHOD /path". */
const ACTION_LABELS = {
  'auth.login': 'Đăng nhập',
  'POST /auth/logout': 'Đăng xuất',
  'POST /settings/crawlers': 'Lưu cấu hình crawler',
  'POST /settings/telegram': 'Lưu cấu hình Telegram',
  'POST /settings/telegram/test': 'Gửi thử Telegram',
  'POST /settings/keywords': 'Lưu từ khóa phân loại',
  'POST /settings/departments': 'Lưu phòng ban',
  'POST /settings/crawler/run': 'Chạy crawl',
  'POST /users': 'Tạo tài khoản',
  'PUT /users/:id': 'Sửa tài khoản',
  'PUT /users/:id/reset-password': 'Đặt lại mật khẩu',
  'DELETE /users/:id': 'Xóa tài khoản',
  'POST /events': 'Tạo sự kiện thủ công',
};

const formatTime = (iso) =>
  new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export default function AuditTab() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => auditApi.list({ page, limit: PAGE_SIZE }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const items = q.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Nhật ký thao tác</h2>
          <p className="text-slate-500">Đăng nhập và mọi thao tác thay đổi dữ liệu. Không lưu mật khẩu, token hay nội dung gửi lên.</p>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="h-8 px-3 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
        >
          Tải lại
        </button>
      </div>

      {q.isError && <p className="text-red-600">Không tải được nhật ký: {q.error?.response?.data?.message || q.error?.message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-2 pr-3 font-semibold">Thời gian</th>
              <th className="py-2 pr-3 font-semibold">Người thao tác</th>
              <th className="py-2 pr-3 font-semibold">Thao tác</th>
              <th className="py-2 pr-3 font-semibold">Đối tượng / trường</th>
              <th className="py-2 pr-3 font-semibold">IP</th>
              <th className="py-2 font-semibold">Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => (
              <tr key={log.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{formatTime(log.createdAt)}</td>
                <td className="py-2 pr-3 text-slate-800">{log.userEmail || '—'}</td>
                <td className="py-2 pr-3 text-slate-800">{ACTION_LABELS[log.action] || log.action}</td>
                <td className="py-2 pr-3 text-slate-500">
                  {[log.target, ...(log.fields ?? [])].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="py-2 pr-3 text-slate-500 font-mono">{log.ip || '—'}</td>
                <td className="py-2">
                  {log.success ? (
                    <span className="text-emerald-700 font-semibold">Thành công</span>
                  ) : (
                    <span className="text-red-600 font-semibold" title={log.errorMessage || ''}>
                      Lỗi {log.statusCode}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!q.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">Chưa có nhật ký.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="h-8 px-3 rounded-lg border border-slate-200 disabled:opacity-40"
        >
          Trước
        </button>
        <span className="text-slate-500">
          Trang {page}/{totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="h-8 px-3 rounded-lg border border-slate-200 disabled:opacity-40"
        >
          Sau
        </button>
      </div>
    </div>
  );
}
