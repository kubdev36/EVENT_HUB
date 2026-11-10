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
  /** Khoảng cách tối thiểu (ms) giữa hai request tới domain của nguồn, vd. 5000 theo Crawl-delay. */
  minRequestIntervalMs?: number;
  /**
   * Lưu ảnh thu nhỏ của bài về máy chủ. Mặc định true với nguồn web, false với nguồn facebook
   * (chưa xem xong điều khoản của Meta).
   */
  storeImages?: boolean;
  /** Sitemap để phát hiện trang mới (vd. landing page khuyến mãi). */
  sitemaps?: SitemapConfig[];
};

/**
 * Theo dõi một sitemap của nguồn: chỉ link mới xuất hiện (so với các lần trước) mới được mở.
 * Lần đầu chỉ ghi lại link có sẵn, không tạo sự kiện. lastmod không dùng làm ngày đăng.
 */
export type SitemapConfig = {
  /** Link sitemap (urlset) hoặc sitemap index. */
  url: string;
  /** Regex (không phân biệt hoa thường) áp lên pathname; chỉ link khớp mới được xét. */
  includePattern: string;
  /** Regex áp lên pathname; khớp thì bỏ (vd. tra-gop|chinh-sach). */
  excludePattern?: string;
  /** Với sitemap index: regex áp lên link file con, chỉ mở file khớp. */
  childPattern?: string;
  /** Số trang mới mở chi tiết mỗi lần, mặc định 10. */
  maxNewPerRun?: number;
};

/**
 * Cấu hình trích xuất cho một web, lưu trong cài đặt nguồn (không hardcode trong code).
 * Có itemSelector: mỗi khối là một bài. Không có: lấy mọi link khớp articleUrlPattern.
 */
export type ExtractConfig = {
  itemSelector?: string;
  titleSelector?: string;
  /** Lấy tiêu đề từ thuộc tính này (vd. "title") của phần tử titleSelector, khi chữ bên trong bị cắt hoặc rỗng. */
  titleAttr?: string;
  linkSelector?: string;
  /** Phần tử chứa ngày đăng trong khối bài (vd. "5 ngày trước", "06/11/2026"). */
  dateSelector?: string;
  /** Thứ tự thuộc tính ảnh ưu tiên, mặc định data-original, data-src, data-lazy-src, src. */
  imageAttrs?: string[];
  /** Regex áp lên pathname của link; chỉ link khớp mới được coi là bài viết. */
  articleUrlPattern?: string;
  /** Regex (không phân biệt hoa thường) áp lên tiêu đề; khớp thì bỏ bài (trang giới thiệu, chính sách...). */
  excludeTitlePattern?: string;
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
  /** Engine đã tải trang chi tiết; bước crawl hai bước không tải lại. */
  detailFetched?: boolean;
};
