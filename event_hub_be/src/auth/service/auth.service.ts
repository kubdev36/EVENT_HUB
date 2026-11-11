import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PasswordHasher } from '../password-hasher.js';
import { Repository } from 'typeorm';
import { LoginDto } from '../dto/login.dto.js';
import { ChangePasswordDto } from '../dto/change-password.dto.js';
import { User } from '../../users/entity/user.entity.js';
import { Role } from '../enums/role.enum.js';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService, // Inject ConfigService để đọc biến môi trường
    private readonly hasher: PasswordHasher,
  ) {}

  // Tự động khởi tạo tài khoản Admin từ .env nếu bảng users chưa có
  async onModuleInit() {
    const adminEmail = this.configService.get<string>('INIT_ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('INIT_ADMIN_PASSWORD');

    if (!adminEmail || !adminPassword) return;

    const email = adminEmail.trim().toLowerCase();
    const existingAdmin = await this.userRepository.findOne({
      where: { email },
    });

    if (!existingAdmin) {
      const hashedPassword = await this.hasher.hash(adminPassword);
      const admin = this.userRepository.create({
        email,
        password: hashedPassword,
        role: Role.ADMIN,
        // Mật khẩu khởi tạo nằm trong .env: buộc đổi ở lần đăng nhập đầu.
        mustChangePassword: true,
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

    const check = await this.hasher.verify(loginDto.password, user.password);
    if (!check.ok) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    // Mật khẩu còn băm kiểu cũ (chưa có pepper): băm lại ngay khi biết mật khẩu đúng.
    if (check.needsUpgrade) {
      await this.userRepository.update(user.id, {
        password: await this.hasher.hash(loginDto.password),
      });
    }

    // Token do SessionService cấp (access token ngắn hạn + refresh token xoay vòng).
    // mustChangePassword: frontend chuyển sang màn hình đổi mật khẩu; API khác bị chặn ở JwtAuthGuard.
    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        department: user.department,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /**
   * Người dùng tự đổi mật khẩu (kể cả mật khẩu tạm). Kiểm tra mật khẩu hiện tại, mật khẩu mới
   * khác mật khẩu cũ và khác email; xong thì tắt cờ mustChangePassword.
   * Thu hồi phiên cũ và cấp phiên mới do controller làm.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user || !user.isActive)
      throw new UnauthorizedException('Tài khoản không còn hoạt động.');

    const check = await this.hasher.verify(dto.currentPassword, user.password);
    if (!check.ok)
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    if (dto.newPassword === dto.currentPassword)
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    if (dto.newPassword.trim().toLowerCase() === user.email.toLowerCase())
      throw new BadRequestException('Mật khẩu mới không được trùng email.');

    await this.userRepository.update(user.id, {
      password: await this.hasher.hash(dto.newPassword),
      mustChangePassword: false,
    });
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
      mustChangePassword: false,
    };
  }
}
