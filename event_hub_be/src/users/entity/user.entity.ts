import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../auth/enums/role.enum.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  /** Họ tên hiển thị; null với tài khoản cũ. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  fullName: string | null;

  @Column({ select: false })
  password: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.STAFF,
  })
  role: Role;

  @Column({ default: true })
  isActive: boolean;

  /** Mật khẩu hiện tại do admin đặt (tạo mới, reset): phải đổi trước khi dùng hệ thống. */
  @Column({ default: false })
  mustChangePassword: boolean;

  @Column({ nullable: true, default: 'MKT' })
  department: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
