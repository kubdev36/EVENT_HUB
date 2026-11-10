import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Link đã thấy trong sitemap của một nguồn; link chưa có ở đây là trang mới. */
@Entity('sitemap_seen_urls')
@Index('UQ_sitemap_seen_urls_source_url', ['sourceId', 'url'], {
  unique: true,
})
@Index('IDX_sitemap_seen_urls_source_sitemap', ['sourceId', 'sitemapUrl'])
export class SitemapSeenUrl {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  sourceId: string;

  /** Sitemap đã liệt kê link (để biết sitemap nào đã có lần chạy đầu). */
  @Column({ type: 'varchar', length: 2048 })
  sitemapUrl: string;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  /** lastmod lúc thấy link; chỉ tham khảo, không phải ngày đăng. */
  @Column({ type: 'timestamptz', nullable: true })
  lastmod: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  firstSeenAt: Date;
}
