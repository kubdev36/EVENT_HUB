import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';

export type HostResolver = (hostname: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map(
    (a) => a.address,
  );

/** URL nguồn crawl trỏ vào mạng nội bộ, metadata cloud hoặc không phải http(s). */
export class UnsafeUrlError extends Error {
  constructor(url: string, reason: string) {
    super(`URL không được phép (${reason}): ${url}`);
    this.name = 'UnsafeUrlError';
  }
}

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
];

/**
 * Chống SSRF: chỉ cho http(s), không có user:pass, và mọi IP phân giải được đều phải là IP công khai.
 * Gọi lại cho từng bước chuyển hướng. Giới hạn: không chống được DNS rebinding giữa lúc kiểm tra và lúc kết nối.
 */
export async function assertPublicHttpUrl(
  raw: string,
  resolve: HostResolver = defaultResolver,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError(raw, 'không parse được');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(raw, 'chỉ nhận http(s)');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError(raw, 'không nhận thông tin đăng nhập trong URL');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost' ||
    BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))
  ) {
    throw new UnsafeUrlError(raw, 'host nội bộ');
  }

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await resolve(host);
    } catch (err) {
      throw new UnsafeUrlError(
        raw,
        `không phân giải được DNS: ${(err as Error).message}`,
      );
    }
  }
  if (addresses.length === 0)
    throw new UnsafeUrlError(raw, 'không có địa chỉ IP');
  const blocked = addresses.find(isNonPublicIp);
  if (blocked) throw new UnsafeUrlError(raw, `IP nội bộ ${blocked}`);
  return url;
}

/** IP loopback, private, link-local (gồm metadata 169.254.169.254), CGNAT, multicast, dành riêng. */
export function isNonPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isNonPublicV4(ip);
  if (v === 6) {
    const h = expandV6(ip);
    if (!h) return true;
    const v4At = (i: number) =>
      `${h[i] >> 8}.${h[i] & 0xff}.${h[i + 1] >> 8}.${h[i + 1] & 0xff}`;
    const zeroUntil = (n: number) => h.slice(0, n).every((x) => x === 0);
    // ::/128, ::1, và IPv4 nhúng ::a.b.c.d (cũ) đều xét theo IPv4 bên trong.
    if (zeroUntil(6)) return isNonPublicV4(v4At(6));
    // ::ffff:a.b.c.d (IPv4-mapped), kể cả dạng hex ::ffff:7f00:1.
    if (zeroUntil(5) && h[5] === 0xffff) return isNonPublicV4(v4At(6));
    // 64:ff9b::/96 (NAT64) và 2002::/16 (6to4) đều chứa IPv4: chặn hẳn.
    if (h[0] === 0x64 && h[1] === 0xff9b) return true;
    if (h[0] === 0x2002) return true;
    if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // tài liệu
    return false;
  }
  return true; // không phải IP hợp lệ: coi như không an toàn
}

/** Khai triển IPv6 (đã qua isIP) thành 8 nhóm 16 bit; null nếu không đọc được. */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  // Đuôi IPv4 (vd. ::ffff:1.2.3.4) đổi thành hai nhóm hex.
  const tail = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number);
    s = s.slice(0, tail.index) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (p: string) => (p ? p.split(':').map((x) => parseInt(x, 16)) : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null;
  const out = [...head, ...Array<number>(fill).fill(0), ...rest];
  return out.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? out : null;
}

function isNonPublicV4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}
