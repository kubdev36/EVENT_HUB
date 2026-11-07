import { NoiseFilterHelper } from './noise-filter.helper.js';
import { UrlNormalizerHelper } from './url-normalizer.helper.js';

describe('UrlNormalizerHelper', () => {
  it('bỏ tham số tracking và dấu / cuối', () => {
    expect(
      UrlNormalizerHelper.normalizeUrl(
        'https://Shop.vn/Khuyen-Mai/?utm_source=fb&id=2',
      ),
    ).toBe('https://shop.vn/khuyen-mai?id=2');
  });

  it('cùng bài viết với URL khác tracking cho cùng contentHash', () => {
    const a = UrlNormalizerHelper.buildContentHash(
      's1',
      'https://shop.vn/a?utm_source=x',
      'Ưu đãi Tết',
    );
    const b = UrlNormalizerHelper.buildContentHash(
      's1',
      'https://shop.vn/a/',
      'uu dai tet',
    );
    expect(a).toBe(b);
  });

  it('resolve link tương đối và link ảnh Next.js', () => {
    expect(
      UrlNormalizerHelper.resolveUrl('https://shop.vn/tin/', '../a.html'),
    ).toBe('https://shop.vn/a.html');
    expect(
      UrlNormalizerHelper.resolveUrl(
        'https://shop.vn',
        '/_next/image?url=https%3A%2F%2Fcdn.vn%2Fa.jpg&w=640',
      ),
    ).toBe('https://cdn.vn/a.jpg');
  });

  it('loại trang không phải bài viết', () => {
    expect(
      UrlNormalizerHelper.isLikelyEventUrl('https://shop.vn/lien-he'),
    ).toBe(false);
    expect(UrlNormalizerHelper.isLikelyEventUrl('javascript:alert(1)')).toBe(
      false,
    );
    expect(
      UrlNormalizerHelper.isLikelyEventUrl(
        'https://shop.vn/khuyen-mai/iphone-17',
      ),
    ).toBe(true);
  });
});

describe('NoiseFilterHelper', () => {
  it('nhận diện tiêu đề nhiễu', () => {
    expect(NoiseFilterHelper.isNoiseTitle('Trang chủ')).toBe(true);
    expect(NoiseFilterHelper.isNoiseTitle('ngắn')).toBe(true);
    expect(NoiseFilterHelper.isNoiseTitle('<script>alert(1)</script>')).toBe(
      true,
    );
    expect(
      NoiseFilterHelper.isNoiseTitle('Giảm đến 5 triệu khi mua iPhone 17'),
    ).toBe(false);
  });

  it('làm sạch tiêu đề: decode entity, bỏ hậu tố thương hiệu', () => {
    expect(
      NoiseFilterHelper.cleanTitle('Ưu đãi &amp; quà tặng - Fptshop.com.vn'),
    ).toBe('Ưu đãi & quà tặng');
  });

  it('làm sạch mô tả: bỏ CDATA và thẻ HTML', () => {
    expect(
      NoiseFilterHelper.cleanDescription('<![CDATA[<p>Giảm <b>50%</b></p>]]>'),
    ).toBe('Giảm 50%');
    expect(NoiseFilterHelper.cleanDescription('   ')).toBeNull();
  });

  it('nhận diện ảnh placeholder', () => {
    expect(
      NoiseFilterHelper.isNoiseImage('https://cdn.vn/placeholder.png'),
    ).toBe(true);
    expect(
      NoiseFilterHelper.isNoiseImage('https://cdn.vn/banner-iphone.jpg'),
    ).toBe(false);
  });
});
