import { Injectable } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';

@Injectable()
export class CrawlerHttpClient {
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  ];

  async fetchHtml(url: string): Promise<{ url: string; html: string } | null> {
    if (!url || !url.startsWith('http')) return null;

    const urlsToTry = [url];
    if (!url.endsWith('/') && !url.includes('?') && !url.endsWith('.xml') && !url.endsWith('.html') && !url.endsWith('.rss')) {
      urlsToTry.push(`${url}/`);
    }

    for (const attemptUrl of urlsToTry) {
      for (let retry = 0; retry < 2; retry += 1) {
        try {
          let refererHeader = 'https://www.google.com/';
          try {
            const u = new URL(attemptUrl);
            refererHeader = `${u.origin}/`;
          } catch {}

          const isFeed = attemptUrl.includes('feed') || attemptUrl.endsWith('.xml') || attemptUrl.endsWith('.rss');
          const randomUa = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];

          const reqHeaders: Record<string, string> = {
            'user-agent': randomUa,
            accept: isFeed
              ? 'application/rss+xml, application/xml, text/xml, */*'
              : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            referer: refererHeader,
            'cache-control': 'no-cache',
            pragma: 'no-cache',
          };
          if (!isFeed) {
            reqHeaders['sec-ch-ua'] = '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"';
            reqHeaders['sec-ch-ua-mobile'] = '?0';
            reqHeaders['sec-ch-ua-platform'] = '"Windows"';
            reqHeaders['sec-fetch-dest'] = 'document';
            reqHeaders['sec-fetch-mode'] = 'navigate';
            reqHeaders['sec-fetch-site'] = 'none';
            reqHeaders['sec-fetch-user'] = '?1';
            reqHeaders['upgrade-insecure-requests'] = '1';
          }

          const resp = await fetch(attemptUrl, {
            headers: reqHeaders,
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
          });

          if (!resp.ok) {
            try {
              await resp.body?.cancel();
            } catch {}
            if (resp.status === 403 || resp.status === 429) {
              console.warn(`[CrawlerHttpClient] ${resp.status} on ${attemptUrl} (Rate limited/Protected). Skipping.`);
              return null;
            }
            continue;
          }
          const html = await resp.text();
          if (
            html.includes('Sorry, you have been blocked') ||
            html.includes('Cloudflare Ray ID') ||
            html.includes('Attention Required! | Cloudflare') ||
            html.includes('Just a moment...') ||
            (html.includes('BytePlus') && html.includes('Security Check'))
          ) {
            console.warn(`[CrawlerHttpClient] Target ${attemptUrl} triggered WAF/Cloudflare. Skipping gracefully.`);
            return null;
          }
          return { url: resp.url || attemptUrl, html };
        } catch {
          if (retry === 1) break;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }

    return null;
  }

  async postAjax(url: string, body: string, referer?: string, headers?: Record<string, string>): Promise<string | null> {
    return new Promise((resolve) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
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
        request.destroy();
        resolve(null);
      });
      request.on('error', () => resolve(null));
      request.write(body);
      request.end();
    });
  }
}
