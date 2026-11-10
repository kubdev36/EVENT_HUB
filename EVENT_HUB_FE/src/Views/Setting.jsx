import React, { useEffect, useState } from 'react';
import { Bot, Users, Send, Sliders, Building2, ScrollText, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, settingsApi, toCrawlerList, usersApi } from '../API/API';
import { addCrawlerSource, saveCrawlerList } from '../API/crawlerSources';

const RUN_STATUS = { success: 'thành công', partial: 'lỗi một phần', blocked: 'bị chặn', failed: 'lỗi', running: 'đang chạy' };
/** "07/11 10:45 · thành công" từ lần cào gần nhất của nguồn. */
function formatLastRun(run) {
  if (!run?.startedAt) return 'Chưa chạy';
  const when = new Date(run.startedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  return `${when} · ${RUN_STATUS[run.status] || run.status}`;
}

/** Theo dõi tiến độ cào tối đa 10 phút sau lần bấm cuối (tải lại mỗi 5 giây). */
const WATCH_MS = 10 * 60 * 1000;
/** Danh sách nguồn của lần bấm cào kèm trạng thái, từ lượt cào gần nhất của từng nguồn. */
const progressItems = (job, runRows, nameOf) =>
  Object.entries(job?.since ?? {}).map(([id, since]) => ({
    id,
    name: nameOf(id),
    progress: sourceProgress(since, runRows?.find((r) => r.sourceId === id)),
  }));

// Tabs
import CrawlerTab from './Settings/tabs/CrawlerTab';
import CrawlProgress from './Settings/CrawlProgress';
import { sourceProgress, summarizeProgress } from './Settings/crawlProgressState';
import UsersTab from './Settings/tabs/UsersTab';
import TelegramTab from './Settings/tabs/TelegramTab';
import KeywordsTab from './Settings/tabs/KeywordsTab';
import DepartmentsTab from './Settings/tabs/DepartmentsTab';
import AuditTab from './Settings/tabs/AuditTab';

// Modals
import CrawlerModal from './Settings/modals/CrawlerModal';
import UserModal from './Settings/modals/UserModal';
import DepartmentModal from './Settings/modals/DepartmentModal';
import KeywordModal from './Settings/modals/KeywordModal';
import ConfirmDeleteModal from './Settings/modals/ConfirmDeleteModal';

const EMPTY_TELEGRAM_CONFIG = { botToken: '', chatId: '', notifyImmediately: false, includeImage: false };
/** Chỉ gửi các trường backend nhận; botToken trống nghĩa là giữ token đã lưu. */
const telegramPayload = (c) => ({
  botToken: c.botToken || '',
  chatId: c.chatId || '',
  notifyImmediately: Boolean(c.notifyImmediately),
  includeImage: Boolean(c.includeImage),
});

export default function Setting() {
  const [activeTab, setActiveTab] = useState('crawler');
  // Lần bấm cào đang theo dõi: { since: { [sourceId]: thời điểm xếp hàng theo giờ server }, until }.
  const [crawlJob, setCrawlJob] = useState(null);
  // Lần cào gần nhất của từng nguồn (dòng "lần cào cuối" và bảng tiến độ).
  const runs = useQuery({
    queryKey: ['dash', 'summary', 'setting-runs'],
    queryFn: () => dashboardApi.summary({}).then((r) => r.data.sources),
    refetchInterval: (query) => {
      if (!crawlJob || Date.now() > crawlJob.until) return false;
      const done = summarizeProgress(progressItems(crawlJob, query.state.data, (id) => id)).allDone;
      return done ? false : 5000;
    },
  });

  // Data states
  const [crawlers, setCrawlers] = useState([]);
  const [users, setUsers] = useState([]);
  const [telegramConfig, setTelegramConfig] = useState(EMPTY_TELEGRAM_CONFIG);
  const [keywordRules, setKeywordRules] = useState([]);
  const [departmentRules, setDepartmentRules] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);

  // Status & loading states
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [crawlLoading, setCrawlLoading] = useState(false);
  /** id nguồn đang được cào bằng nút "Cào ngay" của thẻ. */
  const [runningId, setRunningId] = useState(null);

  // Modal control states
  const [modalError, setModalError] = useState('');
  const [modalMode, setModalMode] = useState(null); // 'add-crawler'|'edit-crawler'|'delete-crawler'|'add-user'|'edit-user'|'delete-user'|'reset-pass'|'edit-keyword'|'add-department'|'edit-department'|'delete-department'
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({});

  // Load all settings & users
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [settingsRes, usersRes] = await Promise.all([
          settingsApi.getAll(),
          usersApi.list().catch(() => ({ data: [] })),
        ]);

        if (!active) return;

        const settings = settingsRes.data || {};
        if (settings.telegram_config) setTelegramConfig({ ...EMPTY_TELEGRAM_CONFIG, ...settings.telegram_config });
        if (settings.keyword_rules) setKeywordRules(settings.keyword_rules);
        if (settings.department_rules) setDepartmentRules(settings.department_rules);
        if (settings.departments_list && Array.isArray(settings.departments_list) && settings.departments_list.length > 0) {
          setDepartmentsList(settings.departments_list);
        }
        if (settings.crawler_sources) {
          setCrawlers(toCrawlerList(settings.crawler_sources).map((item) => ({ ...item })));
        }

        const list = Array.isArray(usersRes.data) ? usersRes.data : [];
        setUsers(
          list.map((user) => ({
            id: user.id,
            name: user.email,
            email: user.email,
            department: user.department || 'mkt',
            role: user.role === 'admin' ? 'Admin' : 'Staff',
            status: user.isActive ? 'active' : 'inactive',
          }))
        );
      } catch (err) {
        console.error('Không tải được cấu hình:', err);
        setStatusMessage(err.response?.data?.message || 'Không tải được cấu hình.');
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const reloadUsers = async () => {
    try {
      const res = await usersApi.list();
      const list = Array.isArray(res.data) ? res.data : [];
      setUsers(
        list.map((u) => ({
          id: u.id,
          name: u.email,
          email: u.email,
          department: u.department || 'mkt',
          role: u.role === 'admin' ? 'Admin' : 'Staff',
          status: u.isActive ? 'active' : 'inactive',
        }))
      );
    } catch {
      // ignore
    }
  };

  // Crawl execution
  const nameOf = (id) => crawlers.find((c) => c.id === id)?.name || id;
  const crawlItems = progressItems(crawlJob, runs.data, nameOf);
  const crawlJobDone = summarizeProgress(crawlItems).allDone;
  /** Thêm các nguồn vừa xếp hàng (kể cả nguồn đã có việc chờ) vào bảng tiến độ. */
  const trackCrawl = (data) => {
    const ids = [...(data?.queued ?? []), ...(data?.alreadyQueued ?? [])];
    if (!ids.length) return;
    const at = data.at || new Date().toISOString();
    setCrawlJob((prev) => {
      // Lần bấm mới khi bảng cũ đã xong thì bắt đầu bảng mới; đang chạy thì gộp thêm nguồn.
      const keep = prev && !crawlJobDone ? prev.since : {};
      return { since: { ...keep, ...Object.fromEntries(ids.map((id) => [id, at])) }, until: Date.now() + WATCH_MS };
    });
    runs.refetch();
  };

  // "Cào ngay": xếp hàng một nguồn; worker cào nền, tiến độ hiện ở bảng phía trên.
  const runCrawl = async (crawler) => {
    if (!crawler || runningId) return;
    setRunningId(crawler.id);
    try {
      const response = await settingsApi.runCrawlerById(crawler.id);
      trackCrawl(response.data);
    } catch (err) {
      setStatusMessage(err.response?.data?.message || `Xếp hàng cào ${crawler.name} thất bại.`);
    } finally {
      setRunningId(null);
    }
  };

  const handleRunAllCrawlers = async () => {
    setCrawlLoading(true);
    try {
      const response = await settingsApi.runAllCrawlers();
      trackCrawl(response.data);
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Cào tất cả thất bại.');
    } finally {
      setCrawlLoading(false);
    }
  };

  // Handlers for Crawlers
  const handleSaveCrawlersList = async (updatedCrawlers) => {
    setCrawlers(updatedCrawlers);
    setSettingsSaving(true);
    try {
      await saveCrawlerList(updatedCrawlers);
      setStatusMessage('Đã lưu cấu hình Crawler thành công.');
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Lưu cấu hình Crawler thất bại.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleToggleCrawler = (crawlerId) => {
    const updated = crawlers.map((item) =>
      item.id === crawlerId ? { ...item, enabled: !item.enabled } : item
    );
    handleSaveCrawlersList(updated);
  };

  // Handlers for Telegram
  const handleSaveTelegramConfig = async () => {
    setSettingsSaving(true);
    try {
      const res = await settingsApi.saveTelegram(telegramPayload(telegramConfig));
      // Server trả cấu hình đã che token; xóa token vừa nhập khỏi bộ nhớ giao diện.
      setTelegramConfig({ ...EMPTY_TELEGRAM_CONFIG, ...res.data?.value });
      setStatusMessage('Đã lưu cấu hình Telegram thành công.');
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Lưu cấu hình Telegram thất bại.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleTestTelegramConfig = async () => {
    setSettingsSaving(true);
    try {
      await settingsApi.testTelegram(telegramPayload(telegramConfig));
      setStatusMessage('Đã gửi tin nhắn thử nghiệm Telegram.');
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Kiểm tra Telegram thất bại.');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Handlers for Departments
  const handleToggleDepartment = (type, deptKey) => {
    setDepartmentRules((prev) =>
      prev.map((rule) => {
        if (rule.type !== type) return rule;
        const depts = rule.departments || [];
        const hasDept = depts.includes(deptKey);
        const updated = hasDept ? depts.filter((d) => d !== deptKey) : [...depts, deptKey];
        return { ...rule, departments: updated };
      })
    );
  };

  const handleSaveDepartmentRules = async () => {
    setSettingsSaving(true);
    try {
      await settingsApi.saveDepartments({ rules: departmentRules, list: departmentsList });
      setStatusMessage('Đã lưu phân loại và danh sách phòng ban thành công.');
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Lưu phân loại phòng ban thất bại.');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Open & Close Modal
  const handleOpenModal = (mode, item = null) => {
    setModalError('');
    setModalMode(mode);
    setSelectedItem(item);
    if (item) {
      setFormData({
        ...item,
        password: item.password || '••••••••',
        targetUrls: item.targetUrls ? [...item.targetUrls] : [''],
      });
    } else {
      if (mode === 'add-crawler') setFormData({ name: '', logo: '', interval: '6h', targetUrls: [''] });
      if (mode === 'add-user') setFormData({ name: '', email: '', password: '', department: departmentsList[0]?.code || 'mkt', role: 'Staff' });
      if (mode === 'add-department') setFormData({ code: '', name: '', desc: '' });
      if (mode === 'edit-department') setFormData({ code: item?.code || '', name: item?.name || '', desc: item?.desc || '' });
    }
  };

  const handleCloseModal = () => {
    setModalError('');
    setModalMode(null);
    setSelectedItem(null);
    setFormData({});
  };

  // Modal Save actions
  const handleSaveModal = async () => {
    setSettingsSaving(true);
    // Lỗi kiểm tra dữ liệu (vd. trùng mã nguồn) thì giữ popup mở để người dùng sửa.
    let keepOpen = false;
    try {
      if (modalMode === 'add-crawler') {
        // Dùng chung với nút "Thêm đối thủ" ở thanh bên: đọc danh sách mới nhất, kiểm tra trùng mã rồi lưu.
        try {
          setCrawlers(await addCrawlerSource(formData));
          setStatusMessage('Đã thêm đối thủ.');
        } catch (err) {
          setModalError(err.response?.data?.message || err.message);
          keepOpen = true;
          return;
        }
      } else if (modalMode === 'edit-crawler') {
        const cleanForm = { ...formData };
        delete cleanForm.advancedError;
        const updatedCrawler = {
          ...cleanForm,
          targetUrls: formData.targetUrls?.filter((u) => u.trim() !== '') || [],
          // Ghi rõ để xóa trống ô JSON thì cấu hình cũ cũng bị xóa.
          extract: formData.extract,
          api: formData.api,
        };
        const updated = crawlers.map((c) => (c.id === selectedItem.id ? { ...c, ...updatedCrawler } : c));
        await handleSaveCrawlersList(updated);
      } else if (modalMode === 'delete-crawler') {
        const updated = crawlers.filter((c) => c.id !== selectedItem.id);
        await handleSaveCrawlersList(updated);
      } else if (modalMode === 'add-user') {
        await usersApi.create({
          email: formData.email,
          password: formData.password || 'EventHub@2026',
          role: (formData.role || 'Staff').toLowerCase(),
          department: formData.department || departmentsList[0]?.code || 'mkt',
        });
        await reloadUsers();
        setStatusMessage(`Đã thêm nhân viên ${formData.email}.`);
      } else if (modalMode === 'edit-user') {
        await usersApi.update(selectedItem.id, {
          email: formData.email,
          password: formData.password && !formData.password.includes('•') ? formData.password : undefined,
          role: (formData.role || 'Staff').toLowerCase(),
          department: formData.department || departmentsList[0]?.code || 'mkt',
        });
        await reloadUsers();
        setStatusMessage(`Đã cập nhật nhân viên ${formData.email}.`);
      } else if (modalMode === 'delete-user') {
        await usersApi.remove(selectedItem.id);
        await reloadUsers();
        setStatusMessage('Đã xóa tài khoản nhân viên.');
      } else if (modalMode === 'reset-pass') {
        await usersApi.resetPassword(selectedItem.id);
        setStatusMessage(`Đã đặt lại mật khẩu cho ${selectedItem.email} thành EventHub@2026.`);
      } else if (modalMode === 'edit-keyword') {
        const updatedRules = keywordRules.map((k, idx) =>
          idx === selectedItem.idx ? { ...k, keywords: formData.keywords } : k
        );
        setKeywordRules(updatedRules);
        await settingsApi.saveKeywords({ rules: updatedRules });
        setStatusMessage('Đã lưu từ khóa phân loại.');
      } else if (modalMode === 'add-department') {
        const rawCode = (formData.code || formData.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!rawCode || !formData.name?.trim()) {
          setStatusMessage('Vui lòng nhập đầy đủ tên và mã phòng ban.');
          return;
        }
        if (departmentsList.some((d) => d.code === rawCode)) {
          setStatusMessage(`Mã phòng ban "${rawCode}" đã tồn tại.`);
          return;
        }
        const newDept = {
          code: rawCode,
          name: formData.name.trim(),
          desc: formData.desc?.trim() || '',
        };
        const updatedList = [...departmentsList, newDept];
        setDepartmentsList(updatedList);
        await settingsApi.saveDepartments({ list: updatedList, rules: departmentRules });
        setStatusMessage(`Đã thêm phòng ban ${newDept.name} thành công.`);
      } else if (modalMode === 'edit-department') {
        if (!formData.name?.trim()) {
          setStatusMessage('Tên phòng ban không được để trống.');
          return;
        }
        const updatedList = departmentsList.map((d) =>
          d.code === selectedItem.code ? { ...d, name: formData.name.trim(), desc: formData.desc?.trim() || '' } : d
        );
        setDepartmentsList(updatedList);
        await settingsApi.saveDepartments({ list: updatedList, rules: departmentRules });
        setStatusMessage(`Đã cập nhật phòng ban ${formData.name}.`);
      } else if (modalMode === 'delete-department') {
        const updatedList = departmentsList.filter((d) => d.code !== selectedItem.code);
        const updatedRules = departmentRules.map((rule) => ({
          ...rule,
          departments: (rule.departments || []).filter((d) => d !== selectedItem.code),
        }));
        setDepartmentsList(updatedList);
        setDepartmentRules(updatedRules);
        await settingsApi.saveDepartments({ list: updatedList, rules: updatedRules });
        setStatusMessage(`Đã xóa phòng ban ${selectedItem.name}.`);
      }
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Thao tác thất bại.');
    } finally {
      setSettingsSaving(false);
      if (!keepOpen) handleCloseModal();
    }
  };

  return (
    <div className="flex flex-col w-full bg-slate-50 text-slate-800 font-sans pb-10">
      {/* Header Tabs */}
      <div className="p-3.5 sm:p-4 lg:p-6 bg-white border-b border-slate-200 shrink-0 space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Cài đặt hệ thống</h1>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            Quản trị nguồn cào dữ liệu, tài khoản, phòng ban và thông báo Telegram
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-100 pb-1 text-xs font-semibold overflow-x-auto">
          {[
            { id: 'crawler', label: 'Cấu hình Crawler', icon: Bot },
            { id: 'users', label: 'Tài khoản nhân viên', icon: Users },
            { id: 'telegram', label: 'Thông báo Telegram', icon: Send },
            { id: 'keywords', label: 'Từ khóa phân loại', icon: Sliders },
            { id: 'departments', label: 'Phòng ban', icon: Building2 },
            { id: 'audit', label: 'Nhật ký', icon: ScrollText },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`h-8 px-3 sm:px-3.5 rounded-lg flex items-center gap-1.5 sm:gap-2 transition cursor-pointer shrink-0 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="p-3 sm:p-4 lg:p-6 space-y-4">
        {statusMessage && (
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium rounded-xl flex items-center justify-between transition">
            <span>{statusMessage}</span>
            <button onClick={() => setStatusMessage('')} className="p-1 hover:bg-blue-100 rounded text-blue-600 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {activeTab === 'crawler' && crawlJob && (
          <CrawlProgress items={crawlItems} onClose={() => setCrawlJob(null)} />
        )}

        {activeTab === 'crawler' && (
          <CrawlerTab
            crawlers={crawlers.map((c) => ({ ...c, lastRun: formatLastRun(runs.data?.find((r) => r.sourceId === c.id)) }))}
            crawlLoading={crawlLoading}
            onRunAll={handleRunAllCrawlers}
            onAddCrawler={() => handleOpenModal('add-crawler')}
            runningId={runningId}
            onRunCrawler={runCrawl}
            onEditCrawler={(c) => handleOpenModal('edit-crawler', c)}
            onDeleteCrawler={(c) => handleOpenModal('delete-crawler', c)}
            onToggleCrawler={handleToggleCrawler}
          />
        )}

        {activeTab === 'users' && (
          <UsersTab
            users={users}
            onAddUser={() => handleOpenModal('add-user')}
            onEditUser={(u) => handleOpenModal('edit-user', u)}
            onDeleteUser={(u) => handleOpenModal('delete-user', u)}
            onResetPassword={(u) => handleOpenModal('reset-pass', u)}
          />
        )}

        {activeTab === 'telegram' && (
          <TelegramTab
            telegramConfig={telegramConfig}
            setTelegramConfig={setTelegramConfig}
            onTest={handleTestTelegramConfig}
            onSave={handleSaveTelegramConfig}
            settingsSaving={settingsSaving}
          />
        )}

        {activeTab === 'keywords' && (
          <KeywordsTab
            keywordRules={keywordRules}
            onEditKeyword={(rule, idx) => handleOpenModal('edit-keyword', { ...rule, idx })}
          />
        )}

        {activeTab === 'departments' && (
          <DepartmentsTab
            departmentsList={departmentsList}
            departmentRules={departmentRules}
            settingsSaving={settingsSaving}
            onAddDepartment={() => handleOpenModal('add-department')}
            onEditDepartment={(dept) => handleOpenModal('edit-department', dept)}
            onDeleteDepartment={(dept) => handleOpenModal('delete-department', dept)}
            onToggleDepartment={handleToggleDepartment}
            onSaveDepartmentRules={handleSaveDepartmentRules}
          />
        )}

        {activeTab === 'audit' && <AuditTab />}
      </div>

      {/* Popups & Modals */}

      <CrawlerModal
        isOpen={modalMode === 'add-crawler' || modalMode === 'edit-crawler'}
        mode={modalMode === 'add-crawler' ? 'add' : 'edit'}
        formData={formData}
        setFormData={setFormData}
        onClose={handleCloseModal}
        onSave={handleSaveModal}
        saving={settingsSaving}
        error={modalError}
      />

      <UserModal
        isOpen={modalMode === 'add-user' || modalMode === 'edit-user' || modalMode === 'reset-pass'}
        mode={modalMode === 'add-user' ? 'add' : modalMode === 'edit-user' ? 'edit' : 'reset-pass'}
        selectedUser={selectedItem}
        departmentsList={departmentsList}
        formData={formData}
        setFormData={setFormData}
        onClose={handleCloseModal}
        onSave={handleSaveModal}
        saving={settingsSaving}
      />

      <DepartmentModal
        isOpen={modalMode === 'add-department' || modalMode === 'edit-department'}
        mode={modalMode === 'add-department' ? 'add' : 'edit'}
        formData={formData}
        setFormData={setFormData}
        onClose={handleCloseModal}
        onSave={handleSaveModal}
        saving={settingsSaving}
      />

      <KeywordModal
        isOpen={modalMode === 'edit-keyword'}
        formData={formData}
        setFormData={setFormData}
        onClose={handleCloseModal}
        onSave={handleSaveModal}
        saving={settingsSaving}
      />

      <ConfirmDeleteModal
        isOpen={modalMode === 'delete-crawler' || modalMode === 'delete-user' || modalMode === 'delete-department'}
        title={
          modalMode === 'delete-crawler'
            ? 'Xác nhận xóa đối thủ'
            : modalMode === 'delete-user'
            ? 'Xác nhận xóa nhân viên'
            : 'Xác nhận xóa phòng ban'
        }
        itemName={selectedItem?.name}
        onClose={handleCloseModal}
        onConfirm={handleSaveModal}
        saving={settingsSaving}
      />
    </div>
  );
}
