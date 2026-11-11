/** Cờ buộc đổi mật khẩu tạm (do admin đặt) ở lần đăng nhập kế tiếp. Tài khoản đang có giữ false. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMustChangePassword1794700000000 implements MigrationInterface {
  name = 'AddMustChangePassword1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "mustChangePassword" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "mustChangePassword"`,
    );
  }
}
