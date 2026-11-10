import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Chặn lỗi khi render một trang: chỉ khung nội dung hiện thông báo lỗi, thanh bên vẫn dùng được.
 * Đặt key theo đường dẫn để chuyển trang là tự hết lỗi.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Lỗi hiển thị trang:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div role="alert" className="max-w-md text-center space-y-3">
          <AlertTriangle size={28} className="mx-auto text-amber-500" />
          <h2 className="text-sm font-bold text-slate-900">Trang này gặp lỗi khi hiển thị</h2>
          <p className="text-xs text-slate-500">
            Các trang khác vẫn dùng bình thường. Thử tải lại; nếu vẫn lỗi, gửi ảnh chụp màn hình cho người quản trị.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="h-8 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }
}
