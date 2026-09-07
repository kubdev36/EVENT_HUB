import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Role } from '../../auth/enums/role.enum.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CrawlerService } from '../../crawlers/service/crawler.service.js';
import { SaveCrawlerSourcesDto } from '../dto/crawler-sources.dto.js';
import { SaveKeywordRulesDto } from '../dto/keyword-rules.dto.js';
import { RunCrawlerDto } from '../dto/run-crawler.dto.js';
import { TelegramConfigDto } from '../dto/telegram-config.dto.js';
import { SettingsService } from '../service/settings.service.js';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly crawlerService: CrawlerService,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all settings' })
  async getSettings() {
    return this.settingsService.getAllSettings();
  }

  @Post('crawlers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Save crawler targets' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['targets'],
      properties: {
        targets: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'targetUrls'],
            properties: {
              id: { type: 'string', example: 'cellphones' },
              name: { type: 'string', example: 'CellphoneS' },
              type: { type: 'string', enum: ['web', 'facebook'], example: 'web' },
              logo: { type: 'string', example: '/img/mtm.jpg' },
              enabled: { type: 'boolean', example: true },
              interval: { type: 'string', example: '6h' },
              targetUrls: {
                type: 'array',
                items: { type: 'string' },
                example: ['https://cellphones.com.vn/danh-sach-khuyen-mai'],
              },
            },
          },
          example: [
            {
              id: 'cellphones',
              name: 'CellphoneS',
              type: 'web',
              logo: '/img/mtm.jpg',
              enabled: true,
              interval: '6h',
              targetUrls: ['https://cellphones.com.vn/danh-sach-khuyen-mai'],
            },
            {
              id: 'hoangha',
              name: 'HoangHa Mobile',
              type: 'web',
              enabled: true,
              interval: '6h',
              targetUrls: ['https://hoanghamobile.com/tin-tuc/category/khuyen-mai/'],
            },
            {
              id: 'fb-cellphones',
              name: 'CellphoneS FB',
              type: 'facebook',
              enabled: false,
              interval: '6h',
              targetUrls: ['https://facebook.com/CellphoneSVietnam'],
            },
          ],
        },
      },
    },
  })
  async updateCrawlers(@Body() data: SaveCrawlerSourcesDto) {
    return this.settingsService.saveSetting('crawler_sources', data);
  }

  @Post('telegram')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Save telegram config' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['botToken', 'chatId'],
      properties: {
        botToken: { type: 'string', example: '123456:ABC-DEF...' },
        chatId: { type: 'string', example: '-1001234567890' },
        notifyImmediately: { type: 'boolean', example: true },
        includeImage: { type: 'boolean', example: true },
      },
    },
  })
  async updateTelegram(@Body() data: TelegramConfigDto) {
    return this.settingsService.saveSetting('telegram_config', data);
  }

  @Post('telegram/test')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Test telegram config' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['botToken', 'chatId'],
      properties: {
        botToken: { type: 'string', example: '123456:ABC-DEF...' },
        chatId: { type: 'string', example: '-1001234567890' },
        notifyImmediately: { type: 'boolean', example: true },
        includeImage: { type: 'boolean', example: true },
      },
    },
  })
  async testTelegram(@Body() data: TelegramConfigDto) {
    return this.settingsService.testTelegramMessage(data);
  }

  @Post('keywords')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Save keyword rules' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['rules'],
      properties: {
        rules: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'keywords'],
            properties: {
              type: { type: 'string', example: 'sale' },
              label: { type: 'string', example: 'Khuyen mai' },
              keywords: { type: 'string', example: 'sale, giam gia, uu dai' },
            },
          },
        },
      },
    },
  })
  async updateKeywords(@Body() data: SaveKeywordRulesDto) {
    return this.settingsService.saveSetting('keyword_rules', data);
  }

  @Post('departments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Save department rules' })
  async updateDepartments(@Body() data: any) {
    return this.settingsService.saveSetting('department_rules', data);
  }

  @Post('crawler/run')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Run one crawler target by body id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', example: 'cellphones' },
      },
    },
  })
  async triggerCrawl(@Body() body: RunCrawlerDto) {
    const target = await this.settingsService.getCrawlerTarget(body.id);
    return this.crawlerService.crawlSource(target);
  }

  @Post('crawler/run/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Run one crawler target by path id' })
  @ApiParam({ name: 'id', type: String })
  async triggerCrawlByParam(@Param('id') id: string) {
    const target = await this.settingsService.getCrawlerTarget(id);
    return this.crawlerService.crawlSource(target);
  }
}
