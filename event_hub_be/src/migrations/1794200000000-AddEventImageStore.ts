import { MigrationInterface, QueryRunner } from 'typeorm';

/** Thêm cột theo dõi ảnh thu nhỏ đã lưu về máy chủ. Cột `image` (link gốc) giữ nguyên. */
export class AddEventImageStore1794200000000 implements MigrationInterface {
  name = 'AddEventImageStore1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD "imageStoredPath" character varying(80)`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD "imageStoredAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD "imageStoreStatus" character varying(16)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "imageStoreStatus"`,
    );
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "imageStoredAt"`);
    await queryRunner.query(
      `ALTER TABLE "events" DROP COLUMN "imageStoredPath"`,
    );
  }
}
