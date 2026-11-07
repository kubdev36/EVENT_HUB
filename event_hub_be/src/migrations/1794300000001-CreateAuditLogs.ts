import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1794300000001 implements MigrationInterface {
  name = 'CreateAuditLogs1794300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, "userEmail" character varying(255), "action" character varying(128) NOT NULL, "target" character varying(255), "fields" jsonb, "ip" character varying(64), "statusCode" integer NOT NULL, "success" boolean NOT NULL, "errorMessage" character varying(500), CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c69efb19bf127c97e6740ad530" ON "audit_logs" ("createdAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_c69efb19bf127c97e6740ad530"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
