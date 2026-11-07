import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../auth/enums/role.enum.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { DashboardService } from './dashboard.service.js';
import {
  BreakdownQueryDto,
  DashboardFilterDto,
  EventListQueryDto,
} from './dto/dashboard-query.dto.js';

type AuthedRequest = {
  user?: {
    id: string;
    email: string;
    role: string;
    department?: string | null;
  };
};

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Chỉ số tổng: kỳ này, kỳ trước, theo hãng, khuyến mãi, tình trạng nguồn',
  })
  async summary(@Query() q: DashboardFilterDto, @Request() req: AuthedRequest) {
    return this.dashboard.summary(
      await this.dashboard.resolveFilter(q, req.user),
    );
  }

  @Get('timeseries')
  @ApiOperation({ summary: 'Số bài mỗi ngày theo hãng (giờ Việt Nam)' })
  async timeseries(
    @Query() q: DashboardFilterDto,
    @Request() req: AuthedRequest,
  ) {
    return this.dashboard.timeseries(
      await this.dashboard.resolveFilter(q, req.user),
    );
  }

  @Get('breakdown')
  @ApiOperation({ summary: 'Phân rã theo loại, thứ + giờ, hoặc tuần' })
  async breakdown(
    @Query() q: BreakdownQueryDto,
    @Request() req: AuthedRequest,
  ) {
    return this.dashboard.breakdown(
      await this.dashboard.resolveFilter(q, req.user),
      q.by,
    );
  }

  @Get('events')
  @ApiOperation({
    summary: 'Danh sách bài, mới nhất trước, phân trang bằng con trỏ',
  })
  async events(@Query() q: EventListQueryDto, @Request() req: AuthedRequest) {
    return this.dashboard.list(
      await this.dashboard.resolveFilter(q, req.user),
      q.limit ?? 20,
      q.cursor,
    );
  }
}
