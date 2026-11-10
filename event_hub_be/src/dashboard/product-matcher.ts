export type TrackedProduct = { name: string; aliases: string[] };

type Pattern = { product: number; re: RegExp };

/** Bỏ dấu, chữ thường, gộp khoảng trắng: "Điện thoại  iPhone" -> "dien thoai iphone". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Regex cho một cách viết: khoảng trắng giữa các phần là tùy chọn ("reno 17" khớp "reno17"),
 * hai đầu phải là ranh giới chữ/số ("iphone 18" không khớp "iphone 180").
 */
function aliasRegex(alias: string): RegExp | null {
  const parts = normalizeText(alias)
    .split(' ')
    .filter(Boolean)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!parts.length) return null;
  return new RegExp(`(?<![a-z0-9])${parts.join('\\s*')}(?![a-z0-9])`, 'g');
}

/**
 * Đếm số bài nhắc tới từng sản phẩm theo tiêu đề. Một bài nhắc nhiều sản phẩm thì tính cho mỗi
 * sản phẩm một lần. Khi hai cách viết chồng lên nhau trong tiêu đề, cách viết dài hơn thắng:
 * "iPhone 18 Pro Max" chỉ tính cho iPhone 18 Pro Max, không tính thêm cho iPhone 18 Pro.
 */
export function countProductMentions(
  titles: string[],
  products: TrackedProduct[],
): Array<{ name: string; count: number }> {
  const patterns: Pattern[] = [];
  products.forEach((p, i) => {
    for (const alias of new Set([p.name, ...p.aliases])) {
      const re = aliasRegex(alias);
      if (re) patterns.push({ product: i, re });
    }
  });
  const counts = products.map(() => 0);
  for (const title of titles) {
    const text = normalizeText(title);
    const hits: Array<{ product: number; start: number; end: number }> = [];
    for (const { product, re } of patterns) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re))
        hits.push({ product, start: m.index, end: m.index + m[0].length });
    }
    // Dài trước; bỏ đoạn nằm chồng lên một đoạn dài hơn đã nhận.
    hits.sort((a, b) => b.end - b.start - (a.end - a.start));
    const taken: typeof hits = [];
    for (const h of hits) {
      if (!taken.some((t) => h.start < t.end && t.start < h.end)) taken.push(h);
    }
    for (const product of new Set(taken.map((t) => t.product)))
      counts[product] += 1;
  }
  return products
    .map((p, i) => ({ name: p.name, count: counts[i] }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
