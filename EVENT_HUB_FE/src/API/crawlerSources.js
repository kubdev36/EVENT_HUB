import { settingsApi } from './API';

/**
 * Mã nguồn từ tên: bỏ dấu tiếng Việt (đ -> d), chữ thường, chỉ giữ a-z và 0-9.
 * "Di Động Việt" -> "didongviet". Chỉ dùng khi thêm nguồn mới; mã nguồn cũ không đổi.
 */
export function slugifySourceId(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Chỉ gửi các trường backend nhận; giữ cấu hình riêng của nguồn (extract, api...) để không bị xóa. */
export function cleanTarget(c) {
  return {
    id: c.id,
    name: c.name,
    logo: c.logo || null,
    enabled: c.enabled,
    interval: c.interval || '6h',
    targetUrls: c.targetUrls || [],
    ...(c.type ? { type: c.type } : {}),
    ...(c.extract ? { extract: c.extract } : {}),
    ...(c.api ? { api: c.api } : {}),
    ...(c.ajaxEndpoint ? { ajaxEndpoint: c.ajaxEndpoint } : {}),
    ...(c.ajaxPayload ? { ajaxPayload: c.ajaxPayload } : {}),
    ...(c.minRequestIntervalMs !== undefined ? { minRequestIntervalMs: c.minRequestIntervalMs } : {}),
    ...(typeof c.storeImages === 'boolean' ? { storeImages: c.storeImages } : {}),
    ...(Array.isArray(c.sitemaps) ? { sitemaps: c.sitemaps } : {}),
  };
}

export function saveCrawlerList(list) {
  return settingsApi.saveCrawlers({ targets: list.map(cleanTarget) });
}

/** Nguồn mới từ dữ liệu form. Ném lỗi nếu tên trống hoặc mã trùng nguồn đã có. */
export function buildNewCrawler(formData, existingIds) {
  const name = (formData.name || '').trim();
  if (!name) throw new Error('Nhập tên đối thủ.');
  const id = slugifySourceId(name);
  if (!id) throw new Error('Tên phải có ít nhất một chữ cái hoặc chữ số.');
  if (existingIds.includes(id))
    throw new Error(`Đã có nguồn với mã "${id}". Đổi tên khác hoặc sửa nguồn đã có trong Cài đặt.`);
  return {
    id,
    name,
    logo: formData.logo || '/img/mtm.png',
    enabled: true,
    interval: formData.interval || '6h',
    targetUrls: (formData.targetUrls || []).map((u) => u.trim()).filter(Boolean),
    ...(formData.extract ? { extract: formData.extract } : {}),
    ...(formData.api ? { api: formData.api } : {}),
  };
}

/**
 * Thêm nguồn: đọc danh sách mới nhất từ server (không ghi đè thay đổi người khác vừa lưu),
 * thêm nguồn mới rồi lưu. Trả danh sách sau khi lưu.
 */
export async function addCrawlerSource(formData) {
  const current = (await settingsApi.getCrawlerSources()).data;
  const added = buildNewCrawler(formData, current.map((c) => c.id));
  const updated = [...current, added];
  await saveCrawlerList(updated);
  return updated;
}
