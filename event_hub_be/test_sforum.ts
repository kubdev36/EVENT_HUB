import { GenericRssEngine } from './src/crawlers/engine/generic-rss.engine.js';
import { CrawlerHttpClient } from './src/crawlers/engine/crawler-http.client.js';

async function test() {
  const httpClient = new CrawlerHttpClient();
  const rssEngine = new GenericRssEngine(httpClient);
  
  console.log('Fetching sforum feed...');
  const items = await rssEngine.fetchRssOrSitemap('https://sforum.vn/feed');
  console.log(`Parsed ${items.length} items from Sforum:`);
  for (const item of items.slice(0, 5)) {
    console.log({
      title: item.title,
      image: item.image,
      date: item.eventDate,
      url: item.url
    });
  }
}

test().catch(console.error);
