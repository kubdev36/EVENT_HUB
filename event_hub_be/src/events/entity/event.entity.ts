import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ImageStoreStatus = 'stored' | 'failed' | 'blocked' | 'skipped';

@Entity('events')
@Index(['sourceId', 'url'], { unique: true })
@Index(['contentHash'], { unique: true })
@Index(['eventDate'])
@Index(['sourceId'])
@Index(['type'])
@Index(['origin'])
@Index(['sourceId', 'eventDate'])
@Index(['sourceId', 'externalId'], {
  unique: true,
  where: '"externalId" IS NOT NULL',
})
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sourceId: string;

  @Column()
  sourceName: string;

  @Column({ default: 'crawler' })
  origin: 'manual' | 'crawler';

  @Column()
  sourceUrl: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  image: string | null;

  /** Tên file ảnh thu nhỏ đã lưu (`<sha256>.webp`); null khi chưa lưu. Link gốc vẫn ở `image`. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  imageStoredPath: string | null;

  /** Lần thử lưu ảnh gần nhất. */
  @Column({ type: 'timestamptz', nullable: true })
  imageStoredAt: Date | null;

  /** Kết quả lưu ảnh: stored | failed | blocked | skipped; null khi chưa thử. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  imageStoreStatus: ImageStoreStatus | null;

  @Column()
  url: string;

  @Column({ type: 'timestamptz', nullable: true })
  eventDate: Date | null;

  @Column({ type: 'text', nullable: true })
  eventTime: string | null;

  /** true khi không tìm được ngày đăng thật; khi đó eventDate để null, không dùng ngày crawl. */
  @Column({ type: 'boolean', default: false })
  dateUnknown: boolean;

  /** ID ổn định phía nguồn (vd. adArchiveID của Meta) để dedupe khi nhiều item chung URL. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  externalId: string | null;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 128 })
  contentHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  firstSeenAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
