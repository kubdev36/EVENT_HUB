import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity.js';

export type AuditEntry = Omit<AuditLog, 'id' | 'createdAt'>;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /** Ghi nhật ký. Lỗi ghi chỉ cảnh báo ra log, không làm hỏng thao tác chính. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.insert({
        ...entry,
        userEmail: entry.userEmail?.slice(0, 255) ?? null,
        target: entry.target?.slice(0, 255) ?? null,
        errorMessage: entry.errorMessage?.slice(0, 500) ?? null,
      });
    } catch (err) {
      this.logger.warn(
        `Không ghi được nhật ký "${entry.action}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Mới nhất trước, phân trang theo trang. */
  async list(page = 1, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
    return { items, total, page: Math.max(page, 1), limit: take };
  }
}
