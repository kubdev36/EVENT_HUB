import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/entity/user.entity.js';

/**
 * Refresh token của một phiên đăng nhập. Chỉ lưu sha256 của token, không lưu token thật.
 * Mỗi lần làm mới, token cũ được đánh dấu usedAt và cấp token mới cùng familyId (xoay vòng).
 * Token đã dùng mà bị gửi lại là dấu hiệu bị đánh cắp: thu hồi cả family.
 */
@Entity('refresh_tokens')
@Index(['userId'])
@Index(['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  /** Chuỗi token sinh ra từ cùng một lần đăng nhập. */
  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Thời điểm token đã được đổi lấy token mới. */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
