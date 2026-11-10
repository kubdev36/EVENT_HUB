import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuditInterceptor, type AuditRequest } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';

/**
 * Ghi nhật ký request bị giới hạn tốc độ (429). ThrottlerGuard chặn trước interceptor,
 * nên AuditInterceptor không thấy các request này (vd. dò mật khẩu quá số lần).
 */
@Catch(ThrottlerException)
export class AuditThrottleFilter implements ExceptionFilter {
  constructor(private readonly audit: AuditService) {}

  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<AuditRequest>();
    void this.audit.record({
      ...AuditInterceptor.describe(req),
      statusCode: 429,
      success: false,
      errorMessage: 'Quá số lần cho phép (giới hạn tốc độ)',
    });
    http.getResponse<Response>().status(429).json(exception.getResponse());
  }
}
