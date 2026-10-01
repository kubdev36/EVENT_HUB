export class NoiseFilterHelper {
  private static readonly NOISE_TITLES_NORMALIZED = new Set([
    'chua duoc phan loai',
    'uncategorized',
    'trang chu',
    'tin tuc cong nghe',
    'danh gia',
    'khuyen mai',
    'tin tuc',
    'laptop pc',
    'laptop & pc',
    'dmca logo',
    'logo sforum',
    'chinh sach bao mat',
    'thoa thuan cung cap',
    'cau hoi thuong gap',
    'huong dan mua hang',
    'quy dinh ve ho tro',
    'quy che hoat dong',
    'gioi thieu cong ty',
    'tra cuu hoa don',
    'he thong cua hang',
  ]);

  static cleanTitle(rawTitle: string): string {
    if (!rawTitle) return '';
    let title = rawTitle.replace(/\s+/g, ' ').trim();

    // Decode HTML numeric & named entities
    title = title
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'");

    // Remove author + Date / relative time at end
    title = title.replace(/\s+[\p{L}\s.]{2,30}\s+(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|\d+\s*(?:giờ|ngày|phút|tuần)\s*(?:trước|sau))$/iu, '');
    title = title.replace(/\s+(?:\d+\s*(?:giờ|ngày|phút|tuần)\s*(?:trước|sau)|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)$/iu, '');

    // Remove brand suffixes (e.g. " - Fptshop.com.vn", " | CellphoneS")
    title = title.replace(/\s*[-|]\s*[A-Za-z0-9.-]+(?:\.com|\.vn|\.com\.vn)?\s*$/i, '');

    return title.trim();
  }

  static cleanDescription(rawDesc?: string | null): string | null {
    if (!rawDesc) return null;
    let desc = rawDesc
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/&lt;!\[CDATA\[([\s\S]*?)\]\]&gt;/gi, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return desc.length > 0 ? desc : null;
  }

  static isNoiseTitle(title: string | null | undefined): boolean {
    if (!title) return true;
    const clean = title.trim();
    if (clean.length < 8) return true;

    const lower = clean.toLowerCase();
    if (
      lower.includes('<script') ||
      lower.includes('class=') ||
      lower.includes('href=') ||
      lower.includes('style=') ||
      lower === 'description' ||
      lower === 'tin tức' ||
      lower === 'tin tuc'
    ) {
      return true;
    }

    const normalized = lower
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (this.NOISE_TITLES_NORMALIZED.has(normalized)) return true;

    return false;
  }

  static isNoiseImage(url: string | null | undefined): boolean {
    if (!url) return true;
    const lower = url.toLowerCase();
    const noisePatterns = [
      'icon',
      'logo',
      'avatar',
      'banner_default',
      'placeholder',
      'blank.gif',
      'spinner',
      '1x1',
      'loading',
      'dmca',
    ];
    return noisePatterns.some((pattern) => lower.includes(pattern));
  }
}
