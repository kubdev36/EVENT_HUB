import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('crawler_sources')
export class CrawlerSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  logo: string | null;

  @Column({ default: true })
  enabled: boolean;

  @Column({ default: '6h' })
  interval: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  targetUrls: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
