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
