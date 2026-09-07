import { BadRequestException, Injectable, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { LoginDto } from '../dto/login.dto.js';
import { User } from '../entity/user.entity.js';
import { Role } from '../enums/role.enum.js';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService, // Inject ConfigService để đọc biến môi trường
  ) {}

  // Tự động khởi tạo tài khoản Admin từ .env nếu bảng users chưa có
  async onModuleInit() {
    const adminEmail = this.configService.get<string>('INIT_ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('INIT_ADMIN_PASSWORD');

    if (!adminEmail || !adminPassword) return;

    const email = adminEmail.trim().toLowerCase();
    const existingAdmin = await this.userRepository.findOne({ where: { email } });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const admin = this.userRepository.create({
        email,
        password: hashedPassword,
        role: Role.ADMIN,
      });
      await this.userRepository.save(admin);
    }
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    if (!user.isActive) {
      throw new BadRequestException('Account has been disabled.');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    const payload = { sub: user.id, email: user.email, role: user.role, department: user.department };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      message: 'Login successful',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    };
  }
}
