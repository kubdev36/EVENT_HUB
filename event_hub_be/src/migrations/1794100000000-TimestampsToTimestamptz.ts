import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chuyển các cột thời gian từ `timestamp` (không múi giờ) sang `timestamptz`.
 *
 * Trước migration, giá trị lưu là giờ địa phương của nơi ghi: backend (Node) và Postgres
 * (now()) đều chạy ở UTC+7 (đã kiểm tra ngày 07/11/2026: Node offset +420 phút, Postgres
 * TimeZone = Asia/Bangkok). Vì vậy mọi giá trị cũ được hiểu là giờ Việt Nam.
 * Nếu một môi trường từng ghi dữ liệu bằng backend chạy UTC (vd. Docker), phải kiểm tra
 * và điều chỉnh trước khi chạy.
 */
const COLUMNS: Array<[table: string, column: string]> = [
  ['events', 'eventDate'],
  ['events', 'firstSeenAt'],
  ['events', 'lastSeenAt'],
  ['events', 'notifiedAt'],
  ['events', 'createdAt'],
  ['events', 'updatedAt'],
  ['crawler_runs', 'startedAt'],
  ['crawler_runs', 'finishedAt'],
  ['crawler_runs', 'createdAt'],
  ['crawler_runs', 'updatedAt'],
  ['users', 'createdAt'],
  ['users', 'updatedAt'],
  ['settings', 'updatedAt'],
];
const SOURCE_TZ = 'Asia/Ho_Chi_Minh';

export class TimestampsToTimestamptz1794100000000 implements MigrationInterface {
  name = 'TimestampsToTimestamptz1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE timestamptz USING "${column}" AT TIME ZONE '${SOURCE_TZ}'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of [...COLUMNS].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE timestamp USING "${column}" AT TIME ZONE '${SOURCE_TZ}'`,
      );
    }
  }
}
