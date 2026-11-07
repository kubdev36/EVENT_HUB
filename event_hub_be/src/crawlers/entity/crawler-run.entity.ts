import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** partial: một số URL lỗi/bị chặn; blocked: mọi URL bị chặn; failed: lỗi khác. */
export type CrawlerRunStatus =
  'running' | 'success' | 'partial' | 'blocked' | 'failed';

@Entity('crawler_runs')
export class CrawlerRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sourceId: string;

  @Column()
  sourceName: string;

  @Column({ default: 'running' })
  status: CrawlerRunStatus;

  @Column({ type: 'int', default: 0 })
  itemsFound: number;

  @Column({ type: 'int', default: 0 })
  newItems: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /** Số HTTP request đã gửi trong lần chạy (đo baseline). */
  @Column({ type: 'int', default: 0 })
  requestCount: number;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
