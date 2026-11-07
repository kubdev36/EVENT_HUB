import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDateUnknownExternalIdRunMetrics1794020219836 implements MigrationInterface {
  name = 'AddDateUnknownExternalIdRunMetrics1794020219836';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD "dateUnknown" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD "externalId" character varying(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "crawler_runs" ADD "requestCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "crawler_runs" ADD "durationMs" integer`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b4720d4fbd006edc4b65a4969b" ON "events"  ("sourceId", "externalId") WHERE "externalId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b4720d4fbd006edc4b65a4969b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crawler_runs" DROP COLUMN "durationMs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crawler_runs" DROP COLUMN "requestCount"`,
    );
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "externalId"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "dateUnknown"`);
  }
}
