import React, { useEffect, useState } from 'react';
import { Bot, Users, Send, Sliders, Building2, X } from 'lucide-react';
import { settingsApi, usersApi } from '../API/API';
import { useEventHubData } from '../API/useEventHubData';
import { DEFAULT_DEPARTMENTS } from '../constants/departments';

// Tabs
import CrawlerTab from './Settings/tabs/CrawlerTab';
import UsersTab from './Settings/tabs/UsersTab';
import TelegramTab from './Settings/tabs/TelegramTab';
import KeywordsTab from './Settings/tabs/KeywordsTab';
import DepartmentsTab from './Settings/tabs/DepartmentsTab';

// Modals
import CrawlPreviewModal from './Settings/modals/CrawlPreviewModal';
import CrawlerModal from './Settings/modals/CrawlerModal';
import UserModal from './Settings/modals/UserModal';
import DepartmentModal from './Settings/modals/DepartmentModal';
import KeywordModal from './Settings/modals/KeywordModal';
import ConfirmDeleteModal from './Settings/modals/ConfirmDeleteModal';

const EMPTY_TELEGRAM_CONFIG = { botToken: '', chatId: '', notifyImmediately: false, includeImage: false };

export default function Setting() {
  const [activeTab, setActiveTab] = useState('crawler');
  const { data: eventHubData } = useEventHubData();

  // Data states
  const [crawlers, setCrawlers] = useState([]);
  const [users, setUsers] = useState([]);
  const [telegramConfig, setTelegramConfig] = useState(EMPTY_TELEGRAM_CONFIG);
  const [keywordRules, setKeywordRules] = useState([]);
  const [departmentRules, setDepartmentRules] = useState([]);
  const [departmentsList, setDepartmentsList] = useState(DEFAULT_DEPARTMENTS);

  // Status & loading states
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [crawlTarget, setCrawlTarget] = useState(null);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlResult, setCrawlResult] = useState(null);

  // Modal control states
  const [modalMode, setModalMode] = useState(null); // 'add-crawler'|'edit-crawler'|'delete-crawler'|'add-user'|'edit-user'|'delete-user'|'reset-pass'|'edit-keyword'|'add-department'|'edit-department'|'delete-department'
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({});

  // Initialize crawlers from eventHubData
  useEffect(() => {
    setCrawlers(
      eventHubData
        .filter((item) => item.id !== 'minhtuan')
        .map((comp) => ({
          id: comp.id,
          name: comp.name,
          logo: comp.logo,
          enabled: true,
          interval: '6h',
          lastRun: 'Chưa có dữ liệu',
          targetUrls: comp.targetUrls || [],
          events: comp.events || [],
        }))
    );
  }, [eventHubData]);

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
          setCrawlers(
            settings.crawler_sources.map((item) => ({
              ...item,
              events: eventHubData.find((brand) => brand.id === item.id)?.events || [],
              lastRun: item.lastRun || 'Chưa có dữ liệu',
            }))
          );
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
        setStatusMessage(err.response?.data?.message || 'Không tải được cấu hình.');
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [eventHubData]);

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
  const openCrawlPopup = (crawler) => {
    setCrawlTarget(crawler);
    setCrawlResult(null);
  };

  const closeCrawlPopup = () => {
    setCrawlTarget(null);
    setCrawlLoading(false);
    setCrawlResult(null);
  };

  const runCrawl = async () => {
    if (!crawlTarget) return;
    setCrawlLoading(true);
    try {
      const response = await settingsApi.runCrawlerById(crawlTarget.id);
      const items = Array.isArray(response.data)
        ? response.data
        : response.data?.items || response.data?.events || [];
      setCrawlResult({ items });
      setStatusMessage(`Đã chạy crawler ${crawlTarget.name}.`);
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Chạy crawler thất bại.');
    } finally {
      setCrawlLoading(false);
    }
  };

  const handleRunAllCrawlers = async () => {
    setCrawlLoading(true);
    try {
      await settingsApi.runAllCrawlers();
      setStatusMessage('Đã kích hoạt cào dữ liệu cho tất cả các đối thủ!');
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
      const cleanTargets = updatedCrawlers.map((c) => ({
        id: c.id,
        name: c.name,
        logo: c.logo || null,
        enabled: c.enabled,
        interval: c.interval || '6h',
        targetUrls: c.targetUrls || [],
      }));
      await settingsApi.saveCrawlers({ targets: cleanTargets });
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
      await settingsApi.saveTelegram(telegramConfig);
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
      await settingsApi.testTelegram(telegramConfig);
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
    setModalMode(null);
    setSelectedItem(null);
    setFormData({});
  };

  // Modal Save actions
  const handleSaveModal = async () => {
    setSettingsSaving(true);
    try {
      if (modalMode === 'add-crawler') {
        const newId = (formData.name || 'crawler').toLowerCase().replace(/[^a-z0-9]/g, '');
        const newCrawler = {
          id: newId || Date.now().toString(),
          name: formData.name || 'Đối thủ mới',
          logo: formData.logo || '/img/mtm.jpg',
          enabled: true,
          interval: formData.interval || '6h',
          lastRun: 'Chưa chạy',
          targetUrls: formData.targetUrls?.filter((u) => u.trim() !== '') || [],
          events: [],
        };
        const updated = [...crawlers, newCrawler];
        await handleSaveCrawlersList(updated);
      } else if (modalMode === 'edit-crawler') {
        const updatedCrawler = {
          ...formData,
          targetUrls: formData.targetUrls?.filter((u) => u.trim() !== '') || [],
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
      handleCloseModal();
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

        {activeTab === 'crawler' && (
          <CrawlerTab
            crawlers={crawlers}
            crawlLoading={crawlLoading}
            onRunAll={handleRunAllCrawlers}
            onAddCrawler={() => handleOpenModal('add-crawler')}
            onOpenCrawlPopup={openCrawlPopup}
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
      </div>

      {/* Popups & Modals */}
      <CrawlPreviewModal
        crawlTarget={crawlTarget}
        crawlLoading={crawlLoading}
        crawlResult={crawlResult}
        onClose={closeCrawlPopup}
        onRunCrawl={runCrawl}
      />

      <CrawlerModal
        isOpen={modalMode === 'add-crawler' || modalMode === 'edit-crawler'}
        mode={modalMode === 'add-crawler' ? 'add' : 'edit'}
        formData={formData}
        setFormData={setFormData}
        onClose={handleCloseModal}
        onSave={handleSaveModal}
        saving={settingsSaving}
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
