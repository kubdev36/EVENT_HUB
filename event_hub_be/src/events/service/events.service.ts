import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { NotificationOutboxService } from '../../notifications/notification-outbox.service.js';
import { CreateEventDto } from '../dto/create-event.dto.js';
import { Event } from '../entity/event.entity.js';
import { Setting } from '../../settings/entity/setting.entity.js';
import { Role } from '../../auth/enums/role.enum.js';
import { expandEventType } from '../event-types.js';

type RequestUser = {
  id: string;
  email: string;
  role: Role;
  department?: string | null;
};

type DepartmentRule = {
  type?: string;
  departments?: string[];
};

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly outbox: NotificationOutboxService,
  ) {}

  async createManualEvent(data: CreateEventDto, user?: RequestUser) {
    const allowedTypes = await this.getAllowedTypes(user);
    if (allowedTypes && !allowedTypes.includes(data.type)) {
      throw new ForbiddenException(
        'Ban khong co quyen tao su kien cho bo phan nay.',
      );
    }

    const sourceId = data.sourceId || 'minhtuan';
    const sourceName =
      data.sourceName ||
      (sourceId === 'minhtuan' ? 'Minh Tuấn Mobile' : 'Manual');
    const now = new Date();
    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const event = this.eventRepository.create({
      sourceId,
      sourceName,
      origin: 'manual',
      sourceUrl: data.url || '',
      title: data.title,
      description: data.description ?? null,
      image: data.image ?? null,
      url: data.url || '',
      eventDate: data.eventDate ? new Date(data.eventDate) : now,
      eventTime: data.eventTime ?? defaultTime,
      type: data.type,
      rawData: { origin: 'manual' },
      contentHash: this.buildManualContentHash(
        sourceId,
        data.url || '',
        data.title,
        now,
      ),
      firstSeenAt: now,
      lastSeenAt: now,
      notifiedAt: null,
    });

    // Lưu bài và thông báo chờ gửi trong cùng transaction.
    return this.eventRepository.manager.transaction(async (m) => {
      const saved = await m.save(Event, event);
      await this.outbox.enqueue([saved.id], m);
      return saved;
    });
  }

  private buildManualContentHash(
    sourceId: string,
    url: string,
    title: string,
    createdAt: Date,
  ): string {
    return createHash('sha256')
      .update(
        `manual|${sourceId}|${url.trim().toLowerCase()}|${title.trim().toLowerCase()}|${createdAt.getTime()}`,
      )
      .digest('hex');
  }

  /** null = xem tất cả (chỉ admin). Thiếu user hoặc role lạ thì từ chối (mảng rỗng). */
  async getAllowedTypes(user?: RequestUser): Promise<string[] | null> {
    if (user?.role === Role.ADMIN) {
      return null;
    }
    if (!user || user.role !== Role.STAFF) {
      return [];
    }

    const department = this.normalizeDepartment(user.department);
    if (!department) {
      return [];
    }

    const setting = await this.settingRepository.findOne({
      where: { key: 'department_rules' },
    });
    const rules = Array.isArray(setting?.value)
      ? (setting.value as DepartmentRule[])
      : [];
    const configuredTypes = rules
      .filter((rule) =>
        (rule.departments || [])
          .map((item) => this.normalizeDepartment(item))
          .includes(department),
      )
      .map((rule) => String(rule.type || '').trim())
      .filter(Boolean);

    return Array.from(
      new Set(configuredTypes.flatMap((type) => expandEventType(type))),
    );
  }

  private normalizeDepartment(value?: string | null): string {
    const normalized = (value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');

    if (['marketing', 'marketting', 'mkt'].includes(normalized)) return 'mkt';
    if (['sale', 'sales', 'kinh_doanh', 'kinhdoanh', 'kd'].includes(normalized))
      return 'kinh_doanh';

    return normalized;
  }
}
