import { ParsedCrawlItem } from '../crawler.types.js';

export class DateExtractorHelper {
  static parsePublishedDate(text: string | null | undefined, referenceDate: Date = new Date()): { date: Date; time: string } | null {
    if (!text) return null;
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // 1. Direct ISO / standard date parsing (e.g. "Thu, 01 Oct 2026 07:15:28 +0000", "2026-09-29T15:30:00Z")
    if (
      cleanText.length >= 10 &&
      (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(cleanText) ||
        /^\d{1,2}\/\d{1,2}\/\d{4}/.test(cleanText) ||
        /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i.test(cleanText) ||
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(cleanText))
    ) {
      const direct = new Date(cleanText);
      if (!Number.isNaN(direct.getTime()) && direct.getFullYear() >= 2020 && direct.getFullYear() <= 2035) {
        // Format time string in Vietnam time
        const timeStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(direct);
        return { date: direct, time: timeStr };
      }
    }

    // 2. Relative time in Vietnamese (e.g. "2 ngày trước", "hôm qua", "3 giờ trước")
    const lower = cleanText.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');

    if (lower.includes('hom qua') || lower.includes('homqua')) {
      const d = new Date(referenceDate);
      d.setDate(d.getDate() - 1);
      return { date: d, time: '09:00' };
    }

    if (lower.includes('hom kia') || lower.includes('homkia')) {
      const d = new Date(referenceDate);
      d.setDate(d.getDate() - 2);
      return { date: d, time: '09:00' };
    }

    if (lower.includes('vua xong') || lower.includes('vua dang')) {
      return { date: new Date(referenceDate), time: '09:00' };
    }

    const relMatch = lower.match(/(\d+)\s*(gio|ngay|phut|tuan|thang)\s*truoc/i);
    if (relMatch) {
      const amount = parseInt(relMatch[1], 10);
      const unit = relMatch[2];
      const d = new Date(referenceDate);
      if (unit.includes('phut')) d.setMinutes(d.getMinutes() - amount);
      else if (unit.includes('gio')) d.setHours(d.getHours() - amount);
      else if (unit.includes('ngay')) d.setDate(d.getDate() - amount);
      else if (unit.includes('tuan')) d.setDate(d.getDate() - amount * 7);
      else if (unit.includes('thang')) d.setMonth(d.getMonth() - amount);

      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return { date: d, time: timeStr };
    }

    // 3. WordPress translated month format (e.g. "Tháng 9 29, 2026", "Tháng 10 28, 2025")
    const wpMonthMatch = cleanText.match(/tháng\s*([1-9]|1[0-2])\s*(?:ngày\s*)?(\d{1,2}),?\s+(\d{4})/i);
    if (wpMonthMatch) {
      const [, monthStr, dayStr, yearStr] = wpMonthMatch;
      const m = parseInt(monthStr, 10);
      const d = parseInt(dayStr, 10);
      const y = parseInt(yearStr, 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2020 && y <= 2035) {
        return { date: new Date(y, m - 1, d, 9, 0), time: '09:00' };
      }
    }

    // 4. "DD Tháng MM, YYYY"
    const dayMonthYearMatch = cleanText.match(/(\d{1,2})\s+tháng\s*([1-9]|1[0-2]),?\s+(?:năm\s+)?(\d{4})/i);
    if (dayMonthYearMatch) {
      const [, dayStr, monthStr, yearStr] = dayMonthYearMatch;
      const d = parseInt(dayStr, 10);
      const m = parseInt(monthStr, 10);
      const y = parseInt(yearStr, 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2020 && y <= 2035) {
        return { date: new Date(y, m - 1, d, 9, 0), time: '09:00' };
      }
    }

    // 5. "ngày DD tháng MM (năm YYYY)"
    const vnTextDateMatch = cleanText.match(/(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/i);
    if (vnTextDateMatch) {
      const [, dayStr, monthStr, yearStr] = vnTextDateMatch;
      const day = parseInt(dayStr, 10);
      const month = parseInt(monthStr, 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const year = yearStr ? parseInt(yearStr, 10) : referenceDate.getFullYear();
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // 6. Check DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = cleanText.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
    if (dmyMatch) {
      const [, dStr, mStr, yStr] = dmyMatch;
      const day = parseInt(dStr, 10);
      const month = parseInt(mStr, 10);
      const year = parseInt(yStr, 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2035) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    return null;
  }

  static parseDateFromUrl(url: string | null | undefined): { date: Date; time: string } | null {
    if (!url) return null;
    
    // Check /2026/09/29/ or /2026-09-29/
    const ymdMatch = url.match(/\/(202[0-9])[\/\-_](0?[1-9]|1[0-2])[\/\-_](0?[1-9]|[12][0-9]|3[01])(?:\/|_|-|\.|$)/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10);
      const day = parseInt(ymdMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    // Check /29-09-2026/ or /29/09/2026/
    const dmyMatch = url.match(/(?:-|\/|_)(0?[1-9]|[12][0-9]|3[01])[\/\-_](0?[1-9]|1[0-2])[\/\-_](202[0-9])(?:\/|_|-|\.|$)/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10);
      const year = parseInt(dmyMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { date: new Date(year, month - 1, day, 9, 0), time: '09:00' };
      }
    }

    return null;
  }

  static parseItemEventDate(item: ParsedCrawlItem, referenceDate: Date = new Date()): { date: Date | null; time: string | null } {
    if (item.eventDate && !isNaN(item.eventDate.getTime())) {
      const timeStr = item.eventTime || `${String(item.eventDate.getHours()).padStart(2, '0')}:${String(item.eventDate.getMinutes()).padStart(2, '0')}`;
      return { date: item.eventDate, time: timeStr };
    }

    // 1. Search date inside description or title
    const descDate = this.parsePublishedDate(item.description, referenceDate) || this.parsePublishedDate(item.title, referenceDate);
    if (descDate) return descDate;

    // 2. Search date inside URL path
    const urlDate = this.parseDateFromUrl(item.url);
    if (urlDate) return urlDate;

    return { date: referenceDate, time: '09:00' };
  }
}
