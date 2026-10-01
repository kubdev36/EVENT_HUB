import React from 'react';

export default function TelegramTab({
  telegramConfig,
  setTelegramConfig,
  onTest,
  onSave,
  settingsSaving = false,
}) {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4 text-xs">
      <h2 className="text-sm font-bold text-slate-900">Cấu hình Bot Telegram</h2>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="font-semibold text-slate-700">Bot Token:</label>
          <input
            type="text"
            value={telegramConfig.botToken || ''}
            onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
            placeholder="123456:ABC-DEF..."
            className="w-full h-8.5 rounded-lg border border-slate-200 px-3 font-mono text-[11px] sm:text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1">
          <label className="font-semibold text-slate-700">Chat ID / Group ID:</label>
          <input
            type="text"
            value={telegramConfig.chatId || ''}
            onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
            placeholder="-1001234567890"
            className="w-full h-8.5 rounded-lg border border-slate-200 px-3 font-mono text-[11px] sm:text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="pt-2 space-y-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={telegramConfig.notifyImmediately || false}
              onChange={(e) => setTelegramConfig({ ...telegramConfig, notifyImmediately: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0 accent-blue-600"
            />
            <span>Gửi tin nhắn tức thì khi cào được sự kiện mới</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={telegramConfig.includeImage || false}
              onChange={(e) => setTelegramConfig({ ...telegramConfig, includeImage: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0 accent-blue-600"
            />
            <span>Đính kèm ảnh banner vào tin nhắn</span>
          </label>
        </div>

        <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
          <button
            onClick={onTest}
            disabled={settingsSaving}
            className="h-8.5 px-3.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold cursor-pointer disabled:opacity-50 text-slate-700"
          >
            Test thử
          </button>
          <button
            onClick={onSave}
            disabled={settingsSaving}
            className="h-8.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-2xs disabled:opacity-50"
          >
            {settingsSaving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
