import { useState } from 'react';
import { settingsApi } from '../../../API/API';
import KeywordsTab from '../tabs/KeywordsTab';
import KeywordModal from '../modals/KeywordModal';
import { useModalState } from './useModalState';

/** Tab "Từ khóa phân loại": sửa danh sách từ khóa của từng loại bài. */
export default function KeywordsSection({ initialRules, notify }) {
  const [rules, setRules] = useState(initialRules);
  const modal = useModalState();

  const save = () =>
    modal.run(async () => {
      const updated = rules.map((k, idx) => (idx === modal.item.idx ? { ...k, keywords: modal.formData.keywords } : k));
      await settingsApi.saveKeywords({ rules: updated });
      setRules(updated);
      notify('Đã lưu từ khóa phân loại.');
    }, notify);

  return (
    <>
      <KeywordsTab
        keywordRules={rules}
        onEditKeyword={(rule, idx) => modal.open('edit', { ...rule, idx }, { ...rule, idx })}
      />
      <KeywordModal
        isOpen={modal.mode === 'edit'}
        formData={modal.formData}
        setFormData={modal.setFormData}
        onClose={modal.close}
        onSave={save}
        saving={modal.saving}
      />
    </>
  );
}
