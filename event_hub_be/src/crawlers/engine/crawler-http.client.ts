import { Injectable, Logger } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import {
  assertPublicHttpUrl,
  HostResolver,
  UnsafeUrlError,
} from '../helpers/url-guard.helper.js';

const MAX_REDIRECTS = 5;

export type FetchPageResult =
  | { kind: 'ok'; url: string; html: string }
  | { kind: 'blocked'; url: string; reason: string }
  | { kind: 'failed'; url: string; reason: string };

export type FetchBinaryResult =
  | { kind: 'ok'; url: string; contentType: string; body: Buffer }
  | { kind: 'blocked' | 'failed'; url: string; reason: string };

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
  /** Số request theo host, để đo đúng từng nguồn khi nhiều nguồn chạy song song. */
  private readonly hostRequests = new Map<string, number>();
  /** Hàng đợi theo host: request tới cùng host chạy lần lượt, cách nhau ít nhất N ms. */
  private readonly hostQueues = new Map<string, Promise<void>>();
  private readonly hostIntervals = new Map<string, number>();
  /** Khoảng cách mặc định giữa hai request tới cùng một host. */
  defaultHostIntervalMs = 500;
  /** Phân giải DNS; thay được trong test. */
  resolveHost?: HostResolver;

  /** Đặt khoảng cách tối thiểu cho một host (vd. Crawl-delay của robots.txt). */
  setHostInterval(host: string, ms: number): void {
    this.hostIntervals.set(CrawlerHttpClient.hostKey(host), Math.max(0, ms));
  }

  /** Tổng số request đã gửi tới các host này từ khi khởi động. */
  requestCountFor(hosts: string[]): number {
    return [...new Set(hosts.map(CrawlerHttpClient.hostKey))].reduce(
      (sum, h) => sum + (this.hostRequests.get(h) ?? 0),
      0,
    );
  }

  static hostKey(hostOrUrl: string): string {
    let host = hostOrUrl;
    try {
      if (/^https?:\/\//i.test(hostOrUrl)) host = new URL(hostOrUrl).hostname;
    } catch {
      // không phải URL: dùng nguyên chuỗi làm host
      host = hostOrUrl;
    }
    return host.toLowerCase().replace(/^www\./, '');
  }

  /**
   * Chờ đến lượt gửi request tới host của url. Mọi request (trang, AJAX, API, trang chi tiết)
   * đều đi qua đây, nên giới hạn vẫn đúng khi nhiều nguồn chạy song song.
   */
  async waitForSlot(url: string): Promise<void> {
    const host = CrawlerHttpClient.hostKey(url);
    const interval = this.hostIntervals.get(host) ?? this.defaultHostIntervalMs;
    const prev = this.hostQueues.get(host) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    this.hostQueues.set(
      host,
      prev.then(() => mine),
    );
    await prev;
    this.requests += 1;
    this.hostRequests.set(host, (this.hostRequests.get(host) ?? 0) + 1);
    // Giữ hàng đợi thêm interval ms rồi mới cho request kế tiếp tới cùng host.
    setTimeout(release, interval);
  }

  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  ];

  /** Tổng số request đã gửi từ khi khởi động; lấy hiệu hai lần đọc để đo một lần crawl. */
  get requestCount(): number {
    return this.requests;
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
          const resp = await this.fetchFollowingSafeRedirects(attemptUrl);

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
          if (err instanceof UnsafeUrlError) {
            this.logger.warn(lastReason);
            return { kind: 'failed', url, reason: lastReason };
          }
          if (retry === 1) break;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }

    this.logger.warn(`Không tải được ${url}: ${lastReason}`);
    return { kind: 'failed', url, reason: lastReason };
  }

  /**
   * Tải file nhị phân (vd. ảnh) qua cùng hàng đợi giới hạn tốc độ và chống SSRF như trang HTML.
   * Dừng đọc khi vượt maxBytes. 401/403/429 trả blocked, không thử vượt qua.
   */
  async fetchBinary(
    url: string,
    maxBytes: number,
    accept = 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
  ): Promise<FetchBinaryResult> {
    if (!url || !/^https?:\/\//i.test(url))
      return { kind: 'failed', url, reason: 'URL không phải http(s)' };
    let resp: Response;
    try {
      resp = await this.fetchFollowingSafeRedirects(url, (u) => ({
        'user-agent': this.userAgents[0],
        accept,
        referer: `${new URL(u).origin}/`,
      }));
    } catch (err) {
      return {
        kind: 'failed',
        url,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    const cancel = () =>
      resp.body
        ?.cancel()
        .catch((err: unknown) =>
          this.logger.debug(`cancel body: ${String(err)}`),
        );
    if (!resp.ok) {
      await cancel();
      const blocked = [401, 403, 429].includes(resp.status);
      return {
        kind: blocked ? 'blocked' : 'failed',
        url,
        reason: `HTTP ${resp.status}`,
      };
    }
    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    const declared = Number(resp.headers.get('content-length') || 0);
    if (declared > maxBytes) {
      await cancel();
      return { kind: 'failed', url, reason: `File quá lớn (${declared} byte)` };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      const reader = resp.body?.getReader();
      if (!reader) return { kind: 'failed', url, reason: 'Không có nội dung' };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return {
            kind: 'failed',
            url,
            reason: `File quá lớn (> ${maxBytes} byte)`,
          };
        }
        chunks.push(value);
      }
    } catch (err) {
      return {
        kind: 'failed',
        url,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    return { kind: 'ok', url, contentType, body: Buffer.concat(chunks) };
  }

  /** Kiểm tra URL an toàn (chống SSRF); dùng cho request gửi ngoài client này, vd. GraphQL. */
  async assertSafeUrl(url: string): Promise<URL> {
    return assertPublicHttpUrl(url, this.resolveHost);
  }

  /** fetch tự xử lý chuyển hướng, kiểm tra lại URL an toàn ở mỗi bước. */
  private async fetchFollowingSafeRedirects(
    startUrl: string,
    headersFor: (url: string) => Record<string, string> = (u) =>
      this.buildHeaders(u),
  ): Promise<Response> {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertPublicHttpUrl(current, this.resolveHost);
      await this.waitForSlot(current);
      const resp = await fetch(current, {
        headers: headersFor(current),
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
      const location = resp.headers.get('location');
      if (resp.status >= 300 && resp.status < 400 && location) {
        await resp.body?.cancel().catch(() => undefined);
        current = new URL(location, current).toString();
        continue;
      }
      // Ghi lại URL cuối để engine resolve link tương đối đúng.
      Object.defineProperty(resp, 'url', { value: current });
      return resp;
    }
    throw new Error(`Quá ${MAX_REDIRECTS} lần chuyển hướng: ${startUrl}`);
  }

  async postAjax(
    url: string,
    body: string,
    referer?: string,
    headers?: Record<string, string>,
  ): Promise<string | null> {
    try {
      await assertPublicHttpUrl(url, this.resolveHost);
    } catch (err) {
      this.logger.warn((err as Error).message);
      return null;
    }
    await this.waitForSlot(url);
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
