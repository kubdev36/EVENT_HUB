import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../../../API/API';
import { EVENT_TYPES_KEY } from '../../../API/useEventTypes';
import { validateNewType } from '../../../constants/eventTypes';
import KeywordsTab from '../tabs/KeywordsTab';
import KeywordModal from '../modals/KeywordModal';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal';
import { useModalState, ValidationError } from './useModalState';

/** Chỉ gửi các trường backend nhận (bỏ trường tạm của form như typeEdited, idx). */
const toPayload = (rules) =>
  rules.map(({ type, label, keywords, color }) => ({
    type,
    label,
    keywords: keywords || '',
    ...(color ? { color } : {}),
  }));

/** Tab "Từ khóa phân loại": thêm loại mới, sửa tên/màu/từ khóa, xóa loại tự thêm. */
export default function KeywordsSection({ initialRules, notify }) {
  const [rules, setRules] = useState(initialRules);
  const modal = useModalState();
  const queryClient = useQueryClient();

  /** Lưu cả danh sách; lỗi kiểm tra (400) giữ popup mở để sửa. */
  const persist = async (next) => {
    try {
      await settingsApi.saveKeywords({ rules: toPayload(next) });
    } catch (err) {
      if (err.response?.status === 400) {
        const msg = err.response.data?.message;
        throw new ValidationError(Array.isArray(msg) ? msg.join('; ') : msg || 'Dữ liệu không hợp lệ.');
      }
      throw err;
    }
    setRules(next);
    // Các trang khác (thẻ sự kiện, form tạo sự kiện) lấy lại danh sách loại mới.
    queryClient.invalidateQueries({ queryKey: EVENT_TYPES_KEY });
  };

  const save = () =>
    modal.run(async () => {
      const f = modal.formData;
      if (modal.mode === 'add') {
        const rule = { type: (f.type || '').trim(), label: (f.label || '').trim(), keywords: f.keywords || '', color: f.color };
        const problem = validateNewType(rule, rules);
        if (problem) throw new ValidationError(problem);
        await persist([...rules, rule]);
        notify(`Đã thêm loại "${rule.label}". Nhớ gán loại này cho phòng ban ở tab Phòng ban để nhân viên thấy.`);
        return;
      }
      if (!(f.label || '').trim()) throw new ValidationError('Vui lòng nhập tên loại.');
      await persist(
        rules.map((k, idx) =>
          idx === modal.item.idx ? { ...k, label: f.label.trim(), keywords: f.keywords || '', color: f.color } : k
        )
      );
      notify('Đã lưu loại phân loại.');
    }, notify);

  const remove = () =>
    modal.run(async () => {
      await persist(rules.filter((_, idx) => idx !== modal.item.idx));
      notify(`Đã xóa loại "${modal.item.label}". Bài cũ của loại này hiển thị là "Khác".`);
    }, notify);

  return (
    <>
      <KeywordsTab
        keywordRules={rules}
        onAddType={() => modal.open('add', null, { label: '', type: '', keywords: '', color: 'teal' })}
        onEditKeyword={(rule, idx) => modal.open('edit', { ...rule, idx }, { ...rule, idx })}
        onDeleteType={(rule, idx) => modal.open('delete', { ...rule, idx })}
      />
      <KeywordModal
        isOpen={modal.mode === 'edit' || modal.mode === 'add'}
        mode={modal.mode}
        formData={modal.formData}
        setFormData={modal.setFormData}
        onClose={modal.close}
        onSave={save}
        saving={modal.saving}
        error={modal.error}
      />
      <ConfirmDeleteModal
        isOpen={modal.mode === 'delete'}
        title="Xóa loại phân loại"
        message="Bài đã có của loại này vẫn được giữ và hiển thị là “Khác”. Bài mới sẽ không được xếp vào loại này nữa."
        itemName={modal.item ? `${modal.item.label} (${modal.item.type})` : ''}
        onClose={modal.close}
        onConfirm={remove}
        saving={modal.saving}
      />
    </>
  );
}
