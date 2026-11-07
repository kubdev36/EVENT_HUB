import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Role } from '../../auth/enums/role.enum.js';
import { User } from '../entity/user.entity.js';
import { SessionService } from '../../auth/service/session.service.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly sessions: SessionService,
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
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userRepository.findOne({ where: { email } });

    if (existing) {
      throw new BadRequestException('Email already exists.');
    }

    const hashedPassword = await bcrypt.hash(
      dto.password || 'EventHub@2026',
      10,
    );
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      role: dto.role?.toLowerCase() === 'admin' ? Role.ADMIN : Role.STAFF,
      department: dto.department || 'MKT',
    });

    return this.userRepository.save(user);
  }

  async update(id: string, dto: any) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Account not found.');

    if (dto.role) {
      user.role = dto.role.toLowerCase() === 'admin' ? Role.ADMIN : Role.STAFF;
    }

    if (dto.department) {
      user.department = dto.department;
    }

    const passwordChanged = Boolean(
      dto.password && !String(dto.password).includes('•'),
    );
    if (passwordChanged) {
      user.password = await bcrypt.hash(dto.password, 10);
    }

    const saved = await this.userRepository.save(user);
    // Đổi mật khẩu thì đăng xuất mọi phiên đang mở của tài khoản đó.
    if (passwordChanged) await this.sessions.revokeAllForUser(user.id);
    return saved;
  }

  async resetPassword(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Account not found.');

    user.password = await bcrypt.hash('EventHub@2026', 10);
    await this.userRepository.save(user);
    await this.sessions.revokeAllForUser(user.id);

    return { message: 'Password reset successfully to EventHub@2026' };
  }

  async delete(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Account not found.');

    await this.userRepository.delete(id);
    return { message: 'Account deleted successfully.' };
  }
}
