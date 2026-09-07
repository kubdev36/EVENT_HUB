import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../auth/enums/role.enum.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List latest events' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(@Query('limit') limit?: string, @Request() req?: any) {
    return this.eventsService.findLatest(limit ? Number(limit) : 50, req?.user);
  }

  @Get('latest')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List latest events with smaller default limit' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findLatest(@Query('limit') limit?: string, @Request() req?: any) {
    return this.eventsService.findLatest(limit ? Number(limit) : 20, req?.user);
  }

  @Get('overview')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get overview data for FE' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getOverviewData(@Query('limit') limit?: string, @Request() req?: any) {
    return this.eventsService.getDashboardData(limit ? Number(limit) : 500, req?.user);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Alias for overview data' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getDashboardData(@Query('limit') limit?: string, @Request() req?: any) {
    return this.eventsService.getDashboardData(limit ? Number(limit) : 500, req?.user);
  }

  @Get('by-date')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get events by date' })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEventsByDate(@Query('date') date?: string, @Query('limit') limit?: string, @Request() req?: any) {
    return this.eventsService.getEventsByDate(date, limit ? Number(limit) : 500, req?.user);
  }

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
