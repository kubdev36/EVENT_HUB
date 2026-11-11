import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, KeyRound } from 'lucide-react';

/** Hiện mật khẩu vừa sinh đúng một lần; đóng là không xem lại được. */
export default function OneTimePasswordModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!data) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.password);
      setCopied(true);
    } catch {
      // Trình duyệt chặn clipboard: người dùng vẫn tự chọn và chép được ô bên dưới.
      setCopied(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-4 space-y-3 text-xs">
        <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
          <KeyRound size={16} /> Mật khẩu mới
        </div>
        <p className="text-slate-600">
          Mật khẩu của <span className="font-semibold text-slate-900">{data.email}</span>. Mật khẩu chỉ hiện một
          lần: hãy sao chép và gửi riêng cho nhân viên. Nhân viên sẽ phải đổi mật khẩu này khi đăng nhập lần đầu.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={data.password}
            onFocus={(e) => e.target.select()}
            className="flex-1 h-8.5 rounded-lg border border-slate-200 px-3 font-mono text-slate-800 bg-slate-50"
          />
          <button
            onClick={copy}
            className="h-8.5 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Copy size={13} /> {copied ? 'Đã chép' : 'Sao chép'}
          </button>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="h-8.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer"
          >
            Tôi đã lưu mật khẩu
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
