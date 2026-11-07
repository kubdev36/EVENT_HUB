import { Injectable, Logger } from '@nestjs/common';
import { ParsedCrawlItem } from '../crawler.types.js';
import { CrawlerHttpClient } from './crawler-http.client.js';
import { DateExtractorHelper } from '../helpers/date-extractor.helper.js';
import { NoiseFilterHelper } from '../helpers/noise-filter.helper.js';

@Injectable()
export class GenericMetaAdsEngine {
  private readonly logger = new Logger(GenericMetaAdsEngine.name);

  private readonly KNOWN_PAGE_IDS: Record<string, string> = {
    cellphones: '132621766841117',
    cellphonesvn: '132621766841117',
    fptshop: '276606822452391',
    fptshoponline: '276606822452391',
    hoanghamobile: '186591741407842',
    thegioididong: '121966551174950',
    minhtuanmobile: '478144675549021',
  };

  constructor(private readonly httpClient: CrawlerHttpClient) {}

  /**
   * Extract Page ID from URL, ID string or handle
   */
  resolvePageId(input: string): string | null {
    if (!input) return null;
    const clean = input.trim().toLowerCase();

    // 1. Check numeric page ID
    if (/^\d{8,20}$/.test(clean)) {
      return clean;
    }

    // 2. Check known brand map
    for (const [key, pageId] of Object.entries(this.KNOWN_PAGE_IDS)) {
      if (clean.includes(key)) return pageId;
    }

    // 3. Extract from Facebook URL
    const match = clean.match(/facebook\.com\/(?:pages\/[^\/]+\/)?([a-zA-Z0-9_.-]+)/i);
    if (match) {
      const slug = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const [key, pageId] of Object.entries(this.KNOWN_PAGE_IDS)) {
        if (slug.includes(key) || key.includes(slug)) return pageId;
      }
    }

    return null;
  }

  /**
   * Fetch active ads from Meta Ad Library
   */
  async fetchActiveAds(urlOrPageId: string): Promise<ParsedCrawlItem[]> {
    const pageId = this.resolvePageId(urlOrPageId);
    if (!pageId) {
      this.logger.warn(`Could not resolve Meta Page ID for: ${urlOrPageId}`);
      return [];
    }

    const items: ParsedCrawlItem[] = [];
    try {
      const searchUrl = `https://www.facebook.com/ads/library/async/search_ads/?count=30&active_status=active&ad_type=all&countries[0]=VN&view_all_page_id=${pageId}&media_type=all`;
      const resp = await this.httpClient.fetchHtml(searchUrl);
      
      if (resp?.html) {
        const cleanData = resp.html.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');
        const json = JSON.parse(cleanData);
        const results = json.payload?.results || [];

        for (const adGroup of results) {
          const ad = Array.isArray(adGroup) ? adGroup[0] : adGroup;
          if (!ad) continue;

          const snapshot = ad.snapshot || {};
          const bodyText = snapshot.body?.text || snapshot.title || '';
          if (!bodyText || NoiseFilterHelper.isNoiseTitle(bodyText)) continue;

          // Extract best image
          let image: string | null = null;
          if (snapshot.images && snapshot.images.length > 0) {
            image = snapshot.images[0].original_image_url || snapshot.images[0].resized_image_url || null;
          } else if (snapshot.videos && snapshot.videos.length > 0) {
            image = snapshot.videos[0].video_preview_image_url || null;
          } else if (snapshot.cards && snapshot.cards.length > 0) {
            image = snapshot.cards[0].original_image_url || snapshot.cards[0].resized_image_url || null;
          }

          // Format start date
          let eventDate: Date | null = null;
          if (ad.startDateFormatted) {
            const parsed = DateExtractorHelper.parsePublishedDate(ad.startDateFormatted);
            if (parsed?.date) eventDate = parsed.date;
          }
          if (!eventDate && ad.startDate) {
            eventDate = new Date(ad.startDate * 1000);
          }

          const linkUrl = snapshot.link_url || `https://www.facebook.com/ads/library/?id=${ad.adArchiveID}`;

          items.push({
            title: NoiseFilterHelper.cleanTitle(bodyText.slice(0, 150)),
            description: bodyText,
            url: linkUrl,
            image: image && !NoiseFilterHelper.isNoiseImage(image) ? image : null,
            eventDate: eventDate,
            eventTime: eventDate ? DateExtractorHelper['formatTimeFromDate'](eventDate) : null,
            rawData: {
              platform: 'meta_ads',
              adArchiveId: ad.adArchiveID,
              pageId: ad.pageID,
              pageName: ad.pageName,
            },
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Meta Ad Library fetch failed for page ${pageId}: ${(err as Error)?.message}`);
    }

    return items;
  }
}
