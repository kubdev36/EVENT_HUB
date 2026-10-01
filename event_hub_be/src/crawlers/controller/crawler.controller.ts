import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { Role } from '../../auth/enums/role.enum.js';
import { CrawlerService } from '../service/crawler.service.js';

@ApiTags('crawlers')
@ApiBearerAuth()
@Controller('crawlers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrawlerController {
  constructor(private readonly crawlerService: CrawlerService) {}

  @Get('runs')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get recent crawler execution logs' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRuns(@Query('limit') limit?: string) {
    return this.crawlerService.getRecentRuns(limit ? Number(limit) : 50);
  }

  @Get('run')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Run all enabled crawler targets' })
  async runAll() {
    return this.crawlerService.crawlAllTargets();
  }

  @Post('run')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Run all enabled crawler targets (supports async background mode)' })
  @ApiQuery({ name: 'async', required: false, type: Boolean, description: 'Run in background non-blocking' })
  async runAllPost(@Query('async') isAsync?: string) {
    if (isAsync === 'true' || isAsync === '1') {
      void this.crawlerService.crawlAllTargets().catch((err) => {
        console.error('[Background Crawler] Error running crawler targets:', err);
      });
      return {
        message: 'Crawler background job started successfully.',
        status: 'running',
        timestamp: new Date().toISOString(),
      };
    }
    return this.crawlerService.crawlAllTargets();
  }

  @Post('run/:id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Run one crawler target by id (supports async background mode)' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'async', required: false, type: Boolean, description: 'Run in background non-blocking' })
  async runOne(@Param('id') id: string, @Query('async') isAsync?: string) {
    if (isAsync === 'true' || isAsync === '1') {
      void this.crawlerService.crawlTargetById(id).catch((err) => {
        console.error(`[Background Crawler] Error running target ${id}:`, err);
      });
      return {
        message: `Crawler target ${id} started in background.`,
        status: 'running',
        targetId: id,
        timestamp: new Date().toISOString(),
      };
    }
    return this.crawlerService.crawlTargetById(id);
  }
}
