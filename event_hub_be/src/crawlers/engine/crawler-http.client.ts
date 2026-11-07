import { Injectable, Logger } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';

export type FetchPageResult =
  | { kind: 'ok'; url: string; html: string }
  | { kind: 'blocked'; url: string; reason: string }
  | { kind: 'failed'; url: string; reason: string };

/** Lỗi tải trang chính của một URL nguồn. kind cho biết bị chặn hay lỗi khác. */
export class CrawlFetchError extends Error {
  constructor(
    readonly kind: 'blocked' | 'failed',
    readonly url: string,
    reason: string,
  ) {
    super(`${kind === 'blocked' ? 'Blocked' : 'Failed'}: ${url} (${reason})`);
    this.name = 'CrawlFetchError';
  }
}

const BLOCK_MARKERS = [
  'Sorry, you have been blocked',
  'Cloudflare Ray ID',
  'Attention Required! | Cloudflare',
  'Just a moment...',
];

@Injectable()
export class CrawlerHttpClient {
  private readonly logger = new Logger(CrawlerHttpClient.name);
  private requests = 0;

  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  ];

  /** Tổng số request đã gửi từ khi khởi động; lấy hiệu hai lần đọc để đo một lần crawl. */
  get requestCount(): number {
    return this.requests;
  }

  /** Ghi nhận một request gửi bằng fetch trực tiếp ngoài client này (vd. GraphQL). */
  countRequest(): void {
    this.requests += 1;
  }

  /** Trả null khi không lấy được trang; dùng cho việc phụ như lấy ảnh. */
  async fetchHtml(url: string): Promise<{ url: string; html: string } | null> {
    const result = await this.fetchPage(url);
    return result.kind === 'ok' ? { url: result.url, html: result.html } : null;
  }

  /** Như fetchPage nhưng ném CrawlFetchError khi bị chặn hoặc lỗi; dùng cho trang chính của nguồn. */
  async requirePage(url: string): Promise<{ url: string; html: string }> {
    const result = await this.fetchPage(url);
    if (result.kind !== 'ok')
      throw new CrawlFetchError(result.kind, url, result.reason);
    return { url: result.url, html: result.html };
  }

  async fetchPage(url: string): Promise<FetchPageResult> {
    if (!url || !/^https?:\/\//i.test(url))
      return { kind: 'failed', url, reason: 'URL không phải http(s)' };

    const urlsToTry = [url];
    if (
      !url.endsWith('/') &&
      !url.includes('?') &&
      !url.endsWith('.xml') &&
      !url.endsWith('.html') &&
      !url.endsWith('.rss')
    ) {
      urlsToTry.push(`${url}/`);
    }

    let lastReason = 'unknown';
    for (const attemptUrl of urlsToTry) {
      for (let retry = 0; retry < 2; retry += 1) {
        try {
          this.requests += 1;
          const resp = await fetch(attemptUrl, {
            headers: this.buildHeaders(attemptUrl),
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
          });

          if (!resp.ok) {
            await resp.body
              ?.cancel()
              .catch((err: unknown) =>
                this.logger.debug(`cancel body: ${String(err)}`),
              );
            if (resp.status === 403 || resp.status === 429) {
              this.logger.warn(
                `${resp.status} on ${attemptUrl}: bị chặn hoặc giới hạn tốc độ, dừng URL này.`,
              );
              return {
                kind: 'blocked',
                url: attemptUrl,
                reason: `HTTP ${resp.status}`,
              };
            }
            lastReason = `HTTP ${resp.status}`;
            continue;
          }

          const html = await resp.text();
          if (
            BLOCK_MARKERS.some((m) => html.includes(m)) ||
            (html.includes('BytePlus') && html.includes('Security Check'))
          ) {
            this.logger.warn(
              `${attemptUrl} trả về trang chặn (WAF/Cloudflare), không vượt qua.`,
            );
            return {
              kind: 'blocked',
              url: attemptUrl,
              reason: 'WAF challenge page',
            };
          }
          return { kind: 'ok', url: resp.url || attemptUrl, html };
        } catch (err) {
          lastReason = err instanceof Error ? err.message : String(err);
          if (retry === 1) break;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }

    this.logger.warn(`Không tải được ${url}: ${lastReason}`);
    return { kind: 'failed', url, reason: lastReason };
  }

  async postAjax(
    url: string,
    body: string,
    referer?: string,
    headers?: Record<string, string>,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        this.logger.warn(`AJAX endpoint không hợp lệ: ${url}`);
        return resolve(null);
      }

      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;

      const reqHeaders: Record<string, string | number> = {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        'user-agent': this.userAgents[0],
        origin: parsed.origin,
        referer: referer || parsed.origin,
        'content-length': Buffer.byteLength(body),
        ...headers,
      };

      this.requests += 1;
      const request = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: reqHeaders,
        },
        (response) => {
          if (response.statusCode && response.statusCode >= 400) {
            this.logger.warn(`AJAX ${url} trả về HTTP ${response.statusCode}`);
            response.resume();
            return resolve(null);
          }
          let data = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            data += chunk;
          });
          response.on('end', () => resolve(data));
        },
      );

      request.setTimeout(15000, () => {
        this.logger.warn(`AJAX ${url} quá thời gian chờ`);
        request.destroy();
        resolve(null);
      });
      request.on('error', (err) => {
        this.logger.warn(`AJAX ${url} lỗi: ${err.message}`);
        resolve(null);
      });
      request.write(body);
      request.end();
    });
  }

  private buildHeaders(attemptUrl: string): Record<string, string> {
    let referer = 'https://www.google.com/';
    try {
      referer = `${new URL(attemptUrl).origin}/`;
    } catch {
      // URL đã được kiểm tra là http(s) ở trên; giữ referer mặc định nếu vẫn không parse được.
      referer = 'https://www.google.com/';
    }

    const isFeed =
      attemptUrl.includes('feed') ||
      attemptUrl.endsWith('.xml') ||
      attemptUrl.endsWith('.rss');
    const randomUa =
      this.userAgents[Math.floor(Math.random() * this.userAgents.length)];

    const headers: Record<string, string> = {
      'user-agent': randomUa,
      accept: isFeed
        ? 'application/rss+xml, application/xml, text/xml, */*'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      referer,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    };
    if (!isFeed) {
      headers['sec-ch-ua'] =
        '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"';
      headers['sec-ch-ua-mobile'] = '?0';
      headers['sec-ch-ua-platform'] = '"Windows"';
      headers['sec-fetch-dest'] = 'document';
      headers['sec-fetch-mode'] = 'navigate';
      headers['sec-fetch-site'] = 'none';
      headers['sec-fetch-user'] = '?1';
      headers['upgrade-insecure-requests'] = '1';
    }
    return headers;
  }
}
