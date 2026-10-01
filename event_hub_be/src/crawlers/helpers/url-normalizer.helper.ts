import { createHash } from 'crypto';

export class UrlNormalizerHelper {
  static normalizeUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl);
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'spm', 'ref', 'from'];
      trackingParams.forEach((param) => parsed.searchParams.delete(param));

      let clean = `${parsed.origin}${parsed.pathname}`;
      if (clean.endsWith('/') && clean.length > 8) {
        clean = clean.slice(0, -1);
      }
      if (parsed.search) {
        clean += parsed.search;
      }
      return clean.toLowerCase();
    } catch {
      return (rawUrl || '').trim().toLowerCase().replace(/\/$/, '');
    }
  }

  static buildContentHash(sourceId: string, url: string, title: string): string {
    const cleanUrl = this.normalizeUrl(url);
    const cleanTitle = this.normalizeText(title);
    return createHash('sha256').update(`${sourceId}|${cleanUrl}|${cleanTitle}`).digest('hex');
  }

  static normalizeText(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9:/.\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static resolveUrl(baseUrl: string, targetUrl: string): string {
    if (!targetUrl) return '';
    let resolved = targetUrl.trim();

    if (resolved.includes('_next/image?url=')) {
      try {
        const urlParam = new URL(resolved.startsWith('http') ? resolved : `https://dummy.com${resolved}`).searchParams.get('url');
        if (urlParam) resolved = decodeURIComponent(urlParam);
      } catch {}
    }

    try {
      return new URL(resolved, baseUrl).toString();
    } catch {
      return resolved;
    }
  }

  static isLikelyEventUrl(url: string): boolean {
    if (!url || !url.startsWith('http')) return false;
    const lower = url.toLowerCase();
    const blacklist = [
      '/gioi-thieu',
      '/lien-he',
      '/chinh-sach',
      '/quy-dinh',
      '/dieu-khoan',
      '/tuyen-dung',
      '/he-thong-cua-hang',
      '/tra-cuu',
      '/gio-hang',
      '/tai-khoan',
      '/cart',
      '/account',
      '/login',
      '/register',
    ];
    return !blacklist.some((item) => lower.includes(item));
  }
}
