import { useState } from "react";
import { Lock, Mail, ArrowRight } from "lucide-react";
import api from "../API/API.js";
import AuthShell, { AuthError, PasswordField, authButtonClass, authInputClass } from "../Components/AuthShell";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await api.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });

      const data = response.data;

      // Token nằm trong cookie httpOnly; chỉ lưu thông tin hiển thị (email, vai trò).
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("event-hub-auth", "true");

      onLogin?.(data.user);
    } catch (err) {
      const responseMessage = err.response?.data?.message;
      const errorMessage = Array.isArray(responseMessage)
        ? responseMessage[0]
        : responseMessage || err.message || "Đăng nhập thất bại";

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-4xl font-bold text-neutral-900 tracking-tight">Đăng nhập</h1>

      <AuthError message={error} />

      <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-7">
        <div>
          <label htmlFor="login-email" className="text-xs font-semibold text-neutral-800">
            Email
          </label>
          <div className="relative flex items-center">
            <Mail size={16} className="absolute left-0 text-neutral-400 pointer-events-none" />
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              disabled={isLoading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@minhtuanmobile.com"
              className={`${authInputClass} pr-2`}
            />
          </div>
        </div>

        <PasswordField
          id="login-password"
          label="Mật khẩu"
          icon={Lock}
          show={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          autoComplete="current-password"
          required
          disabled={isLoading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Nhập mật khẩu"
        />

        <button type="submit" disabled={isLoading} className={authButtonClass}>
          {isLoading ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Đang đăng nhập...</span>
            </>
          ) : (
            <>
              <span>Đăng nhập</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <p className="mt-8 text-xs text-neutral-400">Quên mật khẩu? Liên hệ quản trị viên để được cấp lại.</p>
    </AuthShell>
  );
}
