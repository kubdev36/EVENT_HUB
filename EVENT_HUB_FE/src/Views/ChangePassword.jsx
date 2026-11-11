import { useState } from 'react';
import { ArrowRight, KeyRound, Lock } from 'lucide-react';
import { authApi } from '../API/API';
import { validateNewPassword } from '../API/passwordChange';
import AuthShell, { AuthError, PasswordField, authButtonClass } from '../Components/AuthShell';

/**
 * Màn hình bắt buộc đổi mật khẩu tạm (do admin tạo hoặc đặt lại), cùng giao diện với trang đăng nhập.
 * Chưa đổi thì không vào được app: backend cũng chặn mọi API khác bằng 403 PASSWORD_CHANGE_REQUIRED.
 */
export default function ChangePassword({ user, required = true, onDone, onCancel, onLogout }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (key) => () => setShow((s) => ({ ...s, [key]: !s[key] }));

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateNewPassword({ current, next, confirm, email: user?.email });
    if (problem) return setError(problem);
    setError('');
    setSaving(true);
    try {
      const { data } = await authApi.changePassword({ currentPassword: current, newPassword: next });
      onDone(data.user);
    } catch (err) {
      const msg = err.response?.data?.message;
      setError(
        err.response?.status === 429
          ? 'Thử quá nhiều lần, vui lòng đợi ít phút.'
          : Array.isArray(msg)
            ? msg[0]
            : msg || 'Không đổi được mật khẩu, thử lại.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-4xl font-bold text-neutral-900 tracking-tight">Đổi mật khẩu</h1>
      <p className="mt-3 text-sm text-neutral-500">
        Tài khoản <span className="font-semibold text-neutral-800">{user?.email}</span>
        {required
          ? ' đang dùng mật khẩu tạm. Hãy đặt mật khẩu mới (ít nhất 8 ký tự) để tiếp tục.'
          : '. Mật khẩu mới cần ít nhất 8 ký tự; các thiết bị khác sẽ bị đăng xuất.'}
      </p>

      <AuthError message={error} />

      <form onSubmit={submit} className="mt-8 flex flex-col gap-7">
        <PasswordField
          id="cp-current"
          label={required ? 'Mật khẩu tạm hiện tại' : 'Mật khẩu hiện tại'}
          icon={KeyRound}
          show={show.current}
          onToggleShow={toggle('current')}
          autoComplete="current-password"
          autoFocus
          required
          disabled={saving}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder={required ? 'Mật khẩu được cấp' : 'Nhập mật khẩu hiện tại'}
        />
        <PasswordField
          id="cp-new"
          label="Mật khẩu mới"
          icon={Lock}
          show={show.next}
          onToggleShow={toggle('next')}
          autoComplete="new-password"
          required
          disabled={saving}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Ít nhất 8 ký tự"
        />
        <PasswordField
          id="cp-confirm"
          label="Nhập lại mật khẩu mới"
          icon={Lock}
          show={show.confirm}
          onToggleShow={toggle('confirm')}
          autoComplete="new-password"
          required
          disabled={saving}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Nhập lại mật khẩu mới"
        />

        <button type="submit" disabled={saving} className={authButtonClass}>
          {saving ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Đang lưu...</span>
            </>
          ) : (
            <>
              <span>Đổi mật khẩu</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <p className="mt-8 text-xs text-neutral-400">
        {required ? (
          <>
            Không phải bạn?{' '}
            <button type="button" onClick={onLogout} className="text-blue-600 hover:underline cursor-pointer">
              Đăng xuất
            </button>
          </>
        ) : (
          <button type="button" onClick={onCancel} className="text-blue-600 hover:underline cursor-pointer">
            ← Quay lại, không đổi mật khẩu
          </button>
        )}
      </p>
    </AuthShell>
  );
}
