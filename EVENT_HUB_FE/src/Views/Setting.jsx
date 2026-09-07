import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot,
  Users,
  Send,
  Sliders,
  Building2,
  Plus,
  Edit2,
  Trash2,
  KeyRound,
  Play,
  Clock,
  X,
  Loader2,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { CATEGORY_STYLES } from '../constants/eventStyles';
import { settingsApi, usersApi } from '../API/API';
import { useEventHubData } from '../API/useEventHubData';
import { getBrandLogo } from '../constants/brandLogos';

const EMPTY_TELEGRAM_CONFIG = { botToken: '', chatId: '', notifyImmediately: false, includeImage: false };

export default function Setting() {
  const [activeTab, setActiveTab] = useState('crawler');
  const [crawlTarget, setCrawlTarget] = useState(null);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlResult, setCrawlResult] = useState(null);
  const { data: eventHubData } = useEventHubData();
  const [crawlers, setCrawlers] = useState([]);
  const [users, setUsers] = useState([]);
  const [telegramConfig, setTelegramConfig] = useState(EMPTY_TELEGRAM_CONFIG);
  const [keywordRules, setKeywordRules] = useState([]);
  const [departmentRules, setDepartmentRules] = useState([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const [modalMode, setModalMode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({});

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
          lastRun: 'Chua co du lieu',
          targetUrls: comp.targetUrls || [],
          events: comp.events || [],
        }))
    );
  }, [eventHubData]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setUsersLoading(true);
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
        if (settings.crawler_sources) {
          setCrawlers(
            settings.crawler_sources.map((item) => ({
              ...item,
              events: eventHubData.find((brand) => brand.id === item.id)?.events || [],
              lastRun: item.lastRun || 'Chua co du lieu',
            }))
          );
        }

        const list = Array.isArray(usersRes.data) ? usersRes.data : [];
        setUsers(
          list.map((user) => ({
            id: user.id,
            name: user.email,
            email: user.email,
            department: user.department || 'MKT',
            role: user.role === 'admin' ? 'Admin' : 'Staff',
            status: user.isActive ? 'active' : 'inactive',
          }))
        );
      } catch (err) {
        setStatusMessage(err.response?.data?.message || 'Khong tai duoc cau hinh.');
      } finally {
        if (active) setUsersLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [eventHubData]);

  const openCrawlPopup = (crawler) => {
    setCrawlTarget(crawler);
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

  const closePopup = () => {
    setCrawlTarget(null);
    setCrawlLoading(false);
    setCrawlResult(null);
  };

  const formatEventDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  };

  const handleOpenModal = (mode, item = null) => {
    setModalMode(mode);
    setSelectedItem(item);
    if (item) {
      setFormData({ 
        ...item, 
        password: item.password || '••••••••',
        targetUrls: item.targetUrls ? [...item.targetUrls] : [''] 
      });
    } else {
      if (mode === 'add-crawler') setFormData({ name: '', logo: '', interval: '6h', targetUrls: [''] });
      if (mode === 'add-user') setFormData({ name: '', email: '', password: '', department: 'MKT', role: 'Staff' });
    }
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedItem(null);
    setFormData({});
  };

  const handleAddUrlField = () => {
    const urls = formData.targetUrls || [];
    setFormData({ ...formData, targetUrls: [...urls, ''] });
  };

  const handleUrlChange = (index, value) => {
    const urls = [...(formData.targetUrls || [])];
    urls[index] = value;
    setFormData({ ...formData, targetUrls: urls });
  };

  const handleRemoveUrlField = (index) => {
    const urls = [...(formData.targetUrls || [])];
    urls.splice(index, 1);
    setFormData({ ...formData, targetUrls: urls.length ? urls : [''] });
  };

  const reloadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await usersApi.list();
      const list = Array.isArray(res.data) ? res.data : [];
      setUsers(
        list.map((u) => ({
          id: u.id,
          name: u.email,
          email: u.email,
          department: u.department || 'MKT',
          role: u.role === 'admin' ? 'Admin' : 'Staff',
          status: u.isActive ? 'active' : 'inactive',
        }))
      );
    } catch {
      // ignore user load error
    } finally {
      setUsersLoading(false);
    }
  };

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
      await settingsApi.saveDepartments({ rules: departmentRules });
      setStatusMessage('Đã lưu phân loại phòng ban thành công.');
    } catch (err) {
      setStatusMessage(err.response?.data?.message || 'Lưu phân loại phòng ban thất bại.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSaveData = async () => {
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
          department: formData.department || 'MKT',
        });
        await reloadUsers();
        setStatusMessage(`Đã thêm nhân viên ${formData.email}.`);
      } else if (modalMode === 'edit-user') {
        await usersApi.update(selectedItem.id, {
          email: formData.email,
          password: formData.password && !formData.password.includes('•') ? formData.password : undefined,
          role: (formData.role || 'Staff').toLowerCase(),
          department: formData.department || 'MKT',
        });
        await reloadUsers();
        setStatusMessage(`Đã cập nhật nhân viên ${formData.email}.`);
      } else if (modalMode === 'delete-user') {
        await usersApi.remove(selectedItem.id);
        await reloadUsers();
        setStatusMessage(`Đã xóa tài khoản nhân viên.`);
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
      <div className="p-3.5 sm:p-4 lg:p-6 bg-white border-b border-slate-200 shrink-0 space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Cài đặt hệ thống</h1>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Quản trị nguồn cào dữ liệu, tài khoản và thông báo Telegram</p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-100 pb-1 text-xs font-semibold overflow-x-auto">
          {[
            { id: 'crawler', label: 'Cấu hình Crawler', icon: Bot },
            { id: 'users', label: 'Tài khoản nhân viên', icon: Users },
            { id: 'telegram', label: 'Thông báo Telegram', icon: Send },
            { id: 'keywords', label: 'Từ khóa phân loại', icon: Sliders },
            { id: 'departments', label: 'Phân loại phòng ban', icon: Building2 },
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
          <div className="space-y-3 w-full">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">Danh sách Crawler ({crawlers.length})</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunAllCrawlers}
                  disabled={crawlLoading}
                  className="h-8 px-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
                  title="Cào ngay toàn bộ các trang đối thủ"
                >
                  {crawlLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-blue-600" />
                      <span>Đang cào tất cả...</span>
                    </>
                  ) : (
                    <>
                      <Play size={12} className="text-blue-600 fill-blue-600" />
                      <span>Cào tất cả</span>
                    </>
                  )}
                </button>
                <button 
                  onClick={() => handleOpenModal('add-crawler')}
                  className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <Plus size={14} />
                  <span className="hidden xs:inline">Thêm đối thủ</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {crawlers.map((c) => (
                <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-2xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <img
                        src={getBrandLogo(c.id, c.name, c.logo)}
                        alt={c.name}
                        onError={(e) => { e.currentTarget.src = getBrandLogo(c.id, c.name); }}
                        className="w-8 h-8 rounded-lg object-contain border border-slate-200 p-0.5 bg-white shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{c.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                          <Clock size={10} className="shrink-0" />
                          <span className="truncate">Quét {c.interval}/lần • {c.lastRun}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <button
                        onClick={() => openCrawlPopup(c)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-medium flex items-center gap-1 transition cursor-pointer border border-blue-200"
                      >
                        <Play size={11} /> Cào ngay
                      </button>
                      <button 
                        onClick={() => handleOpenModal('edit-crawler', c)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md transition cursor-pointer"
                        title="Sửa"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        onClick={() => handleOpenModal('delete-crawler', c)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition cursor-pointer"
                        title="Xóa"
                      >
                        <Trash2 size={13} />
                      </button>
                      <input
                        type="checkbox"
                        checked={c.enabled}
                        onChange={() => handleToggleCrawler(c.id)}
                        className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="text-[11px] space-y-1">
                    <div className="font-semibold text-slate-600">Link theo dõi:</div>
                    {c.targetUrls.map((url, idx) => (
                      <div key={idx} className="w-full p-2 bg-slate-50 rounded border border-slate-100 text-slate-600 font-mono text-[10px] sm:text-[11px] break-all">
                        {url}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="w-full bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-3 sm:p-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">Danh sách tài khoản ({users.length})</span>
              <button 
                onClick={() => handleOpenModal('add-user')}
                className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs"
              >
                <Plus size={14} />
                <span className="hidden xs:inline">Thêm nhân viên</span>
              </button>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {users.map((u) => (
                <div key={u.id} className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50 transition">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{u.name}</div>
                    <div className="text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5">{u.email} • {u.department}</div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${u.role === 'Admin' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-600'}`}>
                      {u.role}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleOpenModal('reset-pass', u)} title="Reset mật khẩu" className="p-1.5 text-slate-400 hover:text-orange-600 rounded cursor-pointer">
                        <KeyRound size={14} />
                      </button>
                      <button onClick={() => handleOpenModal('edit-user', u)} title="Sửa" className="p-1.5 text-slate-400 hover:text-blue-600 rounded cursor-pointer">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleOpenModal('delete-user', u)} title="Xóa" className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'telegram' && (
          <div className="w-full bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4 text-xs">
            <h2 className="text-sm font-bold text-slate-900">Cấu hình Bot Telegram</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Bot Token:</label>
                <input
                  type="text"
                  value={telegramConfig.botToken}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
                  className="w-full h-8.5 rounded-lg border border-slate-200 px-3 font-mono text-[11px] sm:text-xs outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Chat ID / Group ID:</label>
                <input
                  type="text"
                  value={telegramConfig.chatId}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
                  className="w-full h-8.5 rounded-lg border border-slate-200 px-3 font-mono text-[11px] sm:text-xs outline-none focus:border-blue-500"
                />
              </div>
              <div className="pt-2 space-y-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={telegramConfig.notifyImmediately} onChange={(e) => setTelegramConfig({ ...telegramConfig, notifyImmediately: e.target.checked })} className="w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0" />
                  <span>Gửi tin nhắn tức thì khi cào được sự kiện mới</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={telegramConfig.includeImage} onChange={(e) => setTelegramConfig({ ...telegramConfig, includeImage: e.target.checked })} className="w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0" />
                  <span>Đính kèm ảnh banner vào tin nhắn</span>
                </label>
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  onClick={handleTestTelegramConfig}
                  disabled={settingsSaving}
                  className="h-8.5 px-3.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold cursor-pointer disabled:opacity-50"
                >
                  Test thử
                </button>
                <button
                  onClick={handleSaveTelegramConfig}
                  disabled={settingsSaving}
                  className="h-8.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  {settingsSaving ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'keywords' && (
          <div className="space-y-3 w-full">
            <h2 className="text-xs font-bold text-slate-700">Luật phân loại tự động</h2>
            <div className="space-y-2.5 w-full">
              {keywordRules.map((rule, idx) => (
                <div key={idx} className="w-full bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-2xs space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">{rule.label} ({rule.type})</span>
                    <button 
                      onClick={() => handleOpenModal('edit-keyword', { ...rule, idx })}
                      className="text-blue-600 hover:underline font-semibold cursor-pointer text-[11px] shrink-0"
                    >
                      Sửa từ khóa
                    </button>
                  </div>
                  <div className="w-full p-2 sm:p-2.5 rounded bg-slate-50 border border-slate-100 font-mono text-[10px] sm:text-[11px] text-slate-600 break-words">
                    {rule.keywords}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'departments' && (
          <div className="w-full bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Phân loại nhãn sự kiện cho từng Phòng ban</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">Tích chọn để chia nhãn sự kiện tương ứng cho phòng Marketing và Kinh doanh</p>
              </div>
              <button
                onClick={handleSaveDepartmentRules}
                disabled={settingsSaving}
                className="h-8.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer shadow-2xs disabled:opacity-50 shrink-0 self-start sm:self-auto"
              >
                {settingsSaving ? 'Đang lưu...' : 'Lưu phân loại'}
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {departmentRules.map((rule) => {
                const isMkt = (rule.departments || []).includes('mkt');
                const isKinhDoanh = (rule.departments || []).includes('kinh_doanh');

                return (
                  <div key={rule.type} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 px-2 rounded-lg transition">
                    <div>
                      <span className="font-bold text-slate-800 text-xs sm:text-sm">{rule.label}</span>
                      <span className="ml-2 font-mono text-[10px] text-slate-400">({rule.type})</span>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium select-none">
                        <input
                          type="checkbox"
                          checked={isMkt}
                          onChange={() => handleToggleDepartment(rule.type, 'mkt')}
                          className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                        />
                        <span>Marketing</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium select-none">
                        <input
                          type="checkbox"
                          checked={isKinhDoanh}
                          onChange={() => handleToggleDepartment(rule.type, 'kinh_doanh')}
                          className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                        />
                        <span>Kinh doanh</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {crawlTarget && createPortal(
        <div className="fixed inset-0 z-[9999] bg-blue-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-[46rem] max-h-[90vh] overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl flex flex-col my-auto">
            
            <div className="relative flex items-center justify-center px-4 py-3 bg-white border-b border-slate-100 shrink-0">
              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center p-1 shadow-xs border border-slate-200">
                <img src={crawlTarget.logo} alt={crawlTarget.name} className="h-full w-full object-contain" />
              </div>
              <button 
                onClick={closePopup} 
                className="absolute right-3 shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!crawlResult ? (
                <>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                    <div className="text-sm font-semibold text-blue-900">Bắt đầu cào dữ liệu?</div>
                    <div className="mt-1 text-[11px] leading-5 text-blue-700/80">
                      Hệ thống sẽ quét {crawlTarget.targetUrls.length} URL và cập nhật sự kiện mới.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {crawlTarget.targetUrls.map((url) => (
                        <div key={url} className="max-w-full rounded-full border border-blue-200 bg-white px-3 py-1 text-[10px] text-blue-800 truncate">
                          {url}
                        </div>
                      ))}
                    </div>
                  </div>

                  {crawlLoading ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                        <Loader2 size={15} className="animate-spin" />
                        <span>Đang cào dữ liệu từ nguồn...</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                        <div className="h-full w-2/3 rounded-full bg-blue-600 animate-pulse" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button onClick={closePopup} className="h-9 px-3.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
                        Hủy
                      </button>
                      <button onClick={runCrawl} className="h-9 px-4 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 inline-flex items-center gap-1.5 cursor-pointer shadow-xs">
                        <ArrowRight size={13} />
                        Bắt đầu cào
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-5 p-2 max-h-[58vh] overflow-y-auto pr-1">
                    {crawlResult.items.map((event) => {
                      const style = CATEGORY_STYLES[event.type] || CATEGORY_STYLES.release;
                      const formattedDate = formatEventDate(event.date);
                      return (
                        <div key={event.id} className="relative pl-4 sm:pl-5 border-l-2 border-blue-200">
                          <span className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ring-4 ring-white ${style.dot}`} />

                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-500 font-medium">
                              <Clock size={12} className="text-blue-500" />
                              <span>{formattedDate} {event.time ? `• ${event.time}` : ''}</span>
                            </span>
                            <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold leading-none ${style.pill}`}>
                              {style.label}
                            </span>
                          </div>

                          <div className="flex items-start justify-between gap-2">
                            <div className="text-xs font-bold text-slate-900 leading-snug flex-1">
                              {event.fullTitle || event.title}
                            </div>
                            {event.url && (
                              <a
                                href={event.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 shrink-0 transition"
                              >
                                <span>Chi tiết</span>
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>

                          {event.desc && (
                            <div className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                              {event.desc}
                            </div>
                          )}

                          {event.image && (
                            <div
                              onClick={() => event.url && window.open(event.url, '_blank')}
                              title="Bấm để xem bài viết gốc"
                              className="mt-2.5 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-2xs cursor-pointer hover:border-blue-400 hover:shadow-xs transition group"
                            >
                              <img
                                src={event.image}
                                alt={event.title}
                                className="w-full max-h-48 object-contain rounded-lg transition duration-200 group-hover:scale-[1.01]"
                                loading="lazy"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <button onClick={closePopup} className="h-9 px-4 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer shadow-xs">
                      Đóng
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalMode && createPortal(
        <div className="fixed inset-0 z-[9999] bg-blue-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-blue-100 bg-white shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
              <div className="text-xs font-bold uppercase tracking-wider">
                {modalMode === 'add-crawler' && 'Thêm đối thủ mới'}
                {modalMode === 'edit-crawler' && 'Chỉnh sửa Crawler'}
                {modalMode === 'delete-crawler' && 'Xác nhận xóa đối thủ'}
                {modalMode === 'add-user' && 'Thêm nhân viên mới'}
                {modalMode === 'edit-user' && 'Chỉnh sửa tài khoản'}
                {modalMode === 'delete-user' && 'Xác nhận xóa nhân viên'}
                {modalMode === 'reset-pass' && 'Reset mật khẩu'}
                {modalMode === 'edit-keyword' && 'Sửa từ khóa phân loại'}
              </div>
              <button onClick={handleCloseModal} className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              {(modalMode === 'add-crawler' || modalMode === 'edit-crawler') && (
                <>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Tên đối thủ:</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="VD: CellphoneS, FPT Shop..."
                      className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-700">Logo đối thủ:</label>
                    <div className="flex items-center gap-3">
                      {formData.logo ? (
                        <div className="relative group shrink-0">
                          <img
                            src={formData.logo}
                            alt="Logo preview"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = '/img/mtm.jpg';
                            }}
                            className="w-10 h-10 rounded-lg object-contain border border-slate-200 p-1 bg-white shadow-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, logo: '' })}
                            className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 shadow-md hover:bg-rose-600 transition cursor-pointer"
                            title="Xóa logo"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                          <ImageIcon size={18} />
                        </div>
                      )}

                      <label className="flex-1 cursor-pointer">
                        <div className="h-8.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 text-blue-600 font-semibold px-3 flex items-center justify-center gap-2 transition text-xs select-none shadow-2xs">
                          <Upload size={14} />
                          <span>{formData.logo ? 'Thay đổi file logo (Browse...)' : 'Tải file logo từ máy (Browse...)'}</span>
                        </div>
                        <input
                          type="file"
                          accept="image/*,.htm,.html,*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              if (evt.target?.result) {
                                setFormData((prev) => ({ ...prev, logo: evt.target.result }));
                              }
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    </div>

                    <input
                      type="text"
                      value={formData.logo || ''}
                      onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                      placeholder="Hoặc dán link URL logo (.png, .jpg, .htm, .html...)"
                      className="w-full h-8 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px] mt-1"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-700">Link RSS / Website theo dõi:</label>
                      <button
                        type="button"
                        onClick={handleAddUrlField}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition cursor-pointer"
                      >
                        <Plus size={13} /> Thêm đường dẫn
                      </button>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {(formData.targetUrls || ['']).map((url, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={url}
                            onChange={(e) => handleUrlChange(index, e.target.value)}
                            placeholder="https://..."
                            className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px]"
                          />
                          {formData.targetUrls.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveUrlField(index)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition cursor-pointer shrink-0"
                              title="Xóa đường dẫn này"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {(modalMode === 'delete-crawler' || modalMode === 'delete-user') && (
                <div className="flex items-start gap-3 py-2 text-slate-600">
                  <div className="p-2 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Bạn có chắc chắn muốn xóa?</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Hành động này sẽ xóa vĩnh viễn <span className="font-semibold text-slate-800">{selectedItem?.name}</span> khỏi hệ thống.</div>
                  </div>
                </div>
              )}

              {(modalMode === 'add-user' || modalMode === 'edit-user') && (
                <>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Họ và tên:</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nguyễn Văn A"
                      className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Email:</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@company.com"
                      className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Mật khẩu:</label>
                    <input
                      type="text"
                      value={formData.password || ''}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Nhập mật khẩu tài khoản"
                      className="w-full h-8.5 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500 font-mono text-[11px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Phòng ban:</label>
                      <select
                        value={formData.department || 'MKT'}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className="w-full h-8.5 rounded-lg border border-slate-200 px-2 outline-none bg-white"
                      >
                        <option value="MKT">MKT</option>
                        <option value="Kinh doanh">Kinh doanh</option>
                        <option value="Vận hành">Vận hành</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Quyền hạn:</label>
                      <select
                        value={formData.role || 'Staff'}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full h-8.5 rounded-lg border border-slate-200 px-2 outline-none bg-white"
                      >
                        <option value="Staff">Staff</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {modalMode === 'reset-pass' && (
                <div className="space-y-2 py-1">
                  <div className="text-slate-600">ĐẶT LẠI MẬT KHẨU CHO: <span className="font-bold text-slate-900">{selectedItem?.name}</span></div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700">Mật khẩu mới tự động:</label>
                    <input
                      type="text"
                      defaultValue="EventHub@2026"
                      className="w-full h-8.5 rounded-lg border border-slate-200 px-3 font-mono text-slate-700 bg-slate-50"
                      readOnly
                    />
                  </div>
                </div>
              )}

              {modalMode === 'edit-keyword' && (
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Danh sách từ khóa (cách nhau bởi dấu phẩy):</label>
                  <textarea
                    rows={4}
                    value={formData.keywords || ''}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 p-2.5 outline-none font-mono text-[11px] leading-relaxed focus:border-blue-500"
                  />
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button onClick={handleCloseModal} className="h-8.5 px-3.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer">
                  Hủy
                </button>
                <button 
                  onClick={modalMode === 'reset-pass' ? handleCloseModal : handleSaveData} 
                  className={`h-8.5 px-4 rounded-lg text-white font-semibold cursor-pointer shadow-xs ${
                    modalMode?.includes('delete') ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {modalMode === 'reset-pass' ? 'Xác nhận' : modalMode?.includes('delete') ? 'Xóa vĩnh viễn' : 'Lưu thay đổi'}
                </button>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
