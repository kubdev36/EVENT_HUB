import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, settingsApi } from '../../../API/API';
import { addCrawlerSource, saveCrawlerList } from '../../../API/crawlerSources';
import CrawlerTab from '../tabs/CrawlerTab';
import CrawlProgress from '../CrawlProgress';
import CrawlerModal from '../modals/CrawlerModal';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal';
import { sourceProgress, summarizeProgress } from '../crawlProgressState';
import { ValidationError, useModalState } from './useModalState';

const RUN_STATUS = { success: 'thành công', partial: 'lỗi một phần', blocked: 'bị chặn', failed: 'lỗi', running: 'đang chạy' };
/** "07/11 10:45 · thành công" từ lần cào gần nhất của nguồn. */
function formatLastRun(run) {
  if (!run?.startedAt) return 'Chưa chạy';
  const when = new Date(run.startedAt).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
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

/** Tab "Cấu hình Crawler": danh sách nguồn, bật/tắt, thêm/sửa/xóa, cào ngay và bảng tiến độ. */
export default function CrawlerSection({ initialCrawlers, notify }) {
  const [crawlers, setCrawlers] = useState(initialCrawlers);
  const [crawlLoading, setCrawlLoading] = useState(false);
  /** id nguồn đang được xếp hàng bằng nút "Cào ngay" của thẻ. */
  const [runningId, setRunningId] = useState(null);
  // Lần bấm cào đang theo dõi: { since: { [sourceId]: thời điểm xếp hàng theo giờ server }, until }.
  const [crawlJob, setCrawlJob] = useState(null);
  const modal = useModalState();

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
      trackCrawl((await settingsApi.runCrawlerById(crawler.id)).data);
    } catch (err) {
      notify(err.response?.data?.message || `Xếp hàng cào ${crawler.name} thất bại.`);
    } finally {
      setRunningId(null);
    }
  };

  const runAll = async () => {
    setCrawlLoading(true);
    try {
      trackCrawl((await settingsApi.runAllCrawlers()).data);
    } catch (err) {
      notify(err.response?.data?.message || 'Cào tất cả thất bại.');
    } finally {
      setCrawlLoading(false);
    }
  };

  const saveList = async (updated) => {
    setCrawlers(updated);
    try {
      await saveCrawlerList(updated);
      notify('Đã lưu cấu hình Crawler thành công.');
    } catch (err) {
      notify(err.response?.data?.message || 'Lưu cấu hình Crawler thất bại.');
    }
  };

  const toggle = (id) => saveList(crawlers.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));

  const openEdit = (c) =>
    modal.open('edit', c, { ...c, targetUrls: c.targetUrls?.length ? [...c.targetUrls] : [''] });

  const save = () =>
    modal.run(async () => {
      if (modal.mode === 'add') {
        // Dùng chung với nút "Thêm đối thủ" ở thanh bên: đọc danh sách mới nhất, kiểm tra trùng mã rồi lưu.
        try {
          setCrawlers(await addCrawlerSource(modal.formData));
        } catch (err) {
          throw err.response ? err : new ValidationError(err.message);
        }
        notify('Đã thêm đối thủ.');
        return;
      }
      const form = { ...modal.formData };
      delete form.advancedError;
      const edited = {
        ...form,
        targetUrls: form.targetUrls?.filter((u) => u.trim() !== '') || [],
        // Ghi rõ để xóa trống ô JSON thì cấu hình cũ cũng bị xóa.
        extract: form.extract,
        api: form.api,
      };
      const updated = crawlers.map((c) => (c.id === modal.item.id ? { ...c, ...edited } : c));
      setCrawlers(updated);
      await saveCrawlerList(updated);
      notify('Đã lưu cấu hình Crawler thành công.');
    }, notify);

  const remove = () =>
    modal.run(async () => {
      const updated = crawlers.filter((c) => c.id !== modal.item.id);
      setCrawlers(updated);
      await saveCrawlerList(updated);
      notify(`Đã xóa đối thủ ${modal.item.name}.`);
    }, notify);

  return (
    <div className="space-y-4">
      {crawlJob && <CrawlProgress items={crawlItems} onClose={() => setCrawlJob(null)} />}

      <CrawlerTab
        crawlers={crawlers.map((c) => ({ ...c, lastRun: formatLastRun(runs.data?.find((r) => r.sourceId === c.id)) }))}
        crawlLoading={crawlLoading}
        onRunAll={runAll}
        onAddCrawler={() => modal.open('add', null, { name: '', logo: '', interval: '6h', targetUrls: [''] })}
        runningId={runningId}
        onRunCrawler={runCrawl}
        onEditCrawler={openEdit}
        onDeleteCrawler={(c) => modal.open('delete', c)}
        onToggleCrawler={toggle}
      />

      <CrawlerModal
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
        title="Xác nhận xóa đối thủ"
        itemName={modal.item?.name}
        onClose={modal.close}
        onConfirm={remove}
        saving={modal.saving}
      />
    </div>
  );
}
