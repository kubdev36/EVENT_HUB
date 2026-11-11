import { useState } from 'react';
import { settingsApi } from '../../../API/API';
import TelegramTab from '../tabs/TelegramTab';
import { EMPTY_TELEGRAM_CONFIG } from './telegramConfig';


/** Chỉ gửi các trường backend nhận; botToken trống nghĩa là giữ token đã lưu. */
const telegramPayload = (c) => ({
  botToken: c.botToken || '',
  chatId: c.chatId || '',
  notifyImmediately: Boolean(c.notifyImmediately),
  includeImage: Boolean(c.includeImage),
});

/** Tab "Thông báo Telegram": token (đã che), chat ID, tùy chọn gửi; lưu và gửi thử. */
export default function TelegramSection({ initialConfig, notify }) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await settingsApi.saveTelegram(telegramPayload(config));
      // Server trả cấu hình đã che token; xóa token vừa nhập khỏi bộ nhớ giao diện.
      setConfig({ ...EMPTY_TELEGRAM_CONFIG, ...res.data?.value });
      notify('Đã lưu cấu hình Telegram thành công.');
    } catch (err) {
      notify(err.response?.data?.message || 'Lưu cấu hình Telegram thất bại.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setSaving(true);
    try {
      await settingsApi.testTelegram(telegramPayload(config));
      notify('Đã gửi tin nhắn thử nghiệm Telegram.');
    } catch (err) {
      notify(err.response?.data?.message || 'Kiểm tra Telegram thất bại.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TelegramTab telegramConfig={config} setTelegramConfig={setConfig} onTest={test} onSave={save} settingsSaving={saving} />
  );
}
