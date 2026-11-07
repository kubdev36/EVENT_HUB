import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { parseCorsOrigins } from './config/env.validation.js';

// Protect process from undici socket termination assertions in Node.js
process.on('uncaughtException', (err: any) => {
  if (
    err?.code === 'ERR_ASSERTION' &&
    (err?.stack?.includes('undici') || err?.message?.includes('false == true'))
  ) {
    console.warn(
      '⚠️ [Undici Suppressed] Socket assertion error on connection close:',
      err.message,
    );
    return;
  }
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  // CSP mặc định của helmet chặn script inline của Swagger UI, nên chỉ tắt CSP khi có /docs (dev).
  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
  app.enableCors({ origin: parseCorsOrigins(process.env.CORS_ORIGINS) });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Tài liệu API chỉ mở khi không phải production.
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Event Hub API')
      .setDescription(
        'API docs for auth, users, settings, crawlers, and events',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}

void bootstrap();
