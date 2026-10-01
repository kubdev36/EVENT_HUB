import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('crawler_runs')
export class CrawlerRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sourceId: string;

  @Column()
  sourceName: string;

  @Column({ default: 'running' })
  status: 'running' | 'success' | 'failed';

  @Column({ type: 'int', default: 0 })
  itemsFound: number;

  @Column({ type: 'int', default: 0 })
  newItems: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
