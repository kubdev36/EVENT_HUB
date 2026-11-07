import { MigrationInterface, QueryRunner } from 'typeorm';

export class Baseline1794020175742 implements MigrationInterface {
  name = 'Baseline1794020175742';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent: DB cũ tạo bằng synchronize đã có sẵn bảng và index cùng tên.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'staff'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'staff', "isActive" boolean NOT NULL DEFAULT true, "department" character varying DEFAULT 'MKT', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" character varying NOT NULL, "sourceName" character varying NOT NULL, "origin" character varying NOT NULL DEFAULT 'crawler', "sourceUrl" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "image" text, "url" character varying NOT NULL, "eventDate" TIMESTAMP, "eventTime" text, "type" character varying(64) NOT NULL, "rawData" jsonb, "contentHash" character varying(128) NOT NULL, "firstSeenAt" TIMESTAMP, "lastSeenAt" TIMESTAMP, "notifiedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_25dddf6fbce46366541ce4a8b6" ON "events"  ("sourceId", "eventDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_3daa90d5eb63e0bb9bdc3dbf7c" ON "events"  ("origin") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_5c751ba5c02239663b81996563" ON "events"  ("type") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_04f99148b76e90e91f4005bba5" ON "events"  ("sourceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_3aea230d5fdbdc53ce3bf9091e" ON "events"  ("eventDate") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_1dbed2c00db63a41834e3fc511" ON "events"  ("contentHash") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_783e9c8ca0eb83b33005fa1f58" ON "events"  ("sourceId", "url") `,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "crawler_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" character varying NOT NULL, "sourceName" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'running', "itemsFound" integer NOT NULL DEFAULT '0', "newItems" integer NOT NULL DEFAULT '0', "errorMessage" text, "startedAt" TIMESTAMP, "finishedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d48246d557c71f11e2f95c77cc6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying NOT NULL, "value" jsonb, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c8639b7626fa94ba8265628f214" UNIQUE ("key"), CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(`DROP TABLE "crawler_runs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_783e9c8ca0eb83b33005fa1f58"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1dbed2c00db63a41834e3fc511"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3aea230d5fdbdc53ce3bf9091e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_04f99148b76e90e91f4005bba5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5c751ba5c02239663b81996563"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3daa90d5eb63e0bb9bdc3dbf7c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_25dddf6fbce46366541ce4a8b6"`,
    );
    await queryRunner.query(`DROP TABLE "events"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
