import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, LessThan, Repository } from 'typeorm';
import { User } from '../../users/entity/user.entity.js';
import { RefreshToken } from '../refresh-token.entity.js';
import { REFRESH_MAX_AGE_MS } from '../session-cookie.js';

/**
 * Hai tab cùng làm mới bằng một token gần như cùng lúc: tab sau thấy token vừa được dùng.
 * Trong khoảng này coi là bình thường (không thu hồi), tab đó dùng cookie mới tab kia đã nhận.
 */
const CONCURRENT_REFRESH_GRACE_MS = 15_000;

export type SessionUser = Pick<User, 'id' | 'email' | 'role' | 'department'> &
  Partial<Pick<User, 'mustChangePassword'>>;
export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
};

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  static hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Cấp access token (JWT ngắn hạn) và refresh token mới; familyId giữ nguyên khi xoay vòng. */
  async issue(
    user: SessionUser,
    familyId: string = randomUUID(),
    now = new Date(),
  ): Promise<IssuedSession> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.tokens.insert({
      userId: user.id,
      tokenHash: SessionService.hash(refreshToken),
      familyId,
      expiresAt: new Date(now.getTime() + REFRESH_MAX_AGE_MS),
      usedAt: null,
      revokedAt: null,
    });
    // Dọn token hết hạn của user này (ít dòng, không cần job riêng).
    await this.tokens.delete({ userId: user.id, expiresAt: LessThan(now) });
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        department: user.department,
        mustChangePassword: Boolean(user.mustChangePassword),
      },
    };
  }

  /**
   * Đổi refresh token lấy cặp token mới. Token không tồn tại, hết hạn, bị thu hồi hoặc user bị khóa
   * thì 401. Token đã dùng bị gửi lại (ngoài khoảng chờ) thì thu hồi cả family.
   */
  async rotate(raw: string | null, now = new Date()): Promise<IssuedSession> {
    if (!raw) throw new UnauthorizedException('Chưa đăng nhập.');
    const token = await this.tokens.findOne({
      where: { tokenHash: SessionService.hash(raw) },
    });
    if (!token || token.revokedAt || token.expiresAt <= now)
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');

    if (token.usedAt) {
      if (now.getTime() - token.usedAt.getTime() <= CONCURRENT_REFRESH_GRACE_MS)
        throw new UnauthorizedException('Phiên vừa được làm mới ở tab khác.');
      await this.revokeFamily(token.familyId, now);
      this.logger.warn(
        `Refresh token đã dùng bị gửi lại (user ${token.userId}): thu hồi cả phiên.`,
      );
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
    }

    // Đánh dấu đã dùng có điều kiện, chống hai request cùng đổi một token.
    const claimed = await this.tokens.update(
      { id: token.id, usedAt: IsNull(), revokedAt: IsNull() },
      { usedAt: now },
    );
    if (!claimed.affected)
      throw new UnauthorizedException('Phiên vừa được làm mới ở tab khác.');

    const user = await this.users.findOne({ where: { id: token.userId } });
    if (!user || !user.isActive) {
      await this.revokeFamily(token.familyId, now);
      throw new UnauthorizedException('Tài khoản không còn hoạt động.');
    }
    return this.issue(user, token.familyId, now);
  }

  /** Đăng xuất: thu hồi cả chuỗi token của phiên này. Token không hợp lệ thì bỏ qua. */
  async revoke(raw: string | null, now = new Date()): Promise<void> {
    if (!raw) return;
    const token = await this.tokens.findOne({
      where: { tokenHash: SessionService.hash(raw) },
    });
    if (token) await this.revokeFamily(token.familyId, now);
  }

  /** Thu hồi mọi phiên của user (vd. khi đổi mật khẩu, khóa tài khoản). */
  async revokeAllForUser(userId: string, now = new Date()): Promise<void> {
    await this.tokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: now },
    );
  }

  private async revokeFamily(familyId: string, now: Date) {
    await this.tokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: now },
    );
  }
}
