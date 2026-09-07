import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Role } from '../../auth/enums/role.enum.js';
import { User } from '../../auth/entity/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll() {
    return this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.role', 'user.department', 'user.isActive', 'user.createdAt', 'user.updatedAt'])
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  async create(dto: any) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userRepository.findOne({ where: { email } });

    if (existing) {
      throw new BadRequestException('Email already exists.');
    }

    const hashedPassword = await bcrypt.hash(dto.password || 'EventHub@2026', 10);
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

    if (dto.password && !String(dto.password).includes('•')) {
      user.password = await bcrypt.hash(dto.password, 10);
    }

    return this.userRepository.save(user);
  }

  async resetPassword(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Account not found.');

    user.password = await bcrypt.hash('EventHub@2026', 10);
    await this.userRepository.save(user);

    return { message: 'Password reset successfully to EventHub@2026' };
  }

  async delete(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Account not found.');

    await this.userRepository.delete(id);
    return { message: 'Account deleted successfully.' };
  }
}
