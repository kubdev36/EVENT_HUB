/** Hàng chờ thông báo (outbox) cho Telegram; chuyển bài đang chờ gửi từ luồng cũ sang. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationOutbox1794500000000 implements MigrationInterface {
  name = 'CreateNotificationOutbox1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_outbox" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "eventId" uuid NOT NULL, "channel" character varying(16) NOT NULL DEFAULT 'telegram', "status" character varying(16) NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lockedUntil" TIMESTAMP WITH TIME ZONE, "lastError" character varying(500), "sentAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_83d47c7dba1da2d038749fe757e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a1ae5413f0c15b23a392ea8f97" ON "notification_outbox"  ("status", "nextAttemptAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0fd45c82e6847f2c785ed560c2" ON "notification_outbox"  ("eventId", "channel") `,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" ADD CONSTRAINT "FK_fca8cbfac1fd0156d59b5645742" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Bài đã rõ ngày mà chưa thông báo (luồng cũ quét notifiedAt) chuyển vào hàng chờ, không mất thông báo.
    await queryRunner.query(
      `INSERT INTO "notification_outbox" ("eventId", "channel") SELECT "id", 'telegram' FROM "events" WHERE "notifiedAt" IS NULL AND "dateUnknown" = false ON CONFLICT DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification_outbox" DROP CONSTRAINT "FK_fca8cbfac1fd0156d59b5645742"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0fd45c82e6847f2c785ed560c2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a1ae5413f0c15b23a392ea8f97"`,
    );
    await queryRunner.query(`DROP TABLE "notification_outbox"`);
  }
}
