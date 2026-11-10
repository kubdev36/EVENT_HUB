import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { Role } from '../../auth/enums/role.enum.js';
import { CrawlQueueService } from '../../queue/crawl-queue.service.js';
import { CrawlSourceReader } from '../sources/crawl-source.reader.js';
import { CrawlerService } from '../service/crawler.service.js';

@ApiTags('crawlers')
@ApiBearerAuth()
@Controller('crawlers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrawlerController {
  constructor(
    private readonly crawlerService: CrawlerService,
    private readonly queue: CrawlQueueService,
    private readonly sources: CrawlSourceReader,
  ) {}

  @Get('runs')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get recent crawler execution logs' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRuns(@Query('limit') limit?: string) {
    return this.crawlerService.getRecentRuns(limit ? Number(limit) : 50);
  }

  // Chạy crawl gửi request ra ngoài và ghi DB: chỉ admin, chỉ qua POST.
  // API chỉ đẩy việc vào hàng đợi; worker cào và ghi kết quả vào crawler_runs.
  @Post('run')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xếp hàng cào mọi nguồn đang bật' })
  async runAll() {
    const targets = await this.crawlerService.enabledTargets();
    return {
      status: 'queued',
      ...(await this.queue.enqueue(targets.map((t) => t.id))),
    };
  }

  @Post('run/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xếp hàng cào một nguồn' })
  @ApiParam({ name: 'id', type: String })
  async runOne(@Param('id') id: string) {
    const target = await this.sources.getTargetById(id);
    return { status: 'queued', ...(await this.queue.enqueue([target.id])) };
  }
}
