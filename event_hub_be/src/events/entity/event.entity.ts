import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('events')
@Index(['sourceId', 'url'], { unique: true })
@Index(['contentHash'], { unique: true })
@Index(['eventDate'])
@Index(['sourceId'])
@Index(['type'])
@Index(['origin'])
@Index(['sourceId', 'eventDate'])
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

  @Column()
  url: string;

  @Column({ type: 'timestamp', nullable: true })
  eventDate: Date | null;

  @Column({ type: 'text', nullable: true })
  eventTime: string | null;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 128 })
  contentHash: string;

  @Column({ type: 'timestamp', nullable: true })
  firstSeenAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  notifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
