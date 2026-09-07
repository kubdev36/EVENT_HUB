import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('settings')
export class Setting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Key-value lưu các cấu hình dạng JSON: 'crawler_sources', 'telegram_config', 'keyword_rules'
  @Column({ unique: true })
  key: string;

  @Column({ type: 'jsonb', nullable: true })
  value: any;

  @UpdateDateColumn()
  updatedAt: Date;
}