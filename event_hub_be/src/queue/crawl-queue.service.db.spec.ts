import { jest } from '@jest/globals';
import { PgBoss } from 'pg-boss';
import { CRAWL_QUEUE, CrawlQueueService } from './crawl-queue.service.js';

/**
 * Test hàng đợi trên Postgres thật. Chỉ chạy khi có DASHBOARD_TEST_DB (DB tạm; test xóa schema pgboss).
 */
const url = process.env.DASHBOARD_TEST_DB;
const d = url ? describe : describe.skip;

const waitFor = async (cond: () => boolean | Promise<boolean>, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Hết thời gian chờ');
};

d('CrawlQueueService (Postgres + pg-boss)', () => {
  jest.setTimeout(60_000);
  const parsed = url ? new URL(url) : null;
  const config = {
    get: (k: string) =>
      ({
        DB_HOST: parsed?.hostname,
        DB_PORT: parsed?.port,
        DB_USERNAME: decodeURIComponent(parsed?.username ?? ''),
        DB_PASSWORD: decodeURIComponent(parsed?.password ?? ''),
        DB_NAME: parsed?.pathname.slice(1),
      })[k],
  };
  const services: CrawlQueueService[] = [];
  const make = (crawl: (id: string) => Promise<unknown>, role = 'all') => {
    process.env.PROCESS_ROLE = role;
    const svc = new CrawlQueueService(
      config as never,
      { crawlTargetById: crawl } as never,
    );
    services.push(svc);
    return svc;
  };

  beforeEach(async () => {
    const admin = new PgBoss({ connectionString: url, schema: 'pgboss' });
    await admin.start();
    await admin.deleteQueue(CRAWL_QUEUE).catch(() => undefined);
    await admin.stop({ graceful: false });
  });
  afterEach(async () => {
    while (services.length)
      await services
        .pop()!
        .onApplicationShutdown()
        .catch(() => undefined);
    delete process.env.PROCESS_ROLE;
  });

  it('api chỉ đẩy việc, không xử lý; mỗi nguồn chỉ một việc chờ', async () => {
    const crawl = jest.fn(async () => ({ status: 'success', newItems: 0 }));
    const api = make(crawl, 'api');
    await api.onModuleInit();
    const first = await api.enqueue(['tgdd', 'fpt']);
    const again = await api.enqueue(['tgdd']);
    expect(first).toEqual({ queued: ['tgdd', 'fpt'], alreadyQueued: [] });
    expect(again).toEqual({ queued: [], alreadyQueued: ['tgdd'] });
    await new Promise((r) => setTimeout(r, 2500));
    expect(crawl).not.toHaveBeenCalled();
  });

  it('worker nhận việc và gọi crawl đúng nguồn', async () => {
    const done: string[] = [];
    const worker = make(async (id) => {
      done.push(id);
      return { status: 'success', newItems: 1 };
    }, 'worker');
    await worker.onModuleInit();
    await worker.enqueue(['tgdd', 'fpt']);
    await waitFor(() => done.length === 2);
    expect(done.sort()).toEqual(['fpt', 'tgdd']);
  });

  it('worker chết giữa chừng: việc hết hạn và được worker khác chạy lại, không mất', async () => {
    let started = false;
    // Worker 1 nhận việc rồi "chết" (không bao giờ xong).
    const dying = make(async () => {
      started = true;
      return new Promise(() => undefined);
    }, 'worker');
    await dying.onModuleInit();
    // Rút thời hạn còn 2 giây (sau khi service đã áp cấu hình của nó) để test không phải chờ
    // 20 phút. Thời hạn được chép vào việc lúc đẩy, nên đặt trước khi enqueue.
    const admin = new PgBoss({ connectionString: url, schema: 'pgboss' });
    await admin.start();
    await admin.updateQueue(CRAWL_QUEUE, { expireInSeconds: 2, retryDelay: 0 });
    await admin.stop({ graceful: false });
    await dying.enqueue(['tgdd']);
    await waitFor(() => started);
    await (dying as unknown as { boss: PgBoss }).boss.stop({
      graceful: false,
      close: true,
    });
    services.splice(services.indexOf(dying), 1);

    // Worker 2 lấy lại việc sau khi hết hạn.
    const done: string[] = [];
    const healthy = make(async (id) => {
      done.push(id);
      return { status: 'success', newItems: 0 };
    }, 'worker');
    await healthy.onModuleInit();
    const supervisor = new PgBoss({
      connectionString: url,
      schema: 'pgboss',
      superviseIntervalSeconds: 1,
    });
    await supervisor.start();
    try {
      await waitFor(() => done.length === 1, 45_000);
    } finally {
      await supervisor.stop({ graceful: false });
    }
    expect(done).toEqual(['tgdd']);
  });
});
