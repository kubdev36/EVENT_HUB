import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../auth/enums/role.enum.js';
import { User } from '../entity/user.entity.js';
import { SessionService } from '../../auth/service/session.service.js';
import { PasswordHasher } from '../../auth/password-hasher.js';

/** Không bao giờ trả mã băm mật khẩu ra ngoài (select: false chỉ áp dụng khi đọc từ DB). */
function withoutPassword(user: User): Omit<User, 'password'> {
  const { password: _password, ...rest } = user;
  return rest;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly sessions: SessionService,
    private readonly hasher: PasswordHasher,
  ) {}

  async findAll() {
    return this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.role',
        'user.department',
        'user.isActive',
        'user.createdAt',
        'user.updatedAt',
      ])
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  async create(dto: any) {
    const role = dto.role === undefined ? Role.STAFF : parseRole(dto.role);
    if (!role) throw new BadRequestException(INVALID_ROLE);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email đã tồn tại.');
    }

    // Không nhập mật khẩu thì sinh ngẫu nhiên, chỉ trả về một lần trong response này.
    const generated = dto.password ? null : generatePassword();
    const user = this.userRepository.create({
      email,
      password: await this.hasher.hash(dto.password || generated),
      role,
      department: dto.department || 'MKT',
    });

    const saved = withoutPassword(await this.userRepository.save(user));
    return generated ? { ...saved, generatedPassword: generated } : saved;
  }

  /** actorId: admin đang thao tác; không được tự hạ quyền, và luôn phải còn ít nhất một admin. */
  async update(id: string, dto: any, actorId?: string) {
    const nextRole = dto.role === undefined ? undefined : parseRole(dto.role);
    if (nextRole === null) throw new BadRequestException(INVALID_ROLE);

    const { saved, revoke } = await this.userRepository.manager.transaction(
      async (em) => {
        const repo = em.getRepository(User);
        const user = await repo.findOne({ where: { id } });
        if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');

        let revoke = false;
        if (nextRole && nextRole !== user.role) {
          if (user.role === Role.ADMIN) {
            if (id === actorId)
              throw new BadRequestException(
                'Không thể tự hạ quyền admin của chính mình.',
              );
            await assertAnotherAdmin(repo, id);
          }
          user.role = nextRole;
          revoke = true;
        }

        if (dto.department && dto.department !== user.department) {
          user.department = dto.department;
          revoke = true;
        }

        const passwordChanged = Boolean(
          dto.password && !String(dto.password).includes('•'),
        );
        if (passwordChanged) {
          user.password = await this.hasher.hash(dto.password);
          revoke = true;
        }
        return { saved: await repo.save(user), revoke };
      },
    );
    // Đổi mật khẩu, vai trò hoặc bộ phận thì đăng xuất mọi phiên đang mở của tài khoản đó.
    if (revoke) await this.sessions.revokeAllForUser(saved.id);
    return withoutPassword(saved);
  }

  /** Đặt mật khẩu ngẫu nhiên mới; chỉ trả về một lần cho admin, không ghi log. */
  async resetPassword(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');

    const password = generatePassword();
    user.password = await this.hasher.hash(password);
    await this.userRepository.save(user);
    await this.sessions.revokeAllForUser(user.id);

    return { message: 'Đã đặt lại mật khẩu.', password };
  }

  async delete(id: string, actorId?: string) {
    await this.userRepository.manager.transaction(async (em) => {
      const repo = em.getRepository(User);
      const user = await repo.findOne({ where: { id } });
      if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
      if (id === actorId)
        throw new BadRequestException('Không thể tự xóa tài khoản của chính mình.');
      if (user.role === Role.ADMIN) await assertAnotherAdmin(repo, id);
      await repo.delete(id);
    });
    return { message: 'Đã xóa tài khoản.' };
  }
}

const INVALID_ROLE = 'Vai trò không hợp lệ (chỉ nhận admin hoặc staff).';

function parseRole(value: unknown): Role | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === Role.ADMIN) return Role.ADMIN;
  if (v === Role.STAFF) return Role.STAFF;
  return null;
}

/**
 * Khóa các dòng admin đang hoạt động (FOR UPDATE) rồi kiểm tra còn admin khác ngoài excludeId.
 * Khóa giúp hai yêu cầu hạ quyền/xóa chạy song song không cùng lọt qua.
 */
async function assertAnotherAdmin(repo: Repository<User>, excludeId: string) {
  const admins = await repo
    .createQueryBuilder('u')
    .select(['u.id'])
    .where('u.role = :role AND u.isActive = true', { role: Role.ADMIN })
    .setLock('pessimistic_write')
    .getMany();
  if (!admins.some((a) => a.id !== excludeId))
    throw new BadRequestException('Phải còn ít nhất một admin đang hoạt động.');
}

const PASSWORD_CHARS =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Mật khẩu ngẫu nhiên từ crypto.randomInt, bỏ ký tự dễ nhầm (0/O, 1/l/I). */
export function generatePassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++)
    out += PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)];
  return out;
}
