import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { settingsApi } from '../../../API/API';

const MAX_PRODUCTS = 100;
const MAX_ALIASES = 10;

const toRows = (list) =>
  (Array.isArray(list) ? list : []).map((p) => ({ name: p.name ?? '', aliases: (p.aliases ?? []).join(', ') }));

/**
 * Tab "Sản phẩm theo dõi": danh sách sản phẩm dùng để đếm "Sản phẩm được nhắc nhiều nhất" ở trang
 * Báo cáo. Mỗi sản phẩm có tên hiển thị và các cách viết khác trong tiêu đề bài.
 */
export default function ProductsSection({ initialProducts, notify }) {
  const [rows, setRows] = useState(() => toRows(initialProducts));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (i, field, value) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  const remove = (i) => setRows((r) => r.filter((_, idx) => idx !== i));
  const add = () => setRows((r) => [...r, { name: '', aliases: '' }]);

  const save = async () => {
    setError('');
    const products = rows
      .map((r) => ({
        name: r.name.trim(),
        aliases: r.aliases.split(',').map((a) => a.trim()).filter(Boolean),
      }))
      .filter((p) => p.name);
    const tooMany = products.find((p) => p.aliases.length > MAX_ALIASES);
    if (tooMany) return setError(`"${tooMany.name}" có quá ${MAX_ALIASES} cách viết.`);
    if (products.length > MAX_PRODUCTS) return setError(`Tối đa ${MAX_PRODUCTS} sản phẩm.`);
    setSaving(true);
    try {
      const res = await settingsApi.saveProducts({ products });
      setRows(toRows(res.data?.value ?? products));
      notify('Đã lưu danh sách sản phẩm theo dõi.');
    } catch (err) {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join('; ') : msg || 'Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Sản phẩm theo dõi</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Dùng cho thẻ "Sản phẩm được nhắc nhiều nhất" ở trang Báo cáo. Bài được tính khi tiêu đề chứa tên hoặc một
          cách viết khác (không phân biệt hoa thường, dấu cách giữa chữ và số tùy ý). Khi hai tên chồng nhau, tên dài hơn
          được tính: "iPhone 18 Pro Max" không tính cho "iPhone 18 Pro".
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-2 font-semibold w-1/3">Tên hiển thị</th>
              <th className="py-2 pr-2 font-semibold">Cách viết khác (cách nhau bằng dấu phẩy)</th>
              <th className="py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-1.5 pr-2">
                  <input
                    value={row.name}
                    maxLength={60}
                    onChange={(e) => update(i, 'name', e.target.value)}
                    placeholder="iPhone 18 Pro"
                    aria-label="Tên sản phẩm"
                    className="w-full h-8 px-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    value={row.aliases}
                    onChange={(e) => update(i, 'aliases', e.target.value)}
                    placeholder="ip 18 pro, iphone18 pro"
                    aria-label="Cách viết khác"
                    className="w-full h-8 px-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </td>
                <td className="py-1.5">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    title="Xóa"
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-slate-400">
                  Chưa có sản phẩm nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <p role="alert" className="text-rose-600 text-[11px] font-medium">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={add}
          disabled={rows.length >= MAX_PRODUCTS}
          className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Plus size={14} /> Thêm sản phẩm
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-8 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </div>
  );
}
