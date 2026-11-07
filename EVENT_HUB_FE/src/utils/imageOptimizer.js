/**
 * Utility to convert image URLs to WebP format via wsrv.nl CDN proxy
 * Reduces bandwidth by ~80% and protects against 403 hotlink blocking.
 */
import { API_URL } from '../API/API';

export function getOptimizedImageUrl(url, width = 400) {
  if (!url || typeof url !== 'string') return '';
  // Ảnh thu nhỏ đã lưu trên máy chủ của mình: dùng trực tiếp, không qua proxy ngoài.
  if (url.startsWith(`${API_URL}/images/`)) return url;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.includes('localhost') || url.includes('127.0.0.1')) {
    return url;
  }

  try {
    const encodedUrl = encodeURIComponent(url);
    return `https://wsrv.nl/?url=${encodedUrl}&w=${width}&output=webp&q=80`;
  } catch {
    return url;
  }
}
