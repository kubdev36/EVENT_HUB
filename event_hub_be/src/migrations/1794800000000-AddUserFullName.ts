/** Họ tên hiển thị của tài khoản. Tài khoản cũ để trống (giao diện hiện email thay thế). */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserFullName1794800000000 implements MigrationInterface {
  name = 'AddUserFullName1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "fullName" character varying(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "fullName"`);
  }
}
