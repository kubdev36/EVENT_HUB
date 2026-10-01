import { ParsedCrawlItem } from '../crawler.types.js';

export class DateExtractorHelper {
  static parsePublishedDate(text: string | null | undefined, referenceDate: Date = new Date()): { date: Date; time: string } | null {
    if (!text) return null;
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // Direct ISO / standard date parsing
    if (
      cleanText.length >= 10 &&
      (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(cleanText) ||
        /^\d{1,2}\/\d{1,2}\/\d{4}/.test(cleanText) ||
        /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}/i.test(cleanText) ||
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(cleanText))
    ) {
      const direct = new Date(cleanText);
      if (!Number.isNaN(direct.getTime()) && direct.getFullYear() >= 2020 && direct.getFullYear() <= 2035) {
        const timeStr = `${String(direct.getHours()).padStart(2, '0')}:${String(direct.getMinutes()).padStart(2, '0')}`;
        return { date: direct, time: timeStr };
      }
    }

    // WordPress translated month format (e.g. "Tháng 10 28, 2025")
    const wpMonthMatch = cleanText.match(/tháng\s*([1-9]|1[0-2])\s*(?:ngày\s*)?(\d{1,2}),?\s+(\d{4})/i);
    if (wpMonthMatch) {
      const [, monthStr, dayStr, yearStr] = wpMonthMatch;
      const m = parseInt(monthStr, 10);
      const d = parseInt(dayStr, 10);
      const y = parseInt(yearStr, 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2035) {
        return { date: new Date(y, m - 1, d, 9, 0), time: '09:00' };
      }
    }

    // "DD Tháng MM, YYYY"
    const dayMonthYearMatch = cleanText.match(/(\d{1,2})\s+tháng\s*([1-9]|1[0-2]),?\s+(?:năm\s+)?(\d{4})/i);
    if (dayMonthYearMatch) {
      const [, dayStr, monthStr, yearStr] = dayMonthYearMatch;
      const d = parseInt(dayStr, 10);
      const m = parseInt(monthStr, 10);
      const y = parseInt(yearStr, 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2035) {
        return { date: new Date(y, m - 1, d, 9, 0), time: '09:00' };
      }
    }

    // Check "ngày DD tháng MM (năm YYYY)"
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

    // Check DD/MM/YYYY or DD-MM-YYYY
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

    // Relative time: "X giờ trước", "X ngày trước", "X phút trước"
    const relMatch = cleanText.match(/(\d+)\s*(giờ|ngày|phút|tuần|tháng)\s*trước/i);
    if (relMatch) {
      const amount = parseInt(relMatch[1], 10);
      const unit = relMatch[2].toLowerCase();
      const d = new Date(referenceDate);
      if (unit.includes('phút')) d.setMinutes(d.getMinutes() - amount);
      else if (unit.includes('giờ')) d.setHours(d.getHours() - amount);
      else if (unit.includes('ngày')) d.setDate(d.getDate() - amount);
      else if (unit.includes('tuần')) d.setDate(d.getDate() - amount * 7);
      else if (unit.includes('tháng')) d.setMonth(d.getMonth() - amount);

      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return { date: d, time: timeStr };
    }

    return null;
  }

  static parseItemEventDate(item: ParsedCrawlItem, referenceDate: Date = new Date()): { date: Date | null; time: string | null } {
    if (item.eventDate && !isNaN(item.eventDate.getTime())) {
      const timeStr = item.eventTime || `${String(item.eventDate.getHours()).padStart(2, '0')}:${String(item.eventDate.getMinutes()).padStart(2, '0')}`;
      return { date: item.eventDate, time: timeStr };
    }

    // Fallback: search date inside description or rawData
    const descDate = this.parsePublishedDate(item.description, referenceDate);
    if (descDate) return descDate;

    return { date: referenceDate, time: '09:00' };
  }
}
