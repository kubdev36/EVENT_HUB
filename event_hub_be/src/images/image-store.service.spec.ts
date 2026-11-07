import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { CrawlerHttpClient } from '../crawlers/engine/crawler-http.client.js';
import { ImageStorage, LocalDiskImageStorage } from './image-storage.js';
import { ImageStoreService } from './image-store.service.js';
import { ImagesController } from './images.controller.js';

class MemoryStorage extends ImageStorage {
  files = new Map<string, Buffer>();
  exists = async (name: string) => this.files.has(name);
  save = async (name: string, data: Buffer) => {
    this.files.set(name, data);
  };
  absolutePath = (name: string) => `/mem/${name}`;
}

const png = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#2a78d6' },
  })
    .png()
    .toBuffer();

function build(fetchBinary: jest.Mock, rows: Record<string, unknown>[] = []) {
  const storage = new MemoryStorage();
  const http = { fetchBinary, setHostInterval: jest.fn() };
  const updates: unknown[][] = [];
  const qb: Record<string, unknown> = {};
  for (const m of [
    'select',
    'where',
    'andWhere',
    'orderBy',
    'take',
    'update',
    'set',
  ])
    qb[m] = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => rows);
  qb.execute = jest.fn(async () => ({ affected: rows.length }));
  const repo = {
    createQueryBuilder: jest.fn(() => qb),
    update: jest.fn(async (...args: unknown[]) => {
      updates.push(args);
    }),
  };
  const service = new ImageStoreService(repo as never, http as never, storage);
  return { service, storage, http, repo, qb, updates };
}

const ok = (body: Buffer, contentType = 'image/png') =>
  jest.fn(async (url: string) => ({ kind: 'ok', url, contentType, body }));

describe('ImageStoreService', () => {
  it('thu nhỏ ảnh còn rộng tối đa 600px, lưu WebP, tên file theo sha256 của link', async () => {
    const { service, storage } = build(ok(await png(1600, 900)));
    const url = 'https://cdn.shop.vn/a.jpg';
    const res = await service.storeUrl(url);
    expect(res).toEqual({
      status: 'stored',
      name: ImageStoreService.fileNameFor(url),
    });
    expect(ImageStoreService.fileNameFor(url)).toMatch(/^[a-f0-9]{64}\.webp$/);
    const meta = await sharp(
      storage.files.get(ImageStoreService.fileNameFor(url))!,
    ).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(600);
  });

  it('không phóng to ảnh nhỏ', async () => {
    const { service, storage } = build(ok(await png(200, 100)));
    await service.storeUrl('https://cdn.shop.vn/small.png');
    const [buf] = [...storage.files.values()];
    expect((await sharp(buf).metadata()).width).toBe(200);
  });

  it('ảnh đã lưu (cùng link) thì không tải lại', async () => {
    const fetch = ok(await png(10, 10));
    const { service } = build(fetch);
    await service.storeUrl('https://cdn.shop.vn/a.jpg');
    await service.storeUrl('https://cdn.shop.vn/a.jpg');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('file không phải ảnh hoặc SVG thì báo failed', async () => {
    const html = build(ok(Buffer.from('<html></html>'), 'text/html'));
    expect((await html.service.storeUrl('https://x.vn/a')).status).toBe(
      'failed',
    );
    const svg = build(ok(Buffer.from('<svg/>'), 'image/svg+xml'));
    expect((await svg.service.storeUrl('https://x.vn/a.svg')).status).toBe(
      'failed',
    );
    expect(svg.storage.files.size).toBe(0);
  });

  it('khai là ảnh nhưng nội dung hỏng thì báo failed, không lưu', async () => {
    const { service, storage } = build(ok(Buffer.from('not an image')));
    const res = await service.storeUrl('https://x.vn/broken.png');
    expect(res.status).toBe('failed');
    expect(storage.files.size).toBe(0);
  });

  it('web chặn (403/429) thì báo blocked', async () => {
    const { service } = build(
      jest.fn(async (url: string) => ({
        kind: 'blocked',
        url,
        reason: 'HTTP 403',
      })),
    );
    expect(await service.storeUrl('https://x.vn/a.jpg')).toEqual({
      status: 'blocked',
      reason: 'HTTP 403',
    });
  });

  it('link không phải http(s) thì không gọi mạng', async () => {
    const fetch = ok(Buffer.alloc(0));
    const { service } = build(fetch);
    expect((await service.storeUrl('javascript:alert(1)')).status).toBe(
      'failed',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('storeForTarget ghi kết quả vào DB và giãn request tới host ảnh', async () => {
    const rows = [
      { id: 'e1', image: 'https://cdn.shop.vn/a.jpg' },
      { id: 'e2', image: 'https://cdn.shop.vn/b.jpg' },
    ];
    const fetch = jest.fn(async (url: string) =>
      url.endsWith('a.jpg')
        ? { kind: 'ok', url, contentType: 'image/png', body: await png(10, 10) }
        : { kind: 'failed', url, reason: 'HTTP 404' },
    );
    const { service, updates, http } = build(fetch, rows);
    const counts = await service.storeForTarget({
      id: 'shop',
      name: 'Shop',
      targetUrls: ['https://shop.vn/tin-tuc'],
    });
    expect(counts).toEqual({ stored: 1, failed: 1, blocked: 0, skipped: 0 });
    expect(updates[0][1]).toMatchObject({
      imageStoreStatus: 'stored',
      imageStoredPath: ImageStoreService.fileNameFor(rows[0].image),
    });
    expect(updates[1][1]).toMatchObject({
      imageStoreStatus: 'failed',
      imageStoredPath: null,
    });
    expect(http.setHostInterval).toHaveBeenCalledWith('cdn.shop.vn', 1000);
  });

  it('nguồn facebook mặc định không lưu ảnh, chỉ đánh dấu skipped', async () => {
    const fetch = ok(Buffer.alloc(0));
    const { service, qb } = build(fetch, [{ id: 'e1' }]);
    const counts = await service.storeForTarget({
      id: 'fb',
      name: 'FB',
      type: 'facebook',
      targetUrls: [],
    });
    expect(counts.skipped).toBe(1);
    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({ imageStoreStatus: 'skipped' }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('storeImages trong cấu hình nguồn ghi đè mặc định', () => {
    expect(
      ImageStoreService.shouldStore({ type: 'facebook', storeImages: true }),
    ).toBe(true);
    expect(
      ImageStoreService.shouldStore({ type: 'web', storeImages: false }),
    ).toBe(false);
    expect(ImageStoreService.shouldStore({})).toBe(true);
  });
});

describe('LocalDiskImageStorage và ImagesController', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'img-store-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('từ chối tên file không đúng định dạng, kể cả ../', async () => {
    const storage = new LocalDiskImageStorage(dir);
    for (const bad of [
      '../.env',
      '..%2F.env',
      'a.webp',
      `${'a'.repeat(64)}.png`,
      `${'A'.repeat(64)}.webp`,
    ]) {
      expect(storage.absolutePath(bad)).toBeNull();
      expect(await storage.exists(bad)).toBe(false);
    }
    await expect(storage.save('../x', Buffer.alloc(1))).rejects.toThrow();
  });

  it('lưu rồi đọc lại được; controller trả 404 cho file không có', async () => {
    const storage = new LocalDiskImageStorage(dir);
    const name = `${'a'.repeat(64)}.webp`;
    await storage.save(name, Buffer.from('x'));
    expect(await storage.exists(name)).toBe(true);
    expect((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual(
      [],
    );

    const controller = new ImagesController(storage);
    const res = { setHeader: jest.fn(), sendFile: jest.fn() };
    await controller.get(name, res as never);
    expect(res.sendFile).toHaveBeenCalledWith(
      path.join(path.resolve(dir), name),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );

    await expect(
      controller.get(`${'b'.repeat(64)}.webp`, res as never),
    ).rejects.toThrow();
    await expect(controller.get('../.env', res as never)).rejects.toThrow();
  });
});

describe('CrawlerHttpClient.fetchBinary', () => {
  const client = () => {
    const c = new CrawlerHttpClient();
    c.resolveHost = async () => ['93.184.216.34'];
    c.defaultHostIntervalMs = 0;
    return c;
  };
  afterEach(() => jest.restoreAllMocks());

  it('dừng đọc khi file vượt giới hạn dung lượng', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(new Uint8Array(2048), {
          headers: { 'content-type': 'image/png' },
        }),
      );
    const res = await client().fetchBinary('https://cdn.shop.vn/big.png', 1024);
    expect(res.kind).toBe('failed');
  });

  it('content-length khai lớn hơn giới hạn thì không đọc', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('x', {
          headers: { 'content-type': 'image/png', 'content-length': '999999' },
        }),
      );
    expect(
      (await client().fetchBinary('https://cdn.shop.vn/a.png', 1024)).kind,
    ).toBe('failed');
  });

  it('403 trả blocked; link nội bộ bị chặn trước khi gọi mạng', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 403 }));
    expect(
      (await client().fetchBinary('https://cdn.shop.vn/a.png', 1024)).kind,
    ).toBe('blocked');
    spy.mockClear();
    const c = client();
    c.resolveHost = async () => ['127.0.0.1'];
    expect((await c.fetchBinary('https://evil.vn/a.png', 1024)).kind).toBe(
      'failed',
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('ảnh hợp lệ trả nội dung và content-type', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/png' },
        }),
      );
    const res = await client().fetchBinary('https://cdn.shop.vn/a.png', 1024);
    expect(res).toMatchObject({ kind: 'ok', contentType: 'image/png' });
    if (res.kind === 'ok') expect([...res.body]).toEqual([1, 2, 3]);
  });
});
