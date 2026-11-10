import { useState } from "react";
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff } from "lucide-react";
import api from "../API/API.js";

/** Ô nhập kiểu gạch chân như mẫu; gạch chuyển đỏ khi bấm vào. */
const inputClass =
  "w-full h-10 pl-7 bg-transparent border-0 border-b border-neutral-200 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-blue-600 transition disabled:cursor-not-allowed disabled:opacity-60";

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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#fbf5f5] font-sans text-neutral-800 flex items-center justify-center p-4 sm:p-8">
      {/* Mảng màu lớn ở góc nền, như mẫu */}
      <div
        aria-hidden
        className="absolute -bottom-56 -left-48 w-[640px] h-[640px] rounded-[44%_56%_58%_42%] bg-blue-300/70"
      />
      <div
        aria-hidden
        className="absolute -top-64 -right-40 w-[620px] h-[620px] rounded-[58%_42%_40%_60%] bg-blue-300/60"
      />
      <div
        aria-hidden
        className="absolute top-[6%] left-[19%] w-16 h-16 rounded-full bg-blue-200/80"
      />

      <div className="relative w-full max-w-[1200px] bg-white rounded-[32px] border-[5px] border-blue-700 shadow-2xl shadow-blue-900/10 flex flex-col overflow-hidden">
        {/* Đồng xu trang trí ở góc trên như mẫu */}
        <svg
          aria-hidden
          viewBox="0 0 80 80"
          className="hidden lg:block absolute top-[13%] left-[24%] w-16 h-16 -rotate-12"
        >
          <ellipse
            cx="40"
            cy="44"
            rx="30"
            ry="26"
            fill="var(--color-blue-400)"
          />
          <ellipse
            cx="40"
            cy="38"
            rx="30"
            ry="26"
            fill="var(--color-blue-300)"
          />
          <path
            d="M40 38 L40 12 A30 26 0 0 1 68 46 Z"
            fill="var(--color-blue-500)"
          />
        </svg>

        <header className="px-8 sm:px-14 pt-8 flex items-center gap-3">
          <img
            src="/img/mtm.png"
            alt="Minh Tuấn Mobile"
            className="h-12 w-auto object-contain"
          />
          <span className="text-sm font-bold tracking-wide text-neutral-900">
            EVENT HUB
          </span>
        </header>

        <main className="flex-1 min-h-[520px] grid lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] items-center gap-8 px-8 sm:px-14 py-10">
          {/* Form */}
          <div className="w-full max-w-[340px] mx-auto lg:mx-0 lg:ml-[10%]">
            <h1 className="text-4xl font-bold text-neutral-900 tracking-tight">
              Đăng nhập
            </h1>

            {error && (
              <div
                role="alert"
                className="mt-6 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-7">
              <div>
                <label
                  htmlFor="login-email"
                  className="text-xs font-semibold text-neutral-800"
                >
                  Email
                </label>
                <div className="relative flex items-center">
                  <Mail
                    size={16}
                    className="absolute left-0 text-neutral-400 pointer-events-none"
                  />
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
                    className={`${inputClass} pr-2`}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="text-xs font-semibold text-neutral-800"
                >
                  Mật khẩu
                </label>
                <div className="relative flex items-center">
                  <Lock
                    size={16}
                    className="absolute left-0 text-neutral-400 pointer-events-none"
                  />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    disabled={isLoading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className={`${inputClass} pr-9`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    aria-pressed={showPassword}
                    className="absolute right-0 p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-1 self-start min-w-[150px] h-11 px-6 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-sm font-semibold rounded-md shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
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

            <p className="mt-8 text-xs text-neutral-400">
              Quên mật khẩu? Liên hệ quản trị viên để được cấp lại.
            </p>
          </div>

          {/* Hình minh họa: ẩn trên màn hình nhỏ */}
          <div className="hidden lg:flex justify-center">
            <img
              src="/img/login-illustration.webp"
              alt=""
              className="w-[112%] max-w-none h-auto select-none -mr-10"
              draggable="false"
            />
          </div>
        </main>

        <footer className="px-8 sm:px-14 pb-6 text-[11px] text-neutral-400">
          © Minh Tuấn Mobile · Hệ thống nội bộ
        </footer>
      </div>
    </div>
  );
}
