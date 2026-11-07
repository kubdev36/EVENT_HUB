import { ParsedCrawlItem } from '../crawler.types.js';

/** time = null nghĩa là nguồn chỉ cho ngày, không cho giờ. */
export type ParsedDate = { date: Date; time: string | null };

const VN_OFFSET_HOURS = 7; // Asia/Ho_Chi_Minh, không có giờ mùa hè
/** Giờ neo cho ngày không có giờ: 12:00 VN để ngày không bị lệch khi hiển thị ở múi giờ khác. */
const DATE_ONLY_ANCHOR_HOUR = 12;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_YEAR = 2020;
const MAX_YEAR = 2035;

/**
 * Trích ngày đăng từ chuỗi, URL hoặc item. Mọi ngày giờ không ghi múi giờ được hiểu là
 * giờ Việt Nam, không phụ thuộc múi giờ của server.
 */
export class DateExtractorHelper {
  static parsePublishedDate(
    text: string | null | undefined,
    referenceDate: Date = new Date(),
  ): ParsedDate | null {
    if (!text) return null;
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // 1. ISO / RFC 2822 / D/M/YYYY ở đầu chuỗi
    const structured = this.parseStructured(cleanText);
    if (structured) return structured;

    // 2. Thời gian tương đối (vd. "2 ngày trước", "hôm qua", "3 giờ trước")
    const lower = cleanText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd');

    // "hôm qua", "N ngày trước": chỉ biết ngày, không biết giờ.
    if (lower.includes('hom qua') || lower.includes('homqua')) {
      return this.vnDayOffset(referenceDate, -1);
    }
    if (lower.includes('hom kia') || lower.includes('homkia')) {
      return this.vnDayOffset(referenceDate, -2);
    }
    if (lower.includes('vua xong') || lower.includes('vua dang')) {
      return {
        date: new Date(referenceDate),
        time: this.formatVnTime(referenceDate),
      };
    }

    const relMatch = lower.match(/(\d+)\s*(gio|ngay|phut|tuan|thang)\s*truoc/i);
    if (relMatch) {
      const amount = parseInt(relMatch[1], 10);
      const unit = relMatch[2];
      if (unit.includes('phut') || unit.includes('gio')) {
        const ms = amount * (unit.includes('phut') ? 60_000 : HOUR_MS);
        const d = new Date(referenceDate.getTime() - ms);
        return { date: d, time: this.formatVnTime(d) };
      }
      if (unit.includes('ngay'))
        return this.vnDayOffset(referenceDate, -amount);
      if (unit.includes('tuan'))
        return this.vnDayOffset(referenceDate, -amount * 7);
      const ref = this.vnParts(referenceDate);
      return this.dateOnly(ref.year, ref.month - amount, ref.day);
    }

    // 3. WordPress dịch tháng (vd. "Tháng 9 29, 2026")
    const wpMonthMatch = cleanText.match(
      /tháng\s*([1-9]|1[0-2])\s*(?:ngày\s*)?(\d{1,2}),?\s+(\d{4})/i,
    );
    if (wpMonthMatch) {
      const [, monthStr, dayStr, yearStr] = wpMonthMatch;
      const result = this.validDateOnly(+yearStr, +monthStr, +dayStr);
      if (result) return result;
    }

    // 4. "DD Tháng MM, YYYY"
    const dayMonthYearMatch = cleanText.match(
      /(\d{1,2})\s+tháng\s*([1-9]|1[0-2]),?\s+(?:năm\s+)?(\d{4})/i,
    );
    if (dayMonthYearMatch) {
      const [, dayStr, monthStr, yearStr] = dayMonthYearMatch;
      const result = this.validDateOnly(+yearStr, +monthStr, +dayStr);
      if (result) return result;
    }

    // 5. "ngày DD tháng MM (năm YYYY)"
    const vnTextDateMatch = cleanText.match(
      /(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/i,
    );
    if (vnTextDateMatch) {
      const [, dayStr, monthStr, yearStr] = vnTextDateMatch;
      const day = parseInt(dayStr, 10);
      const month = parseInt(monthStr, 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const year = yearStr
          ? parseInt(yearStr, 10)
          : this.vnParts(referenceDate).year;
        return this.dateOnly(year, month, day);
      }
    }

    // 6. DD/MM/YYYY hoặc DD-MM-YYYY ở giữa chuỗi
    const dmyMatch = cleanText.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (dmyMatch) {
      const [, dStr, mStr, yStr] = dmyMatch;
      const result = this.validDateOnly(+yStr, +mStr, +dStr);
      if (result) return result;
    }

    return null;
  }

  /** Định dạng HH:mm theo giờ Việt Nam. */
  static formatVnTime(d: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }

  /** Dựng Date từ giờ Việt Nam, không phụ thuộc múi giờ server. month bắt đầu từ 1. */
  static vnDate(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
  ): Date {
    return new Date(
      Date.UTC(year, month - 1, day, hour - VN_OFFSET_HOURS, minute, second),
    );
  }

  /** Ngày theo lịch Việt Nam, neo 12:00 VN; time = null vì nguồn không cho giờ. */
  static dateOnly(year: number, month: number, day: number): ParsedDate {
    return {
      date: this.vnDate(year, month, day, DATE_ONLY_ANCHOR_HOUR),
      time: null,
    };
  }

  /** Năm, tháng (từ 1), ngày theo lịch Việt Nam của một thời điểm. */
  static vnParts(d: Date): { year: number; month: number; day: number } {
    const shifted = new Date(d.getTime() + VN_OFFSET_HOURS * HOUR_MS);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    };
  }

  static parseDateFromUrl(url: string | null | undefined): ParsedDate | null {
    if (!url) return null;

    // 1. TikTok video ID: 32 bit đầu là UNIX epoch (giây)
    const tiktokMatch =
      url.match(/tiktok\.com\/@[^/]+\/video\/(\d{15,22})/i) ||
      url.match(/\/video\/(\d{15,22})/i);
    if (tiktokMatch) {
      const timestampSec = Number(BigInt(tiktokMatch[1]) >> 32n);
      if (timestampSec >= 1500000000 && timestampSec <= 2500000000) {
        const videoDate = new Date(timestampSec * 1000);
        return { date: videoDate, time: this.formatVnTime(videoDate) };
      }
    }

    // 2. /2026/09/29/ hoặc /2026-09-29/
    const ymdMatch = url.match(
      /\/(202[0-9])[/\-_](0?[1-9]|1[0-2])[/\-_](0?[1-9]|[12][0-9]|3[01])(?:\/|_|-|\.|$)/,
    );
    if (ymdMatch) {
      const result = this.validDateOnly(
        +ymdMatch[1],
        +ymdMatch[2],
        +ymdMatch[3],
      );
      if (result) return result;
    }

    // 3. /29-09-2026/ hoặc /29/09/2026/
    const dmyMatch = url.match(
      /(?:-|\/|_)(0?[1-9]|[12][0-9]|3[01])[/\-_](0?[1-9]|1[0-2])[/\-_](202[0-9])(?:\/|_|-|\.|$)/,
    );
    if (dmyMatch) {
      const result = this.validDateOnly(
        +dmyMatch[3],
        +dmyMatch[2],
        +dmyMatch[1],
      );
      if (result) return result;
    }

    return null;
  }

  static parseItemEventDate(
    item: ParsedCrawlItem,
    referenceDate: Date = new Date(),
  ): { date: Date | null; time: string | null; isExplicit: boolean } {
    if (item.eventDate && !isNaN(item.eventDate.getTime())) {
      return {
        date: item.eventDate,
        time: item.eventTime ?? null,
        isExplicit: true,
      };
    }

    // 1. Ngày trong mô tả hoặc tiêu đề. Ngày trong tương lai thường là hạn khuyến mãi
    //    ("ưu đãi đến 31/12"), không phải ngày đăng, nên bỏ qua.
    const notFuture = (d: ParsedDate | null) =>
      d && d.date.getTime() <= referenceDate.getTime() + DAY_MS ? d : null;
    const descDate =
      notFuture(this.parsePublishedDate(item.description, referenceDate)) ||
      notFuture(this.parsePublishedDate(item.title, referenceDate));
    if (descDate) return { ...descDate, isExplicit: true };

    // 2. Ngày trong đường dẫn URL
    const urlDate = this.parseDateFromUrl(item.url);
    if (urlDate) return { ...urlDate, isExplicit: true };

    // Không tìm được ngày: không dùng ngày/giờ crawl thay thế.
    return { date: null, time: null, isExplicit: false };
  }

  private static parseStructured(text: string): ParsedDate | null {
    // ISO: 2026-09-29, 2026-09-29T15:30, 2026-09-29 15:30:00, có hoặc không có múi giờ
    const iso = text.match(
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?/i,
    );
    if (iso) {
      const [, y, mo, d, h, mi, s, zone] = iso;
      if (h === undefined) return this.validDateOnly(+y, +mo, +d);
      const date = zone
        ? new Date(text.slice(0, iso[0].length))
        : this.vnDate(+y, +mo, +d, +h, +mi, s ? +s : 0);
      return this.validInstant(date);
    }

    // Kiểu Việt Nam: 01/10/2026 hoặc 01/10/2026 08:30 (ngày/tháng/năm, không phải tháng/ngày)
    const dmy = text.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/,
    );
    if (dmy) {
      const [, d, mo, y, h, mi] = dmy;
      if (h === undefined) return this.validDateOnly(+y, +mo, +d);
      return this.validInstant(this.vnDate(+y, +mo, +d, +h, +mi));
    }

    // RFC 2822 (RSS pubDate): "Thu, 01 Oct 2026 07:15:28 +0000"
    if (
      /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i.test(
        text,
      )
    ) {
      const direct = new Date(text);
      if (Number.isNaN(direct.getTime())) return null;
      if (!/\d{1,2}:\d{2}/.test(text)) {
        // Chỉ có ngày: Date đã parse theo giờ local, lấy lại thành phần ngày.
        return this.validDateOnly(
          direct.getFullYear(),
          direct.getMonth() + 1,
          direct.getDate(),
        );
      }
      const hasZone = /(?:[+-]\d{4}|GMT|UTC|Z)\s*$/i.test(text);
      if (!hasZone) {
        return this.validInstant(
          this.vnDate(
            direct.getFullYear(),
            direct.getMonth() + 1,
            direct.getDate(),
            direct.getHours(),
            direct.getMinutes(),
            direct.getSeconds(),
          ),
        );
      }
      return this.validInstant(direct);
    }

    return null;
  }

  private static validInstant(date: Date): ParsedDate | null {
    if (Number.isNaN(date.getTime())) return null;
    const { year } = this.vnParts(date);
    if (year < MIN_YEAR || year > MAX_YEAR) return null;
    return { date, time: this.formatVnTime(date) };
  }

  private static validDateOnly(
    year: number,
    month: number,
    day: number,
  ): ParsedDate | null {
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      year < MIN_YEAR ||
      year > MAX_YEAR
    )
      return null;
    const result = this.dateOnly(year, month, day);
    // Loại ngày không tồn tại, vd. 31/02
    const parts = this.vnParts(result.date);
    if (parts.month !== month || parts.day !== day) return null;
    return result;
  }

  private static vnDayOffset(referenceDate: Date, days: number): ParsedDate {
    const ref = this.vnParts(new Date(referenceDate.getTime() + days * DAY_MS));
    return this.dateOnly(ref.year, ref.month, ref.day);
  }
}
