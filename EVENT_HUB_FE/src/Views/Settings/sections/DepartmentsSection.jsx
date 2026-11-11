import { useMemo, useState } from 'react';
import { settingsApi } from '../../../API/API';
import { useEventTypes } from '../../../API/useEventTypes';
import { mergeDepartmentRules } from './departmentRules';
import DepartmentsTab from '../tabs/DepartmentsTab';
import DepartmentModal from '../modals/DepartmentModal';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal';
import { ValidationError, useModalState } from './useModalState';

/**
 * Tab "Phòng ban": danh sách phòng ban (dùng chung với tab Nhân viên, nên giữ ở trang cha)
 * và loại bài mỗi phòng ban được xem.
 */
export default function DepartmentsSection({ departmentsList, setDepartmentsList, initialRules, notify }) {
  const [rawRules, setRawRules] = useState(initialRules);
  // Mỗi loại đang cấu hình có một dòng, kể cả loại vừa thêm ở tab Từ khóa phân loại.
  const { types: eventTypes } = useEventTypes();
  const rules = useMemo(() => mergeDepartmentRules(rawRules, eventTypes), [rawRules, eventTypes]);
  const setRules = (update) =>
    setRawRules((prev) => (typeof update === 'function' ? update(mergeDepartmentRules(prev, eventTypes)) : update));
  const [savingRules, setSavingRules] = useState(false);
  const modal = useModalState();

  const persist = (list, nextRules) => settingsApi.saveDepartments({ list, rules: nextRules });

  const toggle = (type, deptKey) =>
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.type !== type) return rule;
        const depts = rule.departments || [];
        return { ...rule, departments: depts.includes(deptKey) ? depts.filter((d) => d !== deptKey) : [...depts, deptKey] };
      }),
    );

  const saveRules = async () => {
    setSavingRules(true);
    try {
      await persist(departmentsList, rules);
      notify('Đã lưu phân loại và danh sách phòng ban thành công.');
    } catch (err) {
      notify(err.response?.data?.message || 'Lưu phân loại phòng ban thất bại.', 'error');
    } finally {
      setSavingRules(false);
    }
  };

  const save = () =>
    modal.run(async () => {
      const f = modal.formData;
      const name = f.name?.trim();
      if (modal.mode === 'add') {
        const code = (f.code || f.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!code || !name) throw new ValidationError('Vui lòng nhập đầy đủ tên và mã phòng ban.');
        if (departmentsList.some((d) => d.code === code)) throw new ValidationError(`Mã phòng ban "${code}" đã tồn tại.`);
        const updated = [...departmentsList, { code, name, desc: f.desc?.trim() || '' }];
        await persist(updated, rules);
        setDepartmentsList(updated);
        notify(`Đã thêm phòng ban ${name} thành công.`);
      } else {
        if (!name) throw new ValidationError('Tên phòng ban không được để trống.');
        const updated = departmentsList.map((d) =>
          d.code === modal.item.code ? { ...d, name, desc: f.desc?.trim() || '' } : d,
        );
        await persist(updated, rules);
        setDepartmentsList(updated);
        notify(`Đã cập nhật phòng ban ${name}.`);
      }
    }, notify);

  const remove = () =>
    modal.run(async () => {
      const code = modal.item.code;
      const updatedList = departmentsList.filter((d) => d.code !== code);
      const updatedRules = rules.map((r) => ({ ...r, departments: (r.departments || []).filter((d) => d !== code) }));
      await persist(updatedList, updatedRules);
      setDepartmentsList(updatedList);
      setRules(updatedRules);
      notify(`Đã xóa phòng ban ${modal.item.name}.`);
    }, notify);

  return (
    <>
      <DepartmentsTab
        departmentsList={departmentsList}
        departmentRules={rules}
        settingsSaving={savingRules}
        onAddDepartment={() => modal.open('add', null, { code: '', name: '', desc: '' })}
        onEditDepartment={(d) => modal.open('edit', d, { code: d.code || '', name: d.name || '', desc: d.desc || '' })}
        onDeleteDepartment={(d) => modal.open('delete', d)}
        onToggleDepartment={toggle}
        onSaveDepartmentRules={saveRules}
      />
      <DepartmentModal
        isOpen={modal.mode === 'add' || modal.mode === 'edit'}
        mode={modal.mode === 'add' ? 'add' : 'edit'}
        formData={modal.formData}
        setFormData={modal.setFormData}
        onClose={modal.close}
        onSave={save}
        saving={modal.saving}
        error={modal.error}
      />
      <ConfirmDeleteModal
        isOpen={modal.mode === 'delete'}
        title="Xác nhận xóa phòng ban"
        itemName={modal.item?.name}
        onClose={modal.close}
        onConfirm={remove}
        saving={modal.saving}
      />
    </>
  );
}
