import { jest } from '@jest/globals';
import {
  Controller,
  HttpCode,
  INestApplication,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { LOGIN_THROTTLERS } from './auth/login-throttle.js';
import { ROLES_KEY } from './auth/decorators/roles.decorator.js';
import { Role } from './auth/enums/role.enum.js';
import { validateEnv } from './config/env.validation.js';
import { CrawlerController } from './crawlers/controller/crawler.controller.js';
import { CrawlerHttpClient } from './crawlers/engine/crawler-http.client.js';
import {
  assertPublicHttpUrl,
  isNonPublicIp,
} from './crawlers/helpers/url-guard.helper.js';
import { EventsService } from './events/service/events.service.js';

const publicResolver = async () => ['93.184.216.34'];

describe('Chống SSRF', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '224.0.0.1',
  ])('chặn IP nội bộ %s', (ip) => {
    expect(isNonPublicIp(ip)).toBe(true);
  });

  it.each(['93.184.216.34', '1.1.1.1', '172.32.0.1', '2606:4700::1111'])(
    'cho phép IP công khai %s',
    (ip) => {
      expect(isNonPublicIp(ip)).toBe(false);
    },
  );

  it.each([
    ['file:///etc/passwd', 'http'],
    ['http://localhost:3000/', 'nội bộ'],
    ['http://user:pass@shop.vn/', 'đăng nhập'],
    ['http://169.254.169.254/latest/meta-data', 'IP nội bộ'],
    ['http://[::1]/', 'IP nội bộ'],
  ])('từ chối %s', async (url, reason) => {
    await expect(assertPublicHttpUrl(url, publicResolver)).rejects.toThrow(
      reason,
    );
  });

  it('từ chối domain công khai nhưng phân giải ra IP nội bộ', async () => {
    await expect(
      assertPublicHttpUrl('https://evil.example/', async () => ['10.0.0.5']),
    ).rejects.toThrow('IP nội bộ');
  });

  it('cho phép URL công khai', async () => {
    await expect(
      assertPublicHttpUrl('https://fptshop.com.vn/tin-tuc', publicResolver),
    ).resolves.toBeInstanceOf(URL);
  });

  describe('chuyển hướng', () => {
    afterEach(() => jest.restoreAllMocks());

    it('không đi theo chuyển hướng tới địa chỉ metadata', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data' },
        }),
      );
      const client = new CrawlerHttpClient();
      client.resolveHost = publicResolver;
      const result = await client.fetchPage('https://shop.vn/tin-tuc/');
      expect(result).toMatchObject({
        kind: 'failed',
        reason: expect.stringContaining('169.254.169.254'),
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('đi theo chuyển hướng hợp lệ và trả URL cuối', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(null, {
            status: 301,
            headers: { location: '/tin-tuc/moi' },
          }),
        )
        .mockResolvedValueOnce(
          new Response('<html>ok</html>', { status: 200 }),
        );
      const client = new CrawlerHttpClient();
      client.resolveHost = publicResolver;
      const result = await client.fetchPage('https://shop.vn/tin-tuc/');
      expect(result).toMatchObject({
        kind: 'ok',
        url: 'https://shop.vn/tin-tuc/moi',
      });
    });
  });
});

describe('Phân quyền', () => {
  const service = new EventsService(
    {} as never,
    { findOne: async () => null } as never,
  );

  it('thiếu user thì từ chối, không cho xem hết', async () => {
    await expect(service.getAllowedTypes(undefined)).resolves.toEqual([]);
  });

  it('role lạ thì từ chối', async () => {
    await expect(
      service.getAllowedTypes({ id: '1', email: 'a', role: 'guest' as Role }),
    ).resolves.toEqual([]);
  });

  it('admin xem tất cả', async () => {
    await expect(
      service.getAllowedTypes({ id: '1', email: 'a', role: Role.ADMIN }),
    ).resolves.toBeNull();
  });

  it('staff không có phòng ban thì không xem được gì', async () => {
    await expect(
      service.getAllowedTypes({
        id: '1',
        email: 'a',
        role: Role.STAFF,
        department: null,
      }),
    ).resolves.toEqual([]);
  });

  it('chỉ admin được chạy crawl, và không còn route GET để chạy crawl', () => {
    const proto = CrawlerController.prototype as unknown as Record<
      string,
      object
    >;
    for (const name of ['runAll', 'runOne']) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[name])).toEqual([Role.ADMIN]);
    }
    const getRoutes = Object.getOwnPropertyNames(CrawlerController.prototype)
      .map((name) => proto[name])
      .filter(
        (fn) =>
          typeof fn === 'function' && Reflect.getMetadata('method', fn) === 0,
      )
      .map((fn) => Reflect.getMetadata('path', fn));
    expect(getRoutes).not.toContain('run');
  });
});

describe('Giới hạn đăng nhập', () => {
  @Controller('auth')
  class FakeAuthController {
    @Post('login')
    @UseGuards(ThrottlerGuard)
    @HttpCode(200)
    login() {
      return { ok: true };
    }
  }

  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: LOGIN_THROTTLERS })],
      controllers: [FakeAuthController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('khóa sau 5 lần với cùng một email, email khác vẫn đăng nhập được', async () => {
    const login = (email: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'x' });
    for (let i = 0; i < 5; i += 1)
      expect((await login('A@shop.vn')).status).toBe(200);
    expect((await login(' a@shop.vn ')).status).toBe(429);
    expect((await login('b@shop.vn')).status).toBe(200);
  });
});

describe('Kiểm tra biến môi trường', () => {
  const base = {
    DB_HOST: 'db',
    DB_PORT: '5432',
    DB_USERNAME: 'u',
    DB_PASSWORD: 'p',
    DB_NAME: 'n',
    jwt_token: 'x'.repeat(40),
  };

  it('thiếu secret thì không khởi động', () => {
    expect(() => validateEnv({ ...base, jwt_token: '' })).toThrow('jwt_token');
  });

  it('production từ chối secret mặc định và JWT ngắn', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://a.vn',
        INIT_ADMIN_PASSWORD: '123456',
      }),
    ).toThrow('INIT_ADMIN_PASSWORD');
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://a.vn',
        jwt_token: 'short',
      }),
    ).toThrow('32 ký tự');
  });

  it('cấu hình hợp lệ thì chạy', () => {
    expect(
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://a.vn',
        SETTINGS_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
        PASSWORD_PEPPER: 'p'.repeat(40),
      }),
    ).toBeTruthy();
  });

  it('production thiếu khóa mã hóa hoặc khóa sai độ dài thì không khởi động', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://a.vn',
    };
    expect(() => validateEnv(prod)).toThrow('SETTINGS_ENC_KEY');
    expect(() => validateEnv({ ...base, SETTINGS_ENC_KEY: 'abc' })).toThrow(
      '32 byte',
    );
  });
});

describe('PASSWORD_PEPPER', () => {
  const base = {
    DB_HOST: 'db',
    DB_PORT: '5432',
    DB_USERNAME: 'u',
    DB_PASSWORD: 'p',
    DB_NAME: 'n',
    jwt_token: 'x'.repeat(40),
  };
  it('production thiếu pepper thì không khởi động; pepper ngắn thì báo lỗi', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://a.vn',
      SETTINGS_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
    };
    expect(() => validateEnv(prod)).toThrow('PASSWORD_PEPPER');
    expect(() => validateEnv({ ...base, PASSWORD_PEPPER: 'ngan' })).toThrow(
      '32 ký tự',
    );
  });
});
