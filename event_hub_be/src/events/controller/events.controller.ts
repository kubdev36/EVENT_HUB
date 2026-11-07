import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { Role } from '../../auth/enums/role.enum.js';
import { CreateEventDto } from '../dto/create-event.dto.js';
import { EventsService } from '../service/events.service.js';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // Đọc dữ liệu event: dùng /dashboard/* (lọc bằng SQL, phân quyền trong truy vấn).

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Create manual event' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'title'],
      properties: {
        type: { type: 'string', example: 'release' },
        title: { type: 'string', example: 'Samsung ra mat Galaxy S26' },
        description: { type: 'string', example: 'Su kien ra mat san pham moi' },
        eventDate: { type: 'string', example: '2026-08-28T14:00:00.000Z' },
        eventTime: { type: 'string', example: '14:00' },
        image: { type: 'string', example: 'https://example.com/image.jpg' },
        url: { type: 'string', example: 'https://example.com/event' },
      },
    },
  })
  async create(@Body() body: CreateEventDto, @Request() req?: any) {
    return this.eventsService.createManualEvent(body, req?.user);
  }
}
