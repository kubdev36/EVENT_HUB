/** Link đã thấy trong sitemap của từng nguồn, để chỉ báo trang mới xuất hiện. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSitemapSeenUrls1794600000000 implements MigrationInterface {
  name = 'CreateSitemapSeenUrls1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sitemap_seen_urls" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" character varying(128) NOT NULL, "sitemapUrl" character varying(2048) NOT NULL, "url" character varying(2048) NOT NULL, "lastmod" TIMESTAMP WITH TIME ZONE, "firstSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_sitemap_seen_urls" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_sitemap_seen_urls_source_url" ON "sitemap_seen_urls" ("sourceId", "url")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sitemap_seen_urls_source_sitemap" ON "sitemap_seen_urls" ("sourceId", "sitemapUrl")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_sitemap_seen_urls_source_sitemap"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_sitemap_seen_urls_source_url"`,
    );
    await queryRunner.query(`DROP TABLE "sitemap_seen_urls"`);
  }
}
