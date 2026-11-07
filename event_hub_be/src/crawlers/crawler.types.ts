export type KeywordRule = {
  type: string;
  label?: string;
  keywords: string;
};

export type CrawlSource = {
  id: string;
  name: string;
  type?: 'web' | 'facebook';
  logo?: string | null;
  enabled?: boolean;
  interval?: string;
  targetUrls: string[];
  ajaxEndpoint?: string;
  ajaxPayload?: string;
  paginationType?: string;
  /** Cấu hình trích xuất HTML riêng của nguồn. Không có thì dùng cách nhận dạng chung. */
  extract?: ExtractConfig;
  /** Nguồn lấy qua API riêng (vd. Sforum GraphQL). */
  api?: ApiSourceConfig;
};

/**
 * Cấu hình trích xuất cho một web, lưu trong cài đặt nguồn (không hardcode trong code).
 * Có itemSelector: mỗi khối là một bài. Không có: lấy mọi link khớp articleUrlPattern.
 */
export type ExtractConfig = {
  itemSelector?: string;
  titleSelector?: string;
  linkSelector?: string;
  /** Phần tử chứa ngày đăng trong khối bài (vd. "5 ngày trước", "06/11/2026"). */
  dateSelector?: string;
  /** Thứ tự thuộc tính ảnh ưu tiên, mặc định data-original, data-src, data-lazy-src, src. */
  imageAttrs?: string[];
  /** Regex áp lên pathname của link; chỉ link khớp mới được coi là bài viết. */
  articleUrlPattern?: string;
  /** Tải trang chi tiết của bài mới để lấy ngày đăng, ảnh (crawl hai bước). */
  fetchDetail?: boolean;
  /** Số trang chi tiết tối đa mỗi lần cào, mặc định 10. */
  maxDetailPerRun?: number;
  /** Nghỉ giữa các request trang chi tiết (ms), mặc định 2000. */
  detailDelayMs?: number;
};

export type ApiSourceConfig = {
  type: 'sforum-graphql';
  endpoint: string;
  categoryIds: number[];
  /** URL bài = articleBaseUrl + slug. */
  articleBaseUrl: string;
  referer?: string;
  /** Số trang mỗi chuyên mục, mặc định 3. */
  maxPages?: number;
};

export type CrawlTarget = CrawlSource & {
  sourceName?: string;
};

export type ParsedCrawlItem = {
  title: string;
  description?: string | null;
  image?: string | null;
  url: string;
  /** ID ổn định phía nguồn (vd. adArchiveID) để dedupe khi nhiều item chung URL. */
  externalId?: string | null;
  eventDate?: Date | null;
  eventTime?: string | null;
  score?: number;
  rawData?: Record<string, unknown> | null;
};
