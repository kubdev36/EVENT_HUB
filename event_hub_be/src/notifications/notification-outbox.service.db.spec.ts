import { DataSource } from 'typeorm';
import { AuditLog } from '../audit/audit-log.entity.js';
import { RefreshToken } from '../auth/refresh-token.entity.js';
import { CrawlerRun } from '../crawlers/entity/crawler-run.entity.js';
import { Event } from '../events/entity/event.entity.js';
import { migrations } from '../migrations/index.js';
import { Setting } from '../settings/entity/setting.entity.js';
import { User } from '../users/entity/user.entity.js';
import { NotificationOutbox } from './notification-outbox.entity.js';
import {
  MAX_ATTEMPTS,
  NotificationOutboxService,
  retryDelayMs,
} from './notification-outbox.service.js';

/**
 * Test trên Postgres thật (claim dùng FOR UPDATE SKIP LOCKED). Chỉ chạy khi có DASHBOARD_TEST_DB.
 * Không bao giờ trỏ vào DB thật: test xóa sạch bảng events và notification_outbox.
 */
const url = process.env.DASHBOARD_TEST_DB;
const d = url ? describe : describe.skip;

d('NotificationOutboxService (Postgres)', () => {
  let ds: DataSource;
  let outbox: NotificationOutboxService;
  let n = 0;

  const addEvents = async (count: number) => {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      n += 1;
      const saved = await ds.getRepository(Event).save({
        sourceId: 's',
        sourceName: 'S',
        origin: 'crawler',
        sourceUrl: 'https://x.vn',
        title: `Bài ${n}`,
        url: `https://x.vn/ob-${n}`,
        type: 'promo',
        contentHash: `ob${n}`,
        dateUnknown: false,
      });
      ids.push(saved.id);
    }
    return ids;
  };
  const rows = () =>
    ds.getRepository(NotificationOutbox).find({ order: { createdAt: 'ASC' } });

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      url,
      entities: [
        User,
        Event,
        CrawlerRun,
        Setting,
        AuditLog,
        RefreshToken,
        NotificationOutbox,
      ],
      migrations,
      synchronize: false,
    });
    await ds.initialize();
    await ds.runMigrations();
    outbox = new NotificationOutboxService(
      ds.getRepository(NotificationOutbox),
    );
  });
  afterAll(() => ds?.destroy());
  beforeEach(async () => {
    await ds.query('DELETE FROM notification_outbox');
    await ds.query('DELETE FROM events');
  });

  it('enqueue hai lần cùng bài không tạo dòng trùng', async () => {
    const [id] = await addEvents(1);
    await outbox.enqueue([id]);
    await outbox.enqueue([id]);
    expect(await rows()).toHaveLength(1);
  });

  it('enqueue trong transaction bị rollback thì không còn dòng nào', async () => {
    const [id] = await addEvents(1);
    await expect(
      ds.transaction(async (m) => {
        await outbox.enqueue([id], m);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await rows()).toHaveLength(0);
  });

  it('hai tiến trình lấy việc cùng lúc không lấy trùng dòng', async () => {
    await outbox.enqueue(await addEvents(6));
    const [a, b] = await Promise.all([outbox.claimDue(4), outbox.claimDue(4)]);
    const ids = [...a, ...b].map((r) => r.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    // Đang bị giữ: lấy lần nữa không ra dòng nào.
    expect(await outbox.claimDue(10)).toHaveLength(0);
  });

  it('khóa hết hạn (tiến trình chết giữa chừng) thì dòng được lấy lại', async () => {
    await outbox.enqueue(await addEvents(1));
    const now = new Date();
    expect(await outbox.claimDue(1, now)).toHaveLength(1);
    expect(
      await outbox.claimDue(1, new Date(now.getTime() + 60_000)),
    ).toHaveLength(0);
    expect(
      await outbox.claimDue(1, new Date(now.getTime() + 6 * 60_000)),
    ).toHaveLength(1);
  });

  it('gửi lỗi thì hẹn thử lại với khoảng chờ tăng dần; quá số lần thì failed', async () => {
    await outbox.enqueue(await addEvents(1));
    const t0 = new Date();
    const [job] = await outbox.claimDue(1, t0);
    await outbox.markFailed(job.id, job.attempts, 'HTTP 500', t0);
    let [row] = await rows();
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'HTTP 500',
    });
    expect(row.nextAttemptAt.getTime()).toBe(t0.getTime() + retryDelayMs(1));
    // Chưa tới hạn thử lại thì chưa lấy được.
    expect(await outbox.claimDue(1, t0)).toHaveLength(0);

    await outbox.markFailed(job.id, MAX_ATTEMPTS - 1, 'HTTP 500', t0);
    [row] = await rows();
    expect(row.status).toBe('failed');
    expect(
      await outbox.claimDue(1, new Date(t0.getTime() + 864e5)),
    ).toHaveLength(0);
  });

  it('markSent và release', async () => {
    await outbox.enqueue(await addEvents(2));
    const claimed = await outbox.claimDue(2);
    await outbox.markSent(claimed[0].id);
    await outbox.release([claimed[1].id]);
    const again = await outbox.claimDue(5);
    expect(again.map((r) => r.id)).toEqual([claimed[1].id]);
    const sent = (await rows()).find((r) => r.id === claimed[0].id)!;
    expect(sent.status).toBe('sent');
    expect(sent.sentAt).toBeTruthy();
  });

  it('xóa bài thì dòng outbox bị xóa theo', async () => {
    const [id] = await addEvents(1);
    await outbox.enqueue([id]);
    await ds.getRepository(Event).delete(id);
    expect(await rows()).toHaveLength(0);
  });
});
