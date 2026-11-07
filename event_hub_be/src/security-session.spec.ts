import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
// Nạp throttler trước (AuthController dùng), tránh lỗi nạp ESM đồng thời của Jest.
import { ThrottlerException, ThrottlerModule } from '@nestjs/throttler';
import { AuditThrottleFilter } from './audit/audit-throttle.filter.js';
import { LOGIN_THROTTLERS } from './auth/login-throttle.js';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import { of, throwError, lastValueFrom } from 'rxjs';
import request from 'supertest';
import { AuditInterceptor } from './audit/audit.interceptor.js';
import { AuthController } from './auth/controller/auth.controller.js';
import { JwtStrategy } from './auth/jwt.strategy.js';
import { AuthService } from './auth/service/auth.service.js';
import {
  createCsrfMiddleware,
  requireCsrfHeader,
  SESSION_COOKIE,
} from './auth/session-cookie.js';
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  loadEncryptionKey,
  maskSecret,
} from './common/secret-box.js';
import { ImageStorage } from './images/image-storage.js';
import { ImagesController } from './images/images.controller.js';
import { SettingsService } from './settings/service/settings.service.js';
import { TelegramService } from './telegram/telegram.service.js';
import { User } from './users/entity/user.entity.js';

const SECRET = 'x'.repeat(40); // khóa JWT giả cho test
const KEY_B64 = Buffer.alloc(32, 7).toString('base64');

describe('Cookie phiên httpOnly, CSRF và ảnh cần đăng nhập', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const user = { id: 'u1', email: 'a@b.vn', role: 'admin', isActive: true };

  beforeAll(async () => {
    const storage = {
      absolutePath: (n: string) =>
        /^[a-f0-9]{64}\.webp$/.test(n) ? `/x/${n}` : null,
      exists: async () => false,
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: LOGIN_THROTTLERS }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: SECRET,
          signOptions: { expiresIn: '1d' },
        }),
      ],
      controllers: [AuthController, ImagesController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { getOrThrow: () => SECRET } },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: async () => user },
        },
        { provide: ImageStorage, useValue: storage },
        {
          provide: AuthService,
          useFactory: (j: JwtService) => ({
            login: async () => ({
              message: 'Login successful',
              accessToken: await j.signAsync({ sub: user.id }),
              user: { id: user.id, email: user.email, role: user.role },
            }),
          }),
          inject: [JwtService],
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.use(requireCsrfHeader);
    await app.init();
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app.close());

  it('đăng nhập đặt cookie HttpOnly + SameSite=Strict, không trả token trong nội dung', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: 'a@b.vn', password: 'x' })
      .expect(200);
    expect(res.body.accessToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0];
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('request ghi dữ liệu thiếu X-Requested-With bị chặn 403 (CSRF)', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({}).expect(403);
  });

  it('/auth/me nhận cookie phiên; không có cookie thì 401', async () => {
    const token = await jwt.signAsync({ sub: user.id });
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${token}`)
      .expect(200);
    expect(res.body.user.email).toBe(user.email);
  });

  it('logout xóa cookie phiên', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('X-Requested-With', 'XMLHttpRequest')
      .expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0];
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('/images cần đăng nhập', async () => {
    const name = `${'a'.repeat(64)}.webp`;
    await request(app.getHttpServer()).get(`/images/${name}`).expect(401);
    const token = await jwt.signAsync({ sub: user.id });
    await request(app.getHttpServer())
      .get(`/images/${name}`)
      .set('Cookie', `${SESSION_COOKIE}=${token}`)
      .expect(404);
  });
});

describe('Mã hóa token Telegram', () => {
  const key = loadEncryptionKey(KEY_B64)!;

  it('mã hóa rồi giải mã đúng; mỗi lần mã hóa khác nhau', () => {
    const a = encryptSecret('123:ABC', key);
    const b = encryptSecret('123:ABC', key);
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toContain('123:ABC');
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe('123:ABC');
  });

  it('dữ liệu bị sửa hoặc sai khóa thì giải mã báo lỗi', () => {
    const enc = encryptSecret('123:ABC', key);
    const tampered =
      enc.slice(0, -4) + (enc.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(enc, Buffer.alloc(32, 9))).toThrow();
  });

  it('khóa sai độ dài bị từ chối; hex 64 ký tự được nhận', () => {
    expect(() => loadEncryptionKey('abc')).toThrow('32 byte');
    expect(loadEncryptionKey('ab'.repeat(32))?.length).toBe(32);
    expect(loadEncryptionKey('')).toBeNull();
  });

  it('che token khi hiển thị', () => {
    expect(maskSecret('123456789:ABCDEFGH')).toBe('••••EFGH');
    expect(maskSecret('short')).toBe('••••');
  });

  describe('SettingsService', () => {
    const OLD_ENV = process.env.SETTINGS_ENC_KEY;
    beforeEach(() => {
      process.env.SETTINGS_ENC_KEY = KEY_B64;
    });
    afterAll(() => {
      process.env.SETTINGS_ENC_KEY = OLD_ENV;
    });

    function build(rows: Array<{ key: string; value: unknown }>) {
      const repo = {
        find: async () => rows,
        findOne: async ({ where }: { where: { key: string } }) =>
          rows.find((r) => r.key === where.key) ?? null,
        create: (r: { key: string }) => ({ value: undefined, ...r }),
        save: jest.fn(async (r: { key: string; value: unknown }) => {
          const i = rows.findIndex((x) => x.key === r.key);
          if (i >= 0) rows[i] = r;
          else rows.push(r);
          return { ...r, updatedAt: new Date() };
        }),
      };
      return { service: new SettingsService(repo as never, {} as never), rows };
    }

    it('GET /settings không trả token, chỉ báo đã có và 4 ký tự cuối', async () => {
      const enc = encryptSecret('123456789:SECRETXYZ', key);
      const { service } = build([
        { key: 'telegram_config', value: { botToken: enc, chatId: '-100' } },
      ]);
      const all = await service.getAllSettings();
      const text = JSON.stringify(all);
      expect(text).not.toContain(enc);
      expect(text).not.toContain('SECRETXYZ');
      expect(all.telegram_config).toMatchObject({
        botTokenSet: true,
        botTokenMasked: '••••TXYZ',
        chatId: '-100',
      });
    });

    it('lưu token thì mã hóa; ô token trống thì giữ token cũ', async () => {
      const { service, rows } = build([]);
      const saved = await service.saveTelegramConfig({
        botToken: '111:AAA',
        chatId: '-1',
      });
      expect(JSON.stringify(saved)).not.toContain('111:AAA');
      const stored = rows[0].value as { botToken: string };
      expect(isEncrypted(stored.botToken)).toBe(true);
      expect(decryptSecret(stored.botToken, key)).toBe('111:AAA');

      await service.saveTelegramConfig({ botToken: '', chatId: '-2' });
      const after = rows[0].value as { botToken: string; chatId: string };
      expect(decryptSecret(after.botToken, key)).toBe('111:AAA');
      expect(after.chatId).toBe('-2');
    });

    it('thiếu SETTINGS_ENC_KEY thì không lưu token dạng chữ thường', async () => {
      delete process.env.SETTINGS_ENC_KEY;
      const { service, rows } = build([]);
      await expect(
        service.saveTelegramConfig({ botToken: '111:AAA', chatId: '-1' }),
      ).rejects.toThrow('SETTINGS_ENC_KEY');
      expect(rows).toHaveLength(0);
    });

    it('TelegramService đọc được cả token đã mã hóa và token cũ chưa mã hóa', () => {
      expect(TelegramService.decryptToken(encryptSecret('9:Z', key))).toBe(
        '9:Z',
      );
      expect(TelegramService.decryptToken('9:Z')).toBe('9:Z');
      expect(TelegramService.decryptToken(undefined)).toBe('');
    });

    it('lưu cấu hình crawler từ giao diện không làm mất extract, api, giới hạn tốc độ, storeImages', async () => {
      const { service, rows } = build([]);
      const source = {
        id: 'tgdd',
        name: 'TGDD',
        targetUrls: ['https://www.thegioididong.com/tin-tuc/tin-khuyen-mai/31'],
        extract: { itemSelector: 'li.item', fetchDetail: true },
        api: {
          type: 'sforum-graphql',
          endpoint: 'https://x.vn/graphql',
          categoryIds: [1],
          articleBaseUrl: 'https://x.vn/',
        },
        minRequestIntervalMs: 5000,
        storeImages: false,
      };
      await service.saveSetting('crawler_sources', { targets: [source] });
      const saved = (rows[0].value as Array<Record<string, unknown>>)[0];
      expect(saved).toMatchObject({
        extract: source.extract,
        api: source.api,
        minRequestIntervalMs: 5000,
        storeImages: false,
      });
    });
  });
});

describe('Nhật ký thao tác', () => {
  const ctx = (req: Record<string, unknown>, statusCode = 200) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ statusCode }),
      }),
    }) as never;

  it('ghi tên trường, không ghi mật khẩu hay token', async () => {
    const record = jest.fn(async () => undefined);
    const interceptor = new AuditInterceptor({ record } as never);
    const req = {
      method: 'POST',
      url: '/settings/telegram',
      route: { path: '/settings/telegram' },
      params: {},
      body: { botToken: '123:SECRET', chatId: '-1', password: 'hunter2' },
      ip: '127.0.0.1',
      user: { id: 'u1', email: 'admin@x.vn' },
    };
    await lastValueFrom(
      interceptor.intercept(ctx(req), { handle: () => of({ ok: true }) }),
    );
    expect(record).toHaveBeenCalledTimes(1);
    const entry = (record.mock.calls[0] as unknown[])[0];
    expect(entry).toMatchObject({
      action: 'POST /settings/telegram',
      userEmail: 'admin@x.vn',
      fields: ['botToken', 'chatId', 'password'],
      success: true,
    });
    expect(JSON.stringify(entry)).not.toMatch(/SECRET|hunter2/);
  });

  it('đăng nhập sai cũng được ghi, kèm email đã nhập', async () => {
    const record = jest.fn(async () => undefined);
    const interceptor = new AuditInterceptor({ record } as never);
    const req = {
      method: 'POST',
      url: '/auth/login',
      route: { path: '/auth/login' },
      body: { email: 'Admin@X.vn ', password: 'wrong' },
    };
    const err = Object.assign(new Error('Email or password is incorrect.'), {});
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx(req), {
          handle: () => throwError(() => err),
        }),
      ),
    ).rejects.toThrow();
    expect((record.mock.calls[0] as unknown[])[0]).toMatchObject({
      action: 'auth.login',
      userEmail: 'admin@x.vn',
      success: false,
    });
  });

  it('không ghi request chỉ đọc', async () => {
    const record = jest.fn(async () => undefined);
    const interceptor = new AuditInterceptor({ record } as never);
    await lastValueFrom(
      interceptor.intercept(ctx({ method: 'GET', url: '/settings' }), {
        handle: () => of(1),
      }),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('request bị chặn vì thiếu header CSRF được báo để ghi nhật ký', () => {
    const onBlocked = jest.fn();
    const mw = createCsrfMiddleware(onBlocked);
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();
    const req = (method: string, header?: string) =>
      ({ method, get: () => header }) as never;
    mw(req('POST'), res as never, next);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    mw(req('POST', 'XMLHttpRequest'), res as never, next);
    mw(req('GET'), res as never, next);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('đăng nhập bị giới hạn tốc độ (429) được ghi nhật ký, kèm email đã nhập', () => {
    const record = jest.fn(async () => undefined);
    const filter = new AuditThrottleFilter({ record } as never);
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const req = {
      method: 'POST',
      url: '/auth/login',
      route: { path: '/auth/login' },
      body: { email: 'a@b.vn', password: 'guess' },
    };
    filter.catch(new ThrottlerException(), {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as never);
    expect(res.status).toHaveBeenCalledWith(429);
    const entry = (record.mock.calls[0] as unknown[])[0];
    expect(entry).toMatchObject({
      action: 'auth.login',
      userEmail: 'a@b.vn',
      statusCode: 429,
      success: false,
    });
    expect(JSON.stringify(entry)).not.toContain('guess');
  });
});
