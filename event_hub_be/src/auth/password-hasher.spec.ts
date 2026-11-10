import { jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { PasswordHasher } from './password-hasher.js';
import { AuthService } from './service/auth.service.js';

const PEPPER = 'p'.repeat(40); // pepper giả cho test

describe('PasswordHasher (pepper)', () => {
  it('băm có pepper: tiền tố p1$, đúng mật khẩu thì khớp, sai thì không', async () => {
    const h = new PasswordHasher(PEPPER);
    const stored = await h.hash('Mat-khau-1');
    expect(stored.startsWith('p1$')).toBe(true);
    expect(await h.verify('Mat-khau-1', stored)).toEqual({
      ok: true,
      needsUpgrade: false,
    });
    expect((await h.verify('mat-khau-1', stored)).ok).toBe(false);
  });

  it('thiếu pepper hoặc sai pepper thì mã băm có pepper không khớp (lộ DB không đủ để dò)', async () => {
    const stored = await new PasswordHasher(PEPPER).hash('Mat-khau-1');
    expect(
      (await new PasswordHasher(undefined).verify('Mat-khau-1', stored)).ok,
    ).toBe(false);
    expect(
      (await new PasswordHasher('q'.repeat(40)).verify('Mat-khau-1', stored))
        .ok,
    ).toBe(false);
    // Không có pepper thì so khớp trực tiếp với phần bcrypt cũng không được.
    expect(await bcrypt.compare('Mat-khau-1', stored.slice(3))).toBe(false);
  });

  it('mã băm kiểu cũ (bcrypt mật khẩu thô) vẫn đăng nhập được và báo cần nâng cấp', async () => {
    const legacy = await bcrypt.hash('Mat-khau-1', 4);
    expect(
      await new PasswordHasher(PEPPER).verify('Mat-khau-1', legacy),
    ).toEqual({ ok: true, needsUpgrade: true });
    expect(
      await new PasswordHasher(undefined).verify('Mat-khau-1', legacy),
    ).toEqual({ ok: true, needsUpgrade: false });
  });

  it('chưa cấu hình pepper thì băm kiểu cũ (dev vẫn chạy)', async () => {
    const stored = await new PasswordHasher(undefined).hash('x123456');
    expect(stored.startsWith('p1$')).toBe(false);
    expect(await bcrypt.compare('x123456', stored)).toBe(true);
  });
});

describe('AuthService.login nâng cấp mật khẩu kiểu cũ', () => {
  it('đăng nhập đúng với mã băm cũ thì lưu lại mã băm có pepper', async () => {
    const user = {
      id: 'u1',
      email: 'a@b.vn',
      role: 'admin',
      department: null,
      isActive: true,
      password: await bcrypt.hash('Mat-khau-1', 4),
    };
    const update = jest.fn(async () => undefined);
    const qb = {
      addSelect: () => qb,
      where: () => qb,
      getOne: async () => user,
    };
    const repo = { createQueryBuilder: () => qb, update };
    const hasher = new PasswordHasher(PEPPER);
    const service = new AuthService(repo as never, {} as never, hasher);
    await service.login({ email: 'a@b.vn', password: 'Mat-khau-1' });
    expect(update).toHaveBeenCalledTimes(1);
    const saved = (update.mock.calls[0] as unknown[])[1] as {
      password: string;
    };
    expect(saved.password.startsWith('p1$')).toBe(true);
    expect((await hasher.verify('Mat-khau-1', saved.password)).ok).toBe(true);

    // Sai mật khẩu thì không đổi gì.
    update.mockClear();
    await expect(
      service.login({ email: 'a@b.vn', password: 'sai-mat-khau' }),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
