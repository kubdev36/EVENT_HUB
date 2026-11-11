import { useEffect, useState } from 'react';
import { usersApi } from '../../../API/API';
import UsersTab from '../tabs/UsersTab';
import UserModal from '../modals/UserModal';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal';
import OneTimePasswordModal from '../modals/OneTimePasswordModal';
import { useModalState } from './useModalState';


const toRow = (u) => ({
  id: u.id,
  name: u.fullName || '',
  email: u.email,
  department: u.department || 'mkt',
  role: u.role === 'admin' ? 'Admin' : 'Staff',
  status: u.isActive ? 'active' : 'inactive',
});

/** Tab "Tài khoản nhân viên": danh sách, thêm, sửa, xóa, đặt lại mật khẩu. */
export default function UsersSection({ departmentsList, notify }) {
  const [users, setUsers] = useState([]);
  // Mật khẩu máy chủ vừa sinh (tạo tài khoản không nhập mật khẩu, hoặc đặt lại): chỉ giữ trong bộ nhớ.
  const [oneTime, setOneTime] = useState(null);
  const modal = useModalState();
  const defaultDept = departmentsList[0]?.code || 'mkt';

  const reload = async () => {
    const res = await usersApi.list();
    setUsers((Array.isArray(res.data) ? res.data : []).map(toRow));
  };

  useEffect(() => {
    let active = true;
    usersApi
      .list()
      .then((res) => active && setUsers((Array.isArray(res.data) ? res.data : []).map(toRow)))
      .catch((err) => active && notify(err.response?.data?.message || 'Không tải được danh sách nhân viên.', 'error'));
    return () => {
      active = false;
    };
  }, [notify]);

  const payload = (f) => ({
    email: f.email,
    fullName: (f.name || '').trim(),
    role: (f.role || 'Staff').toLowerCase(),
    department: f.department || defaultDept,
  });

  const save = () =>
    modal.run(async () => {
      const f = modal.formData;
      if (modal.mode === 'add') {
        // Mật khẩu do máy chủ sinh ngẫu nhiên; chỉ hiện một lần.
        const { data } = await usersApi.create(payload(f));
        if (data?.generatedPassword) setOneTime({ email: f.email, password: data.generatedPassword });
        notify(`Đã thêm nhân viên ${f.email}.`);
      } else if (modal.mode === 'edit') {
        // Không gửi mật khẩu: admin chỉ cấp lại bằng Reset mật khẩu.
        await usersApi.update(modal.item.id, payload(f));
        notify(`Đã cập nhật nhân viên ${f.email}.`);
      } else if (modal.mode === 'reset-pass') {
        const { data } = await usersApi.resetPassword(modal.item.id);
        setOneTime({ email: modal.item.email, password: data.password });
        notify(`Đã đặt lại mật khẩu cho ${modal.item.email}.`);
        return;
      }
      await reload();
    }, notify);

  const remove = () =>
    modal.run(async () => {
      await usersApi.remove(modal.item.id);
      await reload();
      notify('Đã xóa tài khoản nhân viên.');
    }, notify);

  return (
    <>
      <UsersTab
        users={users}
        onAddUser={() => modal.open('add', null, { name: '', email: '', department: defaultDept, role: 'Staff' })}
        onEditUser={(u) => modal.open('edit', u, { ...u })}
        onDeleteUser={(u) => modal.open('delete', u)}
        onResetPassword={(u) => modal.open('reset-pass', u, { ...u })}
      />
      <UserModal
        isOpen={['add', 'edit', 'reset-pass'].includes(modal.mode)}
        mode={modal.mode === 'delete' ? 'edit' : modal.mode || 'add'}
        selectedUser={modal.item}
        departmentsList={departmentsList}
        formData={modal.formData}
        setFormData={modal.setFormData}
        onClose={modal.close}
        onSave={save}
        saving={modal.saving}
      />
      <ConfirmDeleteModal
        isOpen={modal.mode === 'delete'}
        title="Xác nhận xóa nhân viên"
        itemName={modal.item?.name || modal.item?.email}
        onClose={modal.close}
        onConfirm={remove}
        saving={modal.saving}
      />
      <OneTimePasswordModal data={oneTime} onClose={() => setOneTime(null)} />
    </>
  );
}
