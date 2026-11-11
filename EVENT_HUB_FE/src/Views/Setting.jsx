import { useCallback, useEffect, useState } from 'react';
import { Bot, Users, Send, Sliders, Building2, ScrollText, Smartphone } from 'lucide-react';
import { settingsApi, toCrawlerList } from '../API/API';
import AuditTab from './Settings/tabs/AuditTab';
import CrawlerSection from './Settings/sections/CrawlerSection';
import UsersSection from './Settings/sections/UsersSection';
import TelegramSection from './Settings/sections/TelegramSection';
import { EMPTY_TELEGRAM_CONFIG } from './Settings/sections/telegramConfig';
import KeywordsSection from './Settings/sections/KeywordsSection';
import DepartmentsSection from './Settings/sections/DepartmentsSection';
import ProductsSection from './Settings/sections/ProductsSection';
import { useToast } from '../Components/toast/toastContext';

const TABS = [
  { id: 'crawler', label: 'Cấu hình Crawler', icon: Bot },
  { id: 'users', label: 'Tài khoản nhân viên', icon: Users },
  { id: 'telegram', label: 'Thông báo Telegram', icon: Send },
  { id: 'keywords', label: 'Từ khóa phân loại', icon: Sliders },
  { id: 'products', label: 'Sản phẩm theo dõi', icon: Smartphone },
  { id: 'departments', label: 'Phòng ban', icon: Building2 },
  { id: 'audit', label: 'Nhật ký', icon: ScrollText },
];

/** Dữ liệu ban đầu của các tab từ GET /settings. */
function fromSettings(settings) {
  return {
    crawlers: toCrawlerList(settings.crawler_sources).map((item) => ({ ...item })),
    telegram: { ...EMPTY_TELEGRAM_CONFIG, ...settings.telegram_config },
    keywordRules: Array.isArray(settings.keyword_rules) ? settings.keyword_rules : [],
    departmentRules: Array.isArray(settings.department_rules) ? settings.department_rules : [],
    departmentsList: Array.isArray(settings.departments_list) ? settings.departments_list : [],
    trackedProducts: Array.isArray(settings.tracked_products) ? settings.tracked_products : [],
  };
}

/**
 * Trang Cài đặt: tải cấu hình một lần, giữ thanh tab và thanh thông báo chung. Mỗi tab tự quản lý
 * dữ liệu, popup và cách lưu của mình (Settings/sections). Các tab luôn được giữ trong trang (chỉ ẩn)
 * để sửa ở một tab rồi chuyển tab không mất trạng thái.
 */
export default function Setting() {
  const [activeTab, setActiveTab] = useState('crawler');
  const toast = useToast();
  // Báo kết quả thao tác bằng toast; type 'error' cho lỗi.
  const notify = useCallback((message, type) => toast.show(message, type), [toast]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [initial, setInitial] = useState(null);
  // Danh sách phòng ban dùng chung cho tab Nhân viên và tab Phòng ban.
  const [departmentsList, setDepartmentsList] = useState([]);

  useEffect(() => {
    let active = true;
    settingsApi
      .getAll()
      .then((res) => {
        if (!active) return;
        const data = fromSettings(res.data || {});
        setInitial(data);
        setDepartmentsList(data.departmentsList);
      })
      .catch((err) => {
        console.error('Không tải được cấu hình:', err);
        if (!active) return;
        setLoadFailed(true);
        notify(err.response?.data?.message || 'Không tải được cấu hình.', 'error');
      });
    return () => {
      active = false;
    };
  }, [notify]);

  return (
    <div className="flex flex-col w-full bg-slate-50 text-slate-800 font-sans pb-10">
      <div className="p-3.5 sm:p-4 lg:p-6 bg-white border-b border-slate-200 shrink-0 space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Cài đặt hệ thống</h1>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            Quản trị nguồn cào dữ liệu, tài khoản, phòng ban và thông báo Telegram
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-100 pb-1 text-xs font-semibold overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`h-8 px-3 sm:px-3.5 rounded-lg flex items-center gap-1.5 sm:gap-2 transition cursor-pointer shrink-0 whitespace-nowrap ${
                activeTab === id ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 sm:p-4 lg:p-6 space-y-4">
        {!initial && !loadFailed && <p className="text-xs text-slate-400">Đang tải cấu hình...</p>}

        {initial && (
          <>
            <div hidden={activeTab !== 'crawler'}>
              <CrawlerSection initialCrawlers={initial.crawlers} notify={notify} />
            </div>
            <div hidden={activeTab !== 'users'}>
              <UsersSection departmentsList={departmentsList} notify={notify} />
            </div>
            <div hidden={activeTab !== 'telegram'}>
              <TelegramSection initialConfig={initial.telegram} notify={notify} />
            </div>
            <div hidden={activeTab !== 'keywords'}>
              <KeywordsSection initialRules={initial.keywordRules} notify={notify} />
            </div>
            <div hidden={activeTab !== 'products'}>
              <ProductsSection initialProducts={initial.trackedProducts} notify={notify} />
            </div>
            <div hidden={activeTab !== 'departments'}>
              <DepartmentsSection
                departmentsList={departmentsList}
                setDepartmentsList={setDepartmentsList}
                initialRules={initial.departmentRules}
                notify={notify}
              />
            </div>
          </>
        )}

        {activeTab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}
