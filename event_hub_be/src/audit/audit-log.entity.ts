import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Nhật ký thao tác ghi dữ liệu và đăng nhập. Không lưu mật khẩu, token hay nội dung body. */
@Entity('audit_logs')
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** Email người thao tác; với đăng nhập là email được nhập (kể cả khi sai). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  userEmail: string | null;

  /** Ví dụ "POST /settings/telegram", "auth.login". */
  @Column({ type: 'varchar', length: 128 })
  action: string;

  /** id trong đường dẫn (vd. user hoặc nguồn bị sửa). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  target: string | null;

  /** Tên các trường gửi lên, không có giá trị. */
  @Column({ type: 'jsonb', nullable: true })
  fields: string[] | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'int' })
  statusCode: number;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage: string | null;
}
